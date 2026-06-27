export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';
import { logSecurityEvent } from '@/lib/security-audit';
import { clientIp } from '@/lib/rate-limit';

// Admin-only management of the brand serial-number registry (brands, their serial rules, and per-serial
// flags). Gated exactly like the other admin routes: callerOwnsWallet (proves the Privy token owns the
// wallet) AND isAdminWallet. The registry's read path (checkSerial) is the only other reader; the rules
// themselves are never exposed to anon/auth clients. See supabase/migration_brand_registry.sql.

function badSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703' ||
    !!error.message?.includes('does not exist');
}

async function gate(req: NextRequest, wallet: unknown): Promise<NextResponse | null> {
  if (typeof wallet !== 'string' || !wallet) {
    return NextResponse.json({ error: 'wallet is required' }, { status: 400 });
  }
  if (!(await callerOwnsWallet(req, wallet))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdminRole(wallet, 'authenticator'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

function validRegex(p: unknown): boolean {
  if (typeof p !== 'string' || !p) return false;
  try { new RegExp(p); return true; } catch { return false; }
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get('wallet');
  const denied = await gate(req, wallet);
  if (denied) return denied;

  const supabase = createServiceClient();
  const { data: brands, error } = await supabase
    .from('brand_registry')
    .select('id, slug, display_name, verified, is_active, created_at, brand_serial_rules(id, claim_regex, valid_regex, range_prefix, range_min, range_max, is_active, note)')
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: badSchema(error) ? 'Registry not migrated yet' : 'Lookup failed' },
      { status: badSchema(error) ? 503 : 500 });
  }
  return NextResponse.json({ brands: brands ?? [] });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const denied = await gate(req, body.wallet);
  if (denied) return denied;

  const wallet = body.wallet as string;
  const action = body.action;
  const supabase = createServiceClient();

  if (action === 'add_brand') {
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const display_name = typeof body.display_name === 'string' ? body.display_name.trim() : '';
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
      return NextResponse.json({ error: 'slug must be 2–40 chars of a–z, 0–9, hyphen' }, { status: 400 });
    }
    if (display_name.length < 1 || display_name.length > 80) {
      return NextResponse.json({ error: 'display_name must be 1–80 chars' }, { status: 400 });
    }
    const { data, error } = await supabase.from('brand_registry').insert({
      slug, display_name,
      verified: body.verified === true,
      contact_email: typeof body.contact_email === 'string' ? body.contact_email : null,
    }).select('id').maybeSingle();
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'A brand with that slug already exists' }, { status: 409 });
      return NextResponse.json({ error: badSchema(error) ? 'Registry not migrated yet' : error.message },
        { status: badSchema(error) ? 503 : 500 });
    }
    void logSecurityEvent({ wallet, event: 'brand_registry_updated', detail: { action: 'add_brand', slug, display_name, brand_id: data?.id }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
    return NextResponse.json({ ok: true, brand_id: data?.id });
  }

  if (action === 'add_rule') {
    const brand_id = typeof body.brand_id === 'string' ? body.brand_id : '';
    if (!brand_id) return NextResponse.json({ error: 'brand_id is required' }, { status: 400 });
    if (!validRegex(body.claim_regex)) return NextResponse.json({ error: 'claim_regex must be a valid regular expression' }, { status: 400 });
    if (body.valid_regex != null && !validRegex(body.valid_regex)) {
      return NextResponse.json({ error: 'valid_regex must be a valid regular expression' }, { status: 400 });
    }
    const { data, error } = await supabase.from('brand_serial_rules').insert({
      brand_id,
      claim_regex:  body.claim_regex,
      valid_regex:  typeof body.valid_regex === 'string' ? body.valid_regex : null,
      range_prefix: typeof body.range_prefix === 'string' ? body.range_prefix : null,
      range_min:    body.range_min != null ? String(body.range_min) : null,
      range_max:    body.range_max != null ? String(body.range_max) : null,
      note:         typeof body.note === 'string' ? body.note : null,
    }).select('id').maybeSingle();
    if (error) {
      if (error.code === '23503') return NextResponse.json({ error: 'Unknown brand_id' }, { status: 400 });
      return NextResponse.json({ error: badSchema(error) ? 'Registry not migrated yet' : error.message },
        { status: badSchema(error) ? 503 : 500 });
    }
    void logSecurityEvent({ wallet, event: 'brand_registry_updated', detail: { action: 'add_rule', brand_id, rule_id: data?.id }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
    return NextResponse.json({ ok: true, rule_id: data?.id });
  }

  if (action === 'flag_serial') {
    const brand_id = typeof body.brand_id === 'string' ? body.brand_id : '';
    const serial_number = typeof body.serial_number === 'string' ? body.serial_number.trim() : '';
    const flag = body.flag;
    if (!brand_id || !serial_number) return NextResponse.json({ error: 'brand_id and serial_number are required' }, { status: 400 });
    if (flag !== 'revoked' && flag !== 'stolen' && flag !== 'recalled' && flag !== 'allow') {
      return NextResponse.json({ error: "flag must be one of: revoked, stolen, recalled, allow" }, { status: 400 });
    }
    const { error } = await supabase.from('brand_serial_flags').upsert({
      brand_id, serial_number, flag,
      note: typeof body.note === 'string' ? body.note : null,
    });
    if (error) {
      if (error.code === '23503') return NextResponse.json({ error: 'Unknown brand_id' }, { status: 400 });
      return NextResponse.json({ error: badSchema(error) ? 'Registry not migrated yet' : error.message },
        { status: badSchema(error) ? 503 : 500 });
    }
    void logSecurityEvent({ wallet, event: 'brand_serial_flagged', detail: { serial: serial_number, brand: brand_id, flag }, ip: clientIp(req), user_agent: req.headers.get('user-agent') });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'action must be one of: add_brand, add_rule, flag_serial' }, { status: 400 });
}
