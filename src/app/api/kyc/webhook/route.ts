export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { verifyPersonaWebhook } from '@/lib/persona';
import { setKycStatus, type KycStatus } from '@/lib/kyc';

// Map a Persona inquiry state (or event name) to our status. Approval requires an explicit approved/pass
// signal — mere completion is held for review, never auto-approved here.
function mapKyc(s: string): KycStatus | null {
  s = (s || '').toLowerCase();
  if (s.includes('approved') || s.includes('passed')) return 'approved';
  if (s.includes('declined') || s.includes('failed') || s.includes('expired')) return 'declined';
  if (s.includes('needs') || s.includes('review') || s.includes('pending')) return 'review';
  if (s.includes('completed')) return 'review';
  return null;
}

// Canonical KYC result. Persona signs every webhook; we verify against the raw body before trusting it.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyPersonaWebhook(raw, req.headers.get('persona-signature'))) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const name: string = event?.data?.attributes?.name ?? '';
  const inquiry = event?.data?.attributes?.payload?.data ?? {};
  const inquiryId: string | undefined = inquiry?.id;
  const inqStatus: string | undefined = inquiry?.attributes?.status;
  const referenceId: string | undefined = inquiry?.attributes?.['reference-id'];

  const mapped = mapKyc(inqStatus || name);
  if (!mapped) return NextResponse.json({ ok: true }); // an event we don't act on

  const supabase = createServiceClient();
  let wallet = referenceId ?? null;
  if (inquiryId) {
    const { data: row } = await supabase.from('kyc_verifications').select('wallet').eq('inquiry_id', inquiryId).maybeSingle();
    if (row?.wallet) wallet = row.wallet;
    const rowStatus = mapped === 'approved' ? 'approved' : mapped === 'declined' ? 'declined' : 'needs_review';
    await supabase.from('kyc_verifications')
      .update({ status: rowStatus, raw: event, updated_at: new Date().toISOString() })
      .eq('inquiry_id', inquiryId);
  }
  if (wallet) await setKycStatus(wallet, mapped);

  return NextResponse.json({ ok: true });
}
