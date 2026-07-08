'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { btn, S, t, card } from '@/lib/ui';

// The offers surface on an item page (blueprint 7.3). Buyer side: propose a below-list price, see its
// status, withdraw. Seller (owner) side: see incoming pending offers on this item and Accept/Decline.
// An accepted offer lets THAT buyer check out at the offer price — the checkout modal + every rail resolve
// the price server-side, so this UI only creates/answers the offer rows.

type OfferRow = {
  id: string; item_id: string; buyer_wallet: string; seller_wallet: string;
  amount_usd: number; status: string; created_at: string; expires_at: string | null;
};

const ERR: Record<string, string> = {
  above_list_price: 'Offer must be at or below the list price.',
  invalid_amount: 'Enter a valid amount.',
  own_item: 'You can’t make an offer on your own item.',
  not_listed: 'This item isn’t listed for sale.',
  account_banned: 'Your account can’t do that right now.',
  not_your_offer: 'That offer isn’t yours.',
  not_pending: 'That offer was already answered.',
  item_unavailable: 'The item is no longer available to accept.',
};
const label = (e?: string) => (e && ERR[e]) || 'Something went wrong — try again.';
const short = (w: string) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : '');

export function OffersPanel({
  itemId, listPrice, viewerWallet, isOwner, listed,
}: {
  itemId: string; listPrice: number; viewerWallet: string | null; isOwner: boolean; listed: boolean;
}) {
  const { getAccessToken } = usePrivy();
  const [incoming, setIncoming] = useState<OfferRow[]>([]);
  const [mine, setMine] = useState<OfferRow | null>(null);
  const [composing, setComposing] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!viewerWallet) return;
    try {
      const token = await getAccessToken();
      const r = await fetch('/api/offers/list', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const d = await r.json();
      if (isOwner) {
        setIncoming((d.incoming ?? []).filter((o: OfferRow) => o.item_id === itemId && o.status === 'pending'));
      } else {
        const my = (d.outgoing ?? []).find((o: OfferRow) => o.item_id === itemId && (o.status === 'pending' || o.status === 'accepted'));
        setMine(my ?? null);
      }
    } catch { /* best-effort */ }
  }, [getAccessToken, isOwner, itemId, viewerWallet]);

  useEffect(() => { void load(); }, [load]);

  async function post(url: string, body: unknown): Promise<any> {
    const token = await getAccessToken();
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return r.json().catch(() => ({}));
  }

  async function makeOffer() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt < 1) { setNote('Enter a valid amount.'); return; }
    if (amt > listPrice) { setNote(`Offer must be at or below $${listPrice.toFixed(2)}.`); return; }
    setBusy(true); setNote('');
    const d = await post('/api/offers/make', { item_id: itemId, buyer_wallet: viewerWallet, amount_usd: amt });
    setBusy(false);
    if (!d.ok) { setNote(label(d.error)); return; }
    setComposing(false); setAmount(''); await load();
  }

  async function respond(offerId: string, action: 'accept' | 'decline' | 'withdraw') {
    setBusy(true); setNote('');
    const d = await post('/api/offers/respond', { offer_id: offerId, action });
    setBusy(false);
    if (!d.ok) { setNote(label(d.error)); return; }
    await load();
  }

  if (!viewerWallet) return null;

  // ── SELLER (owner): incoming pending offers ──
  if (isOwner) {
    if (!incoming.length) return null;
    return (
      <div style={{ ...card({ pad: S[4] }), marginTop: S[4], display: 'flex', flexDirection: 'column', gap: S[3] }}>
        <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>Offers ({incoming.length})</div>
        {note && <div style={{ ...t('meta'), color: 'var(--danger)' }}>{note}</div>}
        {incoming.map((o) => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: S[3], justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700 }}>${o.amount_usd.toFixed(2)}</div>
              <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>from {short(o.buyer_wallet)} · list ${listPrice.toFixed(2)}</div>
            </div>
            <div style={{ display: 'flex', gap: S[2], flexShrink: 0 }}>
              <button onClick={() => respond(o.id, 'decline')} disabled={busy} style={{ ...btn('secondary'), fontSize: 13, padding: '8px 12px' }}>Decline</button>
              <button onClick={() => respond(o.id, 'accept')} disabled={busy} style={{ ...btn('primary'), fontSize: 13, padding: '8px 12px' }}>Accept</button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── BUYER: make/track an offer (only for a listed item you don't own) ──
  if (!listed) return null;

  if (mine?.status === 'accepted') {
    return (
      <div style={{ ...card({ pad: S[4] }), marginTop: S[4], borderColor: 'var(--ok)' }}>
        <div style={{ ...t('body'), color: 'var(--ok)', fontWeight: 700 }}>Offer accepted — ${mine.amount_usd.toFixed(2)}</div>
        <div style={{ ...t('meta'), color: 'var(--text-muted)', marginTop: S[1] }}>Tap Buy Now — your accepted price is applied automatically at checkout.</div>
      </div>
    );
  }

  if (mine?.status === 'pending') {
    return (
      <div style={{ ...card({ pad: S[4] }), marginTop: S[4], display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[3] }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 700 }}>Offer sent · ${mine.amount_usd.toFixed(2)}</div>
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Waiting for the seller to respond.</div>
        </div>
        <button onClick={() => respond(mine!.id, 'withdraw')} disabled={busy} style={{ ...btn('text'), fontSize: 13, flexShrink: 0 }}>Withdraw</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: S[3] }}>
      {!composing ? (
        <button onClick={() => { setComposing(true); setNote(''); }} style={{ ...btn('secondary', { full: true }) }}>Make an offer</button>
      ) : (
        <div style={{ ...card({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
          <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>Your offer</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
            <span style={{ ...t('body'), color: 'var(--text-muted)' }}>$</span>
            <input type="number" inputMode="decimal" min={1} max={listPrice} step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder={`Up to ${listPrice.toFixed(2)}`}
              style={{ flex: 1, background: 'var(--field-input-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: '11px 13px', color: 'var(--text-strong)', fontFamily: "'Manrope',sans-serif", fontSize: 15 }} />
          </div>
          {note && <div style={{ ...t('meta'), color: 'var(--danger)' }}>{note}</div>}
          <div style={{ display: 'flex', gap: S[2] }}>
            <button onClick={() => { setComposing(false); setNote(''); }} disabled={busy} style={{ ...btn('text'), flex: 1 }}>Cancel</button>
            <button onClick={makeOffer} disabled={busy} style={{ ...btn('primary'), flex: 1 }}>Send offer</button>
          </div>
        </div>
      )}
    </div>
  );
}
