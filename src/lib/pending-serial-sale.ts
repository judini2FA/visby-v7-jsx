import { Connection, Keypair } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplCore, createV1,
  pluginAuthorityPair, addressPluginAuthority,
} from '@metaplex-foundation/mpl-core';
import {
  generateSigner,
  keypairIdentity,
  publicKey as umiKey,
} from '@metaplex-foundation/umi';
import { createServiceClient } from '@/lib/supabase/service';
import { transferFromAuthority, getRpcUrl, getMintAuthority } from '@/lib/nft';
import { checkSerial } from '@/lib/serial-registry';
import { createOrder } from '@/lib/orders';
import { captureError, captureMessage } from '@/lib/monitoring';

// Phase 2.3 — mint-on-sale for pre-logged business serials. A business bulk-logs genuine inventory as
// `pending_serials` rows (2.2) WITHOUT minting — the Tally is only minted here, the instant a buyer pays,
// so the business never fronts mint cost for stock that hasn't sold. This mirrors sdk-mint.ts's
// owner0=merchant → transfer-to-buyer provenance shape, but claims out of `pending_serials` instead of an
// `sdk_orders` row, and settles through the SAME shared `createOrder` recorder as every other sale.
//
// Normalize free-text condition to the items table's check constraint (mirrors /api/mint/route.ts).
const CONDITION_MAP: Record<string, string> = {
  New: 'new', 'Like New': 'like_new', Excellent: 'good', Good: 'good', Fair: 'fair',
};
function normalizeCondition(raw: string | null | undefined): string {
  if (!raw) return 'good';
  return CONDITION_MAP[raw] ?? raw.toLowerCase().replace(/\s+/g, '_');
}

export type SettleResult =
  | { ok: true; item_id: string; mint_address: string; tx_hash: string; transfer_tx: string | null; already_settled?: boolean }
  | { ok: false; error: string };

type PendingSerialRow = {
  id: string;
  business_wallet: string;
  serial_number: string;
  name: string;
  category: string | null;
  condition: string | null;
  description: string | null;
  image_url: string | null;
  brand: string | null;
  price_usdc: number | null;
  status: string;
  minted_item_id: string | null;
};

