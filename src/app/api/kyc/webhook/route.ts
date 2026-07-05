export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyIdentityWebhook, fetchIdentityStatus } from '@/lib/stripe-identity';
import { setKycStatus, type KycStatus } from '@/lib/kyc';

// Canonical KYC result from Stripe Identity. Every webhook is signature-verified against the dedicated
// Identity endpoint secret before it's trusted. Approval requires an explicit `verified` session that we
// RE-FETCH from Stripe (never trust the body alone); anything else is held or declined — fail-closed.
function mapEvent(type: string): KycStatus | null {
  if (type === 'identity.verification_session.verified') return 'approved';
  if (type === 'identity.verification_session.requires_input') return 'review';
  if (type === 'identity.verification_session.processing') return 'pending';
  if (type === 'identity.verification_session.canceled') return 'declined';
  return null; // an event we don't act on (created, redacted, …)
}

export async function POST(req: Request) {
  const raw = await req.text();
  const parsed = verifyIdentityWebhook(raw, req.headers.get('stripe-signature'));
  if (!parsed) return NextResponse.json({ error: 'bad signature' }, { status: 401 });

  const { event } = parsed;
  let mapped = mapEvent(event.type);
  if (!mapped) return NextResponse.json({ ok: true });

  const session = event.data.object as Stripe.Identity.VerificationSession;
  const sessionId = session.id;
  const wallet = (session.metadata?.wallet as string | undefined) ?? null;

  // Belt-and-suspenders: before granting an approval, re-fetch the session from Stripe (source of truth)
  // and require status === 'verified'. If it no longer reads verified, downgrade to review rather than
  // approve — never approve on a stale/forged body.
  if (mapped === 'approved') {
    const live = await fetchIdentityStatus(sessionId);
    if (live !== 'verified') mapped = 'review';
  }

  const supabase = createServiceClient();
  let resolvedWallet = wallet;

  if (sessionId) {
    const { data: row } = await supabase.from('kyc_verifications').select('wallet').eq('inquiry_id', sessionId).maybeSingle();
    if (row?.wallet) resolvedWallet = row.wallet;
    const rowStatus = mapped === 'approved' ? 'approved' : mapped === 'declined' ? 'declined' : mapped === 'pending' ? 'created' : 'needs_review';
    await supabase.from('kyc_verifications')
      .update({ status: rowStatus, raw: event as unknown as Record<string, unknown>, updated_at: new Date().toISOString() })
      .eq('inquiry_id', sessionId);
  }

  if (resolvedWallet) await setKycStatus(resolvedWallet, mapped);

  return NextResponse.json({ ok: true });
}
