export const dynamic = 'force-dynamic';

import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServiceClient } from '@/lib/supabase/service';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { isRefCode } from '@/lib/prelaunch';
import { HUB_LINK_IDS } from '@/lib/links-config';
import {
  SESSION_IDLE_SEC, SID_COOKIE, VID_COOKIE, VISITOR_TTL_SEC,
  classifyUa, isCampaign, isInviteToken, isUuid, referrerHost,
} from '@/lib/links-hub';
import { linkVisitor, recordMatch, upsertContact } from '@/lib/links-hub-server';

// Fire-and-forget beacon from /links. Always answers 200 with no useful error detail: the page never waits
// on it, and analytics failure must not surface to visitors.
export async function POST(req: Request) {
  const ok = (extra: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...extra });

  const ua = req.headers.get('user-agent') ?? '';
  const { device, browser } = classifyUa(ua);
  if (browser === 'bot') return ok();

  const rl = await rateLimit(`links-track:${clientIp(req)}`, { limit: 120, windowSec: 60 });
  if (!rl.allowed) return ok();

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const type = body.type === 'click' ? 'click' : body.type === 'visit' ? 'visit' : null;
  if (!type) return ok();
  const linkId = typeof body.link === 'string' && HUB_LINK_IDS.has(body.link) ? body.link : null;
  if (type === 'click' && !linkId) return ok();
  const campaign = isCampaign(body.c) ? body.c : null;

  const jar = cookies();
  const cookieVid = jar.get(VID_COOKIE)?.value;
  const cookieSid = jar.get(SID_COOKIE)?.value;
  const vid = isUuid(cookieVid) ? cookieVid : randomUUID();
  let newSession = !isUuid(cookieSid) || !isUuid(cookieVid);
  let sid = newSession ? randomUUID() : cookieSid!;

  try {
    const db = createServiceClient();
    // A session cookie can outlive its row (purged by retention, or an earlier write failed); without a
    // live row every event would fail its FK, so start a fresh session instead.
    if (!newSession) {
      const { data: live } = await db.from('hub_sessions').update({ last_seen: new Date().toISOString() }).eq('id', sid).eq('visitor_id', vid).select('id');
      if (!live?.length) { newSession = true; sid = randomUUID(); }
    }
    const { error: touchErr } = await db.rpc('hub_touch_visitor', { p_id: vid, p_new_session: newSession });
    if (touchErr) throw touchErr;
    if (body.vo === true) await db.from('hub_visitors').update({ vendor_optout: true }).eq('id', vid);

    if (newSession) {
      let inviteId: string | null = null;
      let inviteContact: string | null = null;
      if (isInviteToken(body.i)) {
        const { data: inv } = await db.from('hub_invites').select('id, contact_id, uses').eq('token', body.i).is('revoked_at', null).maybeSingle();
        if (inv) {
          inviteId = inv.id;
          inviteContact = inv.contact_id;
          await db.from('hub_invites').update({ uses: inv.uses + 1, last_used_at: new Date().toISOString() }).eq('id', inv.id);
        }
      }
      await db.from('hub_sessions').insert({
        id: sid, visitor_id: vid, campaign, invite_id: inviteId,
        referrer: referrerHost(body.ref), device, browser,
        country: req.headers.get('x-vercel-ip-country'),
        region: req.headers.get('x-vercel-ip-country-region'),
      });
      if (inviteId) {
        await recordMatch(db, { contactId: inviteContact, visitorId: vid, sessionId: sid, source: 'invite', evidence: 'invite_used' });
      }

      // Same-browser proof: /prelaunch stores the signup's ref code in localStorage on this origin, so the
      // code can only be here if this browser completed (or restored) that signup.
      if (isRefCode(body.pl)) {
        const { data: signup } = await db.from('prelaunch_signups').select('email').eq('ref_code', body.pl).maybeSingle();
        if (signup?.email) {
          const contact = await upsertContact(db, { email: signup.email }, 'prelaunch');
          if (contact) {
            await recordMatch(db, { contactId: contact.id, visitorId: vid, sessionId: sid, source: 'prelaunch', evidence: 'first_party_record', email: signup.email });
            await linkVisitor(db, vid, contact.id, 'known_contact');
          }
        }
      }
    }

    await db.from('hub_events').insert({ visitor_id: vid, session_id: sid, type, link_id: linkId, campaign });
  } catch (e) {
    console.error('[links] track failed', (e as Error).message);
  }

  const res = ok();
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(VID_COOKIE, vid, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: VISITOR_TTL_SEC });
  res.cookies.set(SID_COOKIE, sid, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: SESSION_IDLE_SEC });
  return res;
}