export async function settlePendingSerialSale(args: {
  pendingSerialId: string;
  buyerWallet: string;
  pricePaidUsd: number;
  paymentRef: string; // tx signature (crypto) — kept for logging/traceability only, replay guard lives upstream
}): Promise<SettleResult> {
  const { pendingSerialId, buyerWallet, pricePaidUsd, paymentRef } = args;
  const supabase = createServiceClient();

  try {
    if (!pendingSerialId || !buyerWallet) return { ok: false, error: 'Missing pendingSerialId or buyerWallet' };
    if (buyerWallet.startsWith('0x')) return { ok: false, error: 'A Solana wallet is required (got an Ethereum address)' };

    // ── EXACTLY-ONCE CLAIM (CAS) ────────────────────────────────────────────────────────────────
    // This is the single guard against double-mint: atomically flip pending → minted BEFORE any chain
    // call. Only the request that wins this UPDATE (status still 'pending') proceeds to mint. A second
    // concurrent buyer for the same serial hits 0 rows and is told it's already sold — no second mint,
    // no second transfer, no risk of two buyers each holding a "receipt" for one physical item.
    const { data: claimedRows, error: claimErr } = await supabase
      .from('pending_serials')
      .update({ status: 'minted' })
      .eq('id', pendingSerialId)
      .eq('status', 'pending')
      .select();

    if (claimErr) {
      captureError(claimErr, { stage: 'pending-serial-sale CAS claim', pendingSerialId, buyerWallet });
      return { ok: false, error: 'Claim failed: ' + claimErr.message };
    }

    if (!claimedRows || claimedRows.length === 0) {
      // Lost the race (or already sold earlier, or cancelled). Look up what happened so a retrying
      // caller (e.g. a webhook redelivery) gets an idempotent, truthful answer instead of a bare error.
      const { data: existing } = await supabase
        .from('pending_serials')
        .select('*')
        .eq('id', pendingSerialId)
        .maybeSingle();

      if (!existing) return { ok: false, error: 'Pending serial not found' };

      if (existing.status === 'minted' && existing.minted_item_id) {
        const { data: item } = await supabase
          .from('items')
          .select('id, nft_mint_address, current_owner_wallet')
          .eq('id', existing.minted_item_id)
          .maybeSingle();
        if (item) {
          // Idempotent success: the caller's payment already landed (verified by the route BEFORE calling
          // this function) and the item is already minted+owned. Report success rather than erroring so a
          // retried settle call (network blip, duplicate webhook) can't be mistaken for a failed sale.
          const alreadyToThisBuyer = item.current_owner_wallet === buyerWallet;
          return {
            ok: true,
            item_id: item.id,
            mint_address: item.nft_mint_address,
            tx_hash: '',
            transfer_tx: null,
            already_settled: true,
          };
        }
        // minted_item_id points nowhere resolvable — surface loudly, do not silently succeed.
        captureMessage('error', '[pending-serial-sale] minted row has unresolvable minted_item_id', { pendingSerialId, minted_item_id: existing.minted_item_id });
        return { ok: false, error: 'Serial already minted but item record is missing — contact support' };
      }

      return { ok: false, error: `Pending serial is not available (status: ${existing.status})` };
    }

    // We won the claim — from this point forward the row is committed to being minted. A failure below
    // must never be "rolled back" to status='pending', because the buyer's payment was ALREADY verified
    // by the caller before this function was invoked (see /api/business/buy-pending/route.ts): reopening
    // the row would let a second buyer pay again for a serial someone already paid for. Instead we record
    // partial progress and surface a loud, structured error for manual reconciliation — same philosophy
    // as sol-pay's provenance-pending path.
    const pending = claimedRows[0] as PendingSerialRow;

    // ── MINT ─────────────────────────────────────────────────────────────────────────────────────
    // Mint to the business wallet first (owner0 = business, authentic origin), then transfer to the
    // buyer — mirrors sdk-mint.ts / /api/mint/route.ts exactly so provenance history reads the same way
    // across every mint path in the app.
    let mintAuthority: Keypair;
    try {
      mintAuthority = getMintAuthority();
    } catch (e: any) {
      const notSet = /not set/.test(e?.message ?? '');
      return await recordClaimFailure(supabase, pending, buyerWallet, pricePaidUsd, paymentRef,
        notSet ? 'MINT_AUTHORITY_SECRET_KEY not set' : 'MINT_AUTHORITY_SECRET_KEY is malformed');
    }

    const rpcUrl = getRpcUrl();
    const conn = new Connection(rpcUrl, 'confirmed');
    let balance: number;
    try {
      balance = await conn.getBalance(mintAuthority.publicKey);
    } catch (e: any) {
      return await recordClaimFailure(supabase, pending, buyerWallet, pricePaidUsd, paymentRef,
        'RPC error: ' + (e?.message || 'could not reach Solana'));
    }
    if (balance < 5_000_000) {
      try {
        const sig = await conn.requestAirdrop(mintAuthority.publicKey, 1_000_000_000);
        await conn.confirmTransaction(sig, 'confirmed');
        balance = await conn.getBalance(mintAuthority.publicKey);
      } catch {
        // Airdrop rate-limited (devnet) — fall through; the mint call below fails clearly if still unfunded.
      }
    }
    if (balance < 5_000_000) {
      return await recordClaimFailure(supabase, pending, buyerWallet, pricePaidUsd, paymentRef,
        'Mint authority wallet needs SOL for transaction fees');
    }

    const umi = createUmi(rpcUrl).use(mplCore());
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(mintAuthority.secretKey);
    umi.use(keypairIdentity(umiKeypair));

    const asset = generateSigner(umi);
    const condition = normalizeCondition(pending.condition);
    const category = pending.category || 'Other';

    const metadata = {
      name: pending.name,
      description: pending.description || '',
      serial_number: pending.serial_number,
      condition,
      category,
      owner: pending.business_wallet,
      minted_at: new Date().toISOString(),
      version: '1.0',
      provenance: 'owner0 = business (pre-logged authentic origin); transferred to buyer at point of sale',
    };
    const metadataUri = `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString('base64')}`;

    let mintTx: string;
    let mintAddress: string;
    try {
      const { signature } = await createV1(umi, {
        asset,
        name: `${pending.name} | SN:${pending.serial_number}`,
        uri: metadataUri,
        owner: umiKey(pending.business_wallet),
        plugins: [
          pluginAuthorityPair({
            type: 'PermanentTransferDelegate',
            authority: addressPluginAuthority(umiKey(mintAuthority.publicKey.toBase58())),
          }),
        ],
      }).sendAndConfirm(umi);
      mintTx = Buffer.from(signature).toString('base64');
      mintAddress = asset.publicKey.toString();
    } catch (e: any) {
      return await recordClaimFailure(supabase, pending, buyerWallet, pricePaidUsd, paymentRef,
        'Mint failed: ' + (e?.message || 'unknown error'));
    }

    // Brand serial-number registry stamp (fail-open — never blocks; the buyer already paid and the NFT
    // already exists on-chain by this point, exactly like sdk-mint.ts).
    let brand: string | null = null;
    let serial_status = 'unregistered';
    try {
      const verdict = await checkSerial(pending.serial_number);
      if (verdict.verdict === 'verified') { brand = verdict.brand; serial_status = 'verified'; }
    } catch { /* registry unavailable — leave default 'unregistered' */ }

    // ── PERSIST THE REAL ITEM ROW ───────────────────────────────────────────────────────────────
    // The NFT is already irreversibly on-chain at this point — a DB failure here must not be treated as
    // "the sale didn't happen." Record loudly and let reconciliation pick it up; never silently drop a
    // mint that already cost the mint authority real fees and exists on Solana.
    const { data: item, error: itemError } = await supabase
      .from('items')
      .insert({
        name: pending.name,
        serial_number: pending.serial_number,
        condition,
        category,
        description: pending.description || '',
        nft_mint_address: mintAddress,
        current_owner_wallet: pending.business_wallet,
        image_url: pending.image_url ?? null,
        is_listed: false,
        price_usdc: null,
        arweave_metadata_url: metadataUri,
      })
      .select()
      .single();

    if (itemError || !item) {
      captureError(itemError ?? new Error('no row returned'), {
        stage: 'pending-serial-sale items insert (MINTED ON-CHAIN, DB FAILED — reconcile manually)',
        pendingSerialId, mintAddress, mintTx, buyerWallet, paymentRef,
      });
      console.error(`[pending-serial-sale] CRITICAL: NFT minted (${mintAddress}, tx ${mintTx}) but items insert failed — ` +
        `serial=${pending.serial_number} business=${pending.business_wallet} buyer=${buyerWallet}. Reconcile manually.`);
      // Best-effort: still stamp minted_item_id-less completion time so the pending row at least shows
      // it's no longer sellable, without falsely implying a resolvable item exists.
      await supabase.from('pending_serials').update({ minted_at: new Date().toISOString() }).eq('id', pending.id);
      return { ok: false, error: 'NFT minted on-chain but item record failed to save: ' + (itemError?.message || 'unknown') };
    }

    if (brand) {
      const { error: stampErr } = await supabase.from('items').update({ brand, serial_status }).eq('id', item.id);
      if (stampErr && stampErr.code !== '42703' && stampErr.code !== 'PGRST204') {
        console.error('[pending-serial-sale] brand stamp failed', { item_id: item.id, error: stampErr.message });
      }
    }

    await supabase.from('ownership_history').insert({
      item_id: item.id,
      owner_wallet: pending.business_wallet,
      tx_hash: mintTx,
      event_type: 'mint',
    });

    // Link the pending row to its now-real item, regardless of what happens in the transfer step below —
    // this is what makes the "lost the CAS race" idempotent-lookup path above resolvable.
    await supabase
      .from('pending_serials')
      .update({ minted_item_id: item.id, minted_at: new Date().toISOString() })
      .eq('id', pending.id);

    // ── TRANSFER TO BUYER ────────────────────────────────────────────────────────────────────────
    // Payment already verified by the caller before settlePendingSerialSale was invoked, so a transfer
    // failure here must NOT undo the mint or the order — the buyer already paid and owns a valid claim;
    // provenance transfer is retried out-of-band (matches sol-pay's `provenance_pending` philosophy).
    let transferTx: string | null = null;
    let transferError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { transferTx = await transferFromAuthority(mintAddress, buyerWallet); break; }
      catch (e) { transferError = e; }
    }

    if (transferTx) {
      await supabase.from('items').update({ current_owner_wallet: buyerWallet }).eq('id', item.id);
      await supabase.from('ownership_history').insert({
        item_id: item.id,
        owner_wallet: buyerWallet,
        from_wallet: pending.business_wallet,
        tx_hash: transferTx,
        event_type: 'transfer',
        price_usdc: pricePaidUsd,
      });
    } else {
      console.error('[pending-serial-sale] mint succeeded but transfer to buyer failed (pending):', transferError);
      captureError(transferError ?? new Error('provenance transfer failed'), {
        stage: 'pending-serial-sale provenance transfer pending', item_id: item.id, mintAddress, buyerWallet, paymentRef,
      });
    }

    // ── RECORD THE SALE THROUGH THE SHARED ORDER PATH ──────────────────────────────────────────
    // createOrder dedupes per item_id, so even if this function is somehow re-entered for the same
    // (now-minted) item, it won't create a second order row.
    const orderRecorded = await createOrder({
      item_id: item.id,
      buyer_wallet: buyerWallet,
      seller_wallet: pending.business_wallet,
      price_usdc: pricePaidUsd,
      pay_method: 'sol',
      nft_tx: transferTx,
    });
    if (!orderRecorded) {
      console.error(`[pending-serial-sale] CRITICAL: order NOT recorded for a paid+minted sale — funds already ` +
        `captured, reconcile from payment ref. ref=${paymentRef} item=${item.id} buyer=${buyerWallet}`);
      captureMessage('error', '[pending-serial-sale] order NOT recorded for paid sale', { paymentRef, item_id: item.id, buyerWallet });
    }

    return { ok: true, item_id: item.id, mint_address: mintAddress, tx_hash: mintTx, transfer_tx: transferTx };
  } catch (err: any) {
    captureError(err, { stage: 'settlePendingSerialSale unexpected', pendingSerialId, buyerWallet, paymentRef });
    return { ok: false, error: err?.message || 'Internal settlement error' };
  }
}

