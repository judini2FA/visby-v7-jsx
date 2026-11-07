export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { isAdminRole } from '@/lib/admin';
import { createServiceClient } from '@/lib/supabase/service';
import { HUB_SECTIONS } from '@/lib/links-config';
import { cleanEmail, isUuid } from '@/lib/links-hub';
import { newInviteToken, upsertContact } from '@/lib/links-hub-server';

async function allowed(req: Request, wallet: unknown): Promise<boolean> {
  return typeof wallet === 'string' && (await isAdminRole(wallet, 'super_admin')) && (await callerOwnsWallet(req, wallet));
}

const IDENTIFYING = new Set(['authenticated', 'first_party_record', 'provider_match']);

export async function GET(req: Request) {
  if (!(await allowed(req, new URL(req.url).searchParams.get('wallet')))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const db = createServiceClient();
  const [visitors, contacts, matches, clicks, visits, invites, sessions] = await Promise.all([
    db.from('hub_visitors').select('id, contact_id, status, visits, first_seen, last_seen, vendor_optout').order('last_seen', { ascending: false }).limit(5000),
    db.from('hub_contacts').select('*').order('last_seen', { ascending: false }).limit(5000),
    db.from('hub_identity_matches').select('contact_id, visitor_id, source, evidence, created_at').limit(20000),
    db.from('hub_events').select('visitor_id, link_id').eq('type', 'click').limit(50000),
    db.from('hub_events').select('id', { count: 'exact', head: true }).eq('type', 'visit'),
    db.from('hub_invites').select('id, token, label, contact_id, uses, last_used_at, revoked_at, created_at').order('created_at', { ascending: false }).limit(500),
    db.from('hub_sessions').select('visitor_id, campaign').not('campaign', 'is', null).limit(20000),
  ]);
  if (visitors.error) return NextResponse.json({ migrated: false });

  const vrows = visitors.data ?? [];
  const crows = contacts.data ?? [];
  const mrows = matches.data ?? [];

  const visitorsByContact = new Map<string, typeof vrows>();
  for (const v of vrows) if (v.contact_id) visitorsByContact.set(v.contact_id, [...(visitorsByContact.get(v.contact_id) ?? []), v]);
  const clicksByVisitor = new Map<string, string[]>();
  const clickCounts: Record<string, number> = {};
  for (const c of clicks.data ?? []) {
    if (!c.link_id) continue;
    clickCounts[c.link_id] = (clickCounts[c.link_id] ?? 0) + 1;
    clicksByVisitor.set(c.visitor_id, [...(clicksByVisitor.get(c.visitor_id) ?? []), c.link_id]);
  }
  const identifiedContactIds = new Set<string>();
  for (const m of mrows) if (m.contact_id && IDENTIFYING.has(m.evidence)) identifiedContactIds.add(m.contact_id);
  for (const v of vrows) if (v.contact_id) identifiedContactIds.add(v.contact_id);

  const campaigns: Record<string, number> = {};
  for (const s of sessions.data ?? []) if (s.campaign) campaigns[s.campaign] = (campaigns[s.campaign] ?? 0) + 1;

  const contactRows = crows.map(c => {
    const vs = visitorsByContact.get(c.id) ?? [];
    const links = Array.from(new Set(vs.flatMap(v => clicksByVisitor.get(v.id) ?? [])));
    const status = vs.some(v => v.status === 'conflict') ? 'conflict'
      : vs.some(v => v.status === 'authenticated') ? 'authenticated'
      : vs.some(v => v.status === 'known_contact') ? 'known_contact'
      : identifiedContactIds.has(c.id) ? 'provider_match' : 'invited';
    return {
      id: c.id, email: c.email, name: c.name, company: c.company, title: c.title, linkedin_url: c.linkedin_url,
      sources: c.sources, prior_records: c.prior_records, status,
      first_seen: c.first_seen, last_seen: c.last_seen,
      visits: vs.reduce((n, v) => n + v.visits, 0), links,
      identified: identifiedContactIds.has(c.id),
    };
  });

  const identified = contactRows.filter(c => c.identified);
  const unique = vrows.length;
  return NextResponse.json({
    migrated: true,
    metrics: {
      totalVisits: visits.count ?? 0,
      uniqueVisitors: unique,
      identifiedVisitors: identified.length,
      identificationRate: unique ? Math.min(1, identified.length / unique) : 0,
      emailsCollected: identified.filter(c => c.email).length,
      returningVisitors: vrows.filter(v => v.visits > 1).length,
      vendorOptOuts: vrows.filter(v => v.vendor_optout).length,
      clicks: clickCounts,
      campaigns,
    },
    links: HUB_SECTIONS.flatMap(s => s.links.map(l => ({ id: l.id, label: l.label }))),
    contacts: contactRows,
    anonymous: vrows.filter(v => !v.contact_id).slice(0, 500).map(v => ({ ...v, links: Array.from(new Set(clicksByVisitor.get(v.id) ?? [])) })),
    invites: invites.data ?? [],
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (!(await allowed(req, body.wallet))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const db = createServiceClient();

  if (body.action === 'create_invite') {
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 120) : '';
    if (!label) return NextResponse.json({ error: 'Label required' }, { status: 400 });
    let contactId: string | null = null;
    if (body.email) {
      const email = cleanEmail(body.email);
      if (!email) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
      contactId = (await upsertContact(db, { email, name: label }, 'invite'))?.id ?? null;
    }
    const { data, error } = await db.from('hub_invites').insert({ token: newInviteToken(), label, contact_id: contactId }).select('*').single();
    if (error) return NextResponse.json({ error: 'Could not create' }, { status: 500 });
    return NextResponse.json({ invite: data });
  }

  if (body.action === 'revoke_invite' && isUuid(body.id)) {
    await db.from('hub_invites').update({ revoked_at: new Date().toISOString() }).eq('id', body.id);
    return NextResponse.json({ ok: true });
  }

  // Erasure: drops the contact and every identity match (cascade), and returns linked visitors to
  // anonymous. Anonymous event history stays (it holds no personal data).
  if (body.action === 'delete_contact' && isUuid(body.id)) {
    await db.from('hub_visitors').update({ contact_id: null, status: 'anonymous' }).eq('contact_id', body.id);
    await db.from('hub_invites').update({ contact_id: null }).eq('contact_id', body.id);
    const { error } = await db.from('hub_contacts').delete().eq('id', body.id);
    if (error) return NextResponse.json({ error: 'Could not delete' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
