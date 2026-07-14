export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { setBusinessAccount } from '@/lib/business';
import { verifyBusinessKyb, einLooksValid, manualBusinessReview } from '@/lib/kyb';
import type { ShipTo } from '@/components/address-form';

// A supabase error means "migration_business_verification.sql hasn't been run yet" when the table
// doesn't exist. Reads degrade to a safe default; writes surface as 503 — same pattern as
// /api/merchant and /api/business/bulk-serials.
function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (['42P01', 'PGRST205'].includes(error.code ?? '')) return true;
  return !!error.message?.includes('does not exist');
}

const EIN_RE = /^(\d{2}-\d{7}|\d{9})$/;

function normalizeEin(raw: string): string | null {
  const v = raw.trim();
  return EIN_RE.test(v) ? v : null;
}

function isValidAddress(v: unknown): v is ShipTo {
  if (!v || typeof v !== 'object') return false;
  const a = v as Partial<ShipTo>;
  return !!(a.line1?.trim() && a.city?.trim() && a.state?.trim() && a.postal?.trim());
}

function isValidWebsite(raw: string): boolean {
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const wallet: string | undefined = body?.wallet;
  if (!wallet || !ctx.wallets.includes(wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`business-verification:${ctx.userId}`, { limit: 5, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const legal_name = (body?.legal_name as string | undefined)?.trim();
  const einRaw = (body?.ein as string | undefined)?.trim();
  const business_type = (body?.business_type as string | undefined)?.trim();
  const business_address = body?.business_address;
  const websiteRaw = (body?.website as string | undefined)?.trim();
  const doc_url = (body?.doc_url as string | undefined)?.trim();

  if (!legal_name || legal_name.length < 2 || legal_name.length > 200) {
    return NextResponse.json({ error: 'Enter the business legal name' }, { status: 400 });
  }
  if (!business_type || business_type.length < 2 || business_type.length > 80) {
    return NextResponse.json({ error: 'Select a business type' }, { status: 400 });
  }
  const ein = einRaw ? normalizeEin(einRaw) : null;
  if (!einRaw || !ein) {
    return NextResponse.json({ error: 'EIN must be formatted XX-XXXXXXX or 9 digits' }, { status: 400 });
  }
  if (!isValidAddress(business_address)) {
    return NextResponse.json({ error: 'Enter a complete business address (street, city, state, ZIP)' }, { status: 400 });
  }
  if (websiteRaw && !isValidWebsite(websiteRaw)) {
    return NextResponse.json({ error: 'Website must be a valid URL' }, { status: 400 });
  }

  // Resolve the outcome up front. A keyed KYB provider gives the real verdict; with none configured
  // we fall back to attestation — a complete, well-formed submission with a plausible EIN auto-approves.
  // An EIN that only fails the conservative local check goes to manual review, never an auto-reject.
  const verdict = await verifyBusinessKyb({ legal_name, ein, address: business_address });
  const status: 'pending' | 'approved' | 'rejected' =
    manualBusinessReview()       ? 'pending' :
    verdict === 'verified'       ? 'approved' :
    verdict === 'failed'         ? 'rejected' :
    verdict === 'unconfigured'   ? (einLooksValid(ein) ? 'approved' : 'pending') :
    /* 'review' */                 'pending';

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('business_verifications')
    .upsert(
      {
        wallet,
        legal_name,
        ein,
        business_type,
        business_address,
        website: websiteRaw || null,
        doc_url: doc_url || null,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'wallet' },
    )
    .select('id,wallet,legal_name,business_type,status,created_at,updated_at')
    .single();

  if (error) {
    if (isMissingSchema(error)) {
      return NextResponse.json({ error: 'Business verification is not available yet' }, { status: 503 });
    }
    console.error('[business/verification] upsert error:', error);
    return NextResponse.json({ error: 'Could not submit verification' }, { status: 500 });
  }

  if (status === 'approved') {
    const set = await setBusinessAccount(wallet, true);
    if (!set.ok) return NextResponse.json({ error: 'Verified, but switching your account failed — retry' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, verification: data, status });
}

export async function GET(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet');
  if (!wallet || !ctx.wallets.includes(wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const [verRes, profileRes] = await Promise.all([
    supabase
      .from('business_verifications')
      .select('id,wallet,legal_name,ein,business_type,business_address,website,doc_url,status,created_at,updated_at')
      .eq('wallet', wallet)
      .maybeSingle(),
    supabase.from('profiles').select('self_ship').eq('wallet', wallet).maybeSingle(),
  ]);

  if (verRes.error && !isMissingSchema(verRes.error)) {
    console.error('[business/verification] GET error:', verRes.error);
  }

  return NextResponse.json({
    verification: isMissingSchema(verRes.error) ? null : (verRes.data ?? null),
    self_ship: profileRes.data?.self_ship ?? false,
  });
}

// Self-ship toggle lives on profiles (not this table). Settings has no existing server-persisted
// toggle mechanism to piggyback on, so this route owns the write — gated to business accounts only,
// same ownership check as everything else here.
export async function PATCH(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx || !ctx.wallets.length) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const wallet: string | undefined = body?.wallet;
  if (!wallet || !ctx.wallets.includes(wallet)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (typeof body?.self_ship !== 'boolean') return NextResponse.json({ error: 'self_ship must be a boolean' }, { status: 400 });

  const rl = await rateLimit(`business-self-ship:${ctx.userId}`, { limit: 30, windowSec: 3600 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const supabase = createServiceClient();
  const { data: profile } = await supabase.from('profiles').select('account_type').eq('wallet', wallet).maybeSingle();
  if ((profile?.account_type ?? 'personal') !== 'business') {
    return NextResponse.json({ error: 'Self-shipping is only available on business accounts' }, { status: 403 });
  }

  const { error } = await supabase.from('profiles').update({ self_ship: body.self_ship }).eq('wallet', wallet);
  if (error) {
    if (isMissingSchema(error)) return NextResponse.json({ error: 'Not available yet' }, { status: 503 });
    console.error('[business/verification] PATCH self_ship error:', error);
    return NextResponse.json({ error: 'Could not update' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, self_ship: body.self_ship });
}
