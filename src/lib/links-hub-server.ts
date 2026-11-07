import { randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { nextVisitorState, type Evidence, type MatchSource, type VisitorStatus } from '@/lib/links-hub';

type Db = ReturnType<typeof createServiceClient>;

export const newInviteToken = () => randomBytes(16).toString('base64url');

// Existing Visby records for an email. Used to mark a contact as already known, never to link a visitor.
export async function priorRecords(db: Db, email: string): Promise<string[]> {
  const [pl, inv] = await Promise.all([
    db.from('prelaunch_signups').select('id', { count: 'exact', head: true }).eq('email', email),
    db.from('investor_inquiries').select('id', { count: 'exact', head: true }).eq('email', email),
  ]);
  const out: string[] = [];
  if ((pl.count ?? 0) > 0) out.push('prelaunch');
  if ((inv.count ?? 0) > 0) out.push('investor_inquiry');
  return out;
}

type ContactRow = { id: string; email: string; name: string | null; is_student: boolean | null; sources: string[]; prior_records: string[] };

export async function upsertContact(db: Db, c: { email: string; name?: string | null; isStudent?: boolean }, source: MatchSource): Promise<ContactRow | null> {
  const { data: existing } = await db.from('hub_contacts').select('*').eq('email', c.email).maybeSingle();
  const prior = await priorRecords(db, c.email);
  const studentPatch = c.isStudent === undefined ? {} : { is_student: c.isStudent };

  if (existing) {
    const { data } = await db.from('hub_contacts').update({
      name: existing.name ?? c.name ?? null,
      sources: Array.from(new Set([...(existing.sources ?? []), source])),
      prior_records: Array.from(new Set([...(existing.prior_records ?? []), ...prior])),
      last_seen: new Date().toISOString(),
      ...studentPatch,
    }).eq('id', existing.id).select('*').single();
    return (data as ContactRow) ?? (existing as ContactRow);
  }

  const { data, error } = await db.from('hub_contacts').insert({
    email: c.email, name: c.name ?? null, sources: [source], prior_records: prior, ...studentPatch,
  }).select('*').single();
  if (error?.code === '23505') return upsertContact(db, c, source);
  return (data as ContactRow) ?? null;
}

export async function recordMatch(db: Db, m: {
  contactId: string | null; visitorId?: string | null; sessionId?: string | null; source: MatchSource; evidence: Evidence; email?: string | null;
}) {
  await db.from('hub_identity_matches').insert({
    contact_id: m.contactId, visitor_id: m.visitorId ?? null, session_id: m.sessionId ?? null,
    source: m.source, evidence: m.evidence, email: m.email ?? null,
  });
}

export async function linkVisitor(db: Db, visitorId: string, contactId: string, status: 'self_reported' | 'known_contact'): Promise<VisitorStatus> {
  const { data: cur } = await db.from('hub_visitors').select('contact_id, status').eq('id', visitorId).maybeSingle();
  if (!cur) return 'anonymous';
  const next = nextVisitorState({ contactId: cur.contact_id, status: cur.status as VisitorStatus }, { contactId, status });
  await db.from('hub_visitors').update({ contact_id: next.contactId, status: next.status }).eq('id', visitorId);
  return next.status;
}

// Optional CRM mirror. Only runs when HUBSPOT_PRIVATE_APP_TOKEN is set; failures never affect the hub.
export async function syncHubSpot(email: string) {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token) return;
  try {
    await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: [{ idProperty: 'email', id: email, properties: { email } }] }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.error('[links] hubspot sync failed', (e as Error).message);
  }
}
