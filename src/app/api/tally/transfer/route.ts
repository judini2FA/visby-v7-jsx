export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { callerOwnsWallet } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/service';
import { transferFromAuthority } from '@/lib/nft';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';
import { requireStepUp } from '@/lib/step-up';

const isSolAddr = (a: unknown): a is string =>
  typeof a === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a);

// Move a Tally between the user's own Solana wallets. The asset carries a PermanentTransferDelegate
// held by the mint authority, so the authority signs the on-chain transfer — but ONLY after we've
// verified (via the caller's Privy token) that they actually control the wallet that owns it.
export async function POST(req: NextRequest) {
  const rl = await rateLimit(`tally-transfer:${clientIp(req)}`, { limit: 12, windowSec: 60 });
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSec);

  let body: { item_id?: unknown; from_wallet?: unknown; to_wallet?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const item_id = typeof body.item_id === 'string' ? body.item_id : '';
  const from_wallet = typeof body.from_wallet === 'string' ? body.from_wallet : '';
  const to_wallet = body.to_wallet;

  if (!item_id || !from_wallet || !to_wallet) {
    return NextResponse.json({ error: 'item_id, from_wallet, to_wallet are required' }, { status: 400 });
  }
  if (!isSolAddr(to_wallet)) {
    return NextResponse.json({ error: 'Destination must be a valid Solana wallet address' }, { status: 400 });
  }
  if (from_wallet === to_wallet) {
    return NextResponse.json({ error: 'Source and destination are the same wallet' }, { status: 400 });
  }

  // Auth: the caller must prove (via their Privy token) that they control the source wallet.
  if (!(await callerOwnsWallet(req, from_wallet))) {
    return NextResponse.json({ error: 'Not authorized for that wallet' }, { status: 401 });
  }

  // Step-up: a fresh MFA-gated wallet signature, bound to THIS transfer, before the asset leaves for
  // another wallet. No-op until STEP_UP_ENFORCED=1 (rollout-safe); verifies a proof if one is supplied.
  const stepUp = await requireStepUp(req, from_wallet, `transfer_tally:${item_id}`);
  if (stepUp) return stepUp;

  const supabase = createServiceClient();
  const { data: item } = await supabase
    .from('items')
    .select('id, name, nft_mint_address, current_owner_wallet')
    .eq('id', item_id)
    .single();

  if (!item) return NextResponse.json({ error: 'Tally not found' }, { status: 404 });
  if (item.current_owner_wallet !== from_wallet) {
    return NextResponse.json({ error: 'That wallet no longer owns this Tally' }, { status: 409 });
  }
  if (!item.nft_mint_address) {
    return NextResponse.json({ error: 'Tally is not minted yet' }, { status: 400 });
  }

  // On-chain transfer (authority-signed via the PermanentTransferDelegate).
  let tx: string;
  try {
    tx = await transferFromAuthority(item.nft_mint_address, to_wallet);
  } catch (e: any) {
    return NextResponse.json({ error: `On-chain transfer failed: ${e?.message ?? 'unknown'}` }, { status: 502 });
  }

  // Reflect the new owner + log provenance. CAS on the previous owner guards against a race.
  await supabase
    .from('items')
    .update({ current_owner_wallet: to_wallet, updated_at: new Date().toISOString() })
    .eq('id', item_id)
    .eq('current_owner_wallet', from_wallet);

  await supabase.from('ownership_history').insert({
    item_id,
    owner_wallet: to_wallet,
    from_wallet,
    tx_hash: tx,
    event_type: 'transfer',
  });

  return NextResponse.json({ ok: true, tx });
}