// Records that the claim was won but minting itself never reached the chain (auth/RPC/funding/mint-tx
// failure) — i.e. NO on-chain asset exists yet. We deliberately do NOT revert status back to 'pending':
// the caller already verified real buyer funds landed before invoking us, so reopening the row would let
// the same buyer (or a race) pay a second time on retry. Instead the row stays 'minted' with no
// minted_item_id, which the idempotent-lookup branch above treats as "minted but item record is missing" —
// a loud, reconcilable state, not a silent stranding of the buyer's payment.
async function recordClaimFailure(
  supabase: ReturnType<typeof createServiceClient>,
  pending: PendingSerialRow,
  buyerWallet: string,
  pricePaidUsd: number,
  paymentRef: string,
  error: string,
): Promise<SettleResult> {
  console.error(`[pending-serial-sale] CRITICAL: claim won but mint never reached chain — buyer already paid, ` +
    `no NFT exists. pendingSerialId=${pending.id} serial=${pending.serial_number} buyer=${buyerWallet} ref=${paymentRef} error=${error}`);
  captureMessage('error', '[pending-serial-sale] mint failed after claim — buyer paid, no NFT minted', {
    pendingSerialId: pending.id, serial_number: pending.serial_number, buyerWallet, paymentRef, error,
  });
  return { ok: false, error: `Payment received but mint failed: ${error}. This has been flagged for manual resolution.` };
}
