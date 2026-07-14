export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAuthedContext } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { resolveRecipient, type TransferToken } from '@/lib/transfers';
import { notify } from '@/lib/notifications';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';

const TOKENS: TransferToken[] = ['SOL', 'USDC'];

// Create a payment request: the caller (requester) asks `to` (the payer) for `amount`. The payer is
// notified and fulfills it through the normal send flow. No funds move here.
export async function POST(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rl = await rateLimit(`request-create:${ctx.userId}`, { limit: 20, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  const body = await req.json().catch(() => ({}));
  const requester_wallet = typeof body.requester_wallet === 'string' ? body.requester_wallet : '';
  const to = typeof body.to === 'string' ? body.to : '';
  const token = (body.token as TransferToken) || 'SOL';
  const amount = Number(body.amount);
  const note = typeof body.note === 'string' ? body.note.slice(0, 280) : null;

  if (!requester_wallet || !to) return NextResponse.json({ error: 'requester_wallet and to are required' }, { status: 400 });
  if (!TOKENS.includes(token)) return NextResponse.json({ error: 'token must be SOL or USDC' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  if (!ctx.wallets.includes(requester_wallet)) return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });

  const payer = await resolveRecipient(to);
  if (!payer) return NextResponse.json({ error: 'recipient_not_found' }, { status: 404 });
  if (payer.wallet === requester_wallet) return NextResponse.json({ error: 'You can’t request from yourself' }, { status: 400 });

  const supabase = createServiceClient();
  const { data: row, error } = await supabase.from('payment_requests')
    .insert({ requester_wallet, payer_wallet: payer.wallet, token, amount, note })
    .select('id')
    .single();
  if (error || !row) return NextResponse.json({ error: 'Could not create request' }, { status: 500 });

  const { data: me } = await supabase.from('profiles').select('display_name').eq('wallet', requester_wallet).maybeSingle();
  const who = me?.display_name || `${requester_wallet.slice(0, 4)}…${requester_wallet.slice(-4)}`;
  void notify({
    recipient_wallet: payer.wallet,
    type: 'payment_request',
    title: `${who} requested ${amount} ${token}`,
    body: note ?? undefined,
    link: `/request/${row.id}`,
    data: { request_id: row.id, requester_wallet, amount, token },
  });

  return NextResponse.json({ ok: true, request_id: row.id });
}

// Respond to a request. The payer can 'decline' or 'mark_paid' (after the on-chain send confirms); the
// requester can 'cancel'. Authorization is checked per-action so neither party can act as the other.
export async function PATCH(req: Request) {
  const ctx = await getAuthedContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const request_id = typeof body.request_id === 'string' ? body.request_id : '';
  const action = body.action as 'decline' | 'cancel' | 'mark_paid';
  const transfer_id = typeof body.transfer_id === 'string' ? body.transfer_id : null;
  if (!request_id || !['decline', 'cancel', 'mark_paid'].includes(action)) {
    return NextResponse.json({ error: 'request_id and a valid action are required' }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: pr } = await supabase.from('payment_requests')
    .select('id, requester_wallet, payer_wallet, status, token, amount')
    .eq('id', request_id)
    .maybeSingle();
  if (!pr) return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  if (pr.status !== 'pending') return NextResponse.json({ ok: true, status: pr.status }); // already resolved

  const isPayer = ctx.wallets.includes(pr.payer_wallet);
  const isRequester = ctx.wallets.includes(pr.requester_wallet);
  const allowed =
    (action === 'cancel' && isRequester) ||
    ((action === 'decline' || action === 'mark_paid') && isPayer);
  if (!allowed) return NextResponse.json({ error: 'Not authorized for this request' }, { status: 403 });

  // mark_paid must be backed by a REAL confirmed transfer that actually moved >= the requested amount from
  // the payer to the requester in the right token — otherwise a payer could flip a request to "Paid" for free.
  if (action === 'mark_paid') {
    if (!transfer_id) return NextResponse.json({ error: 'transfer_id is required' }, { status: 400 });
    const { data: tr } = await supabase.from('transfers')
      .select('from_wallet, to_wallet, token, amount, status')
      .eq('id', transfer_id)
      .maybeSingle();
    const valid = !!tr
      && tr.status === 'sent'
      && ctx.wallets.includes(tr.from_wallet)
      && tr.to_wallet === pr.requester_wallet
      && tr.token === pr.token
      && Number(tr.amount) >= Number(pr.amount);
    if (!valid) return NextResponse.json({ error: 'no matching confirmed payment for this request' }, { status: 409 });
  }

  const status = action === 'mark_paid' ? 'paid' : action === 'decline' ? 'declined' : 'cancelled';
  await supabase.from('payment_requests')
    .update({ status, transfer_id: action === 'mark_paid' ? transfer_id : null, updated_at: new Date().toISOString() })
    .eq('id', request_id)
    .eq('status', 'pending');

  if (action === 'mark_paid') {
    void notify({
      recipient_wallet: pr.requester_wallet,
      type: 'payment_request_paid',
      title: 'Your payment request was paid',
      link: `/request/${request_id}`,
      data: { request_id },
    });
  }
  return NextResponse.json({ ok: true, status });
}
