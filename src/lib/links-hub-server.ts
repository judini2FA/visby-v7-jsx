import { randomBytes } from 'crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { nextVisitorState, type Evidence, type MatchSource, type ProviderIdentity, type VisitorStatus } from '@/lib/links-hub';

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

type ContactRow = { id: string; email: string | null; linkedin_url: string | null; name: string | null; company: string | null; title: string | null; sources: string[]; prior_records: string[] };

// Dedup key order: email, then LinkedIn URL. A provider hit without either is not stored as a person.
export async function upsertContact(db: Db, id: Partial<ProviderIdentity> & { email: string | null }, source: MatchSource): Promise<ContactRow | null> {
  const linkedin = id.linkedin ?? null;
  if (!id.email && !linkedin) return null;

  let existing: ContactRow | null = null;
  if (id.email) existing = (await db.from('hub_contacts').select('*').eq('email', id.email).maybeSingle()).data as ContactRow | null;
  if (!existing && linkedin) existing = (await db.from('hub_contacts').select('*').eq('linkedin_url', linkedin).maybeSingle()).data as ContactRow | null;

  const prior = id.email ? await priorRecords(db, id.email) : [];
  const now = new Date().toISOString();

  if (existing) {
    const patch = {
      email: existing.email ?? id.email,
      linkedin_url: existing.linkedin_url ?? linkedin,
      name: existing.name ?? id.name ?? null,
      company: existing.company ?? id.company ?? null,
      title: existing.title ?? id.title ?? null,
      sources: Array.from(new Set([...(existing.sources ?? []), source])),
      prior_records: Array.from(new Set([...(existing.prior_records ?? []), ...prior])),
      last_seen: now,
    };
    const { data } = await db.from('hub_contacts').update(patch).eq('id', existing.id).select('*').single();
    return (data as ContactRow) ?? existing;
  }

  const { data, error } = await db.from('hub_contacts').insert({
    email: id.email, linkedin_url: linkedin, name: id.name ?? null, company: id.company ?? null, title: id.title ?? null,
    sources: [source], prior_records: prior,
  }).select('*').single();
  if (error?.code === '23505') return upsertContact(db, id, source);
  return (data as ContactRow) ?? null;
}

export async function recordMatch(db: Db, m: {
  contactId: string | null; visitorId?: string | null; sessionId?: string | null; source: MatchSource; evidence: Evidence;
  email?: string | null; capturedUrl?: string | null; payload?: unknown;
}) {
  await db.from('hub_identity_matches').insert({
    contact_id: m.contactId, visitor_id: m.visitorId ?? null, session_id: m.sessionId ?? null,
    source: m.source, evidence: m.evidence, email: m.email ?? null, captured_url: m.capturedUrl ?? null, payload: m.payload ?? null,
  });
}

export async function linkVisitor(db: Db, visitorId: string, contactId: string, status: 'provider_match' | 'known_contact' | 'authenticated'): Promise<VisitorStatus> {
  const { data: cur } = await db.from('hub_visitors').select('contact_id, status').eq('id', visitorId).maybeSingle();
  if (!cur) return 'anonymous';
  const next = nextVisitorState({ contactId: cur.contact_id, status: cur.status as VisitorStatus }, { contactId, status });
  await db.from('hub_visitors').update({ contact_id: next.contactId, status: next.status }).eq('id', visitorId);
  return next.status;
}

// Optional CRM mirror. Only runs when HUBSPOT_PRIVATE_APP_TOKEN is set; failures never affect the hub.
export async function syncHubSpot(c: { email: string | null; name: string | null; company: string | null; title: string | null; source: string }) {
  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!token || !c.email) return;
  const [firstname, ...rest] = (c.name ?? '').split(' ');
  const properties: Record<string, string> = { email: c.email };
  if (firstname) properties.firstname = firstname;
  if (rest.length) properties.lastname = rest.join(' ');
  if (c.company) properties.company = c.company;
  if (c.title) properties.jobtitle = c.title;
  try {
    await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: [{ idProperty: 'email', id: c.email, properties }] }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.error('[links] hubspot sync failed', (e as Error).message);
  }
}
