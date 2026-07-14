'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, card, btn, T } from '@/lib/ui';

// Blueprint 6.6 — printable chargeback evidence bundle for one order. An admin opens this to compile a
// document (transaction + delivery proof + on-chain provenance + dispute evidence) to attach to a card
// chargeback rebuttal. "Print / Save as PDF" produces the deliverable.

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
function money(v: number | null | undefined): string {
  return v == null ? '—' : `$${Number(v).toFixed(2)}`;
}
function short(w: string | null | undefined): string {
  return w ? `${w.slice(0, 6)}…${w.slice(-4)}` : '—';
}

export default function ChargebackBundlePage() {
  const params = useParams<{ orderId: string }>();
  const { getAccessToken } = usePrivy();
  const { address: wallet, ready } = useVisbWallet();
  const [bundle, setBundle] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !wallet) return;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/admin/chargeback-bundle?order_id=${encodeURIComponent(params.orderId)}&wallet=${encodeURIComponent(wallet)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await res.json();
        if (!res.ok) { setErr(data.error || 'Could not load the bundle'); return; }
        setBundle(data);
      } catch {
        setErr('Could not load the bundle');
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, wallet, params.orderId, getAccessToken]);

  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: S[4], padding: `${S[1]}px 0`, borderBottom: '1px solid var(--divider)' }}>
      <span style={{ ...t('meta'), color: T.textMuted }}>{k}</span>
      <span style={{ ...t('meta'), color: T.textStrong, textAlign: 'right', wordBreak: 'break-word', maxWidth: '65%' }}>{v}</span>
    </div>
  );
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ ...card(), padding: S[5], marginBottom: S[4] }}>
      <div style={{ ...t('heading'), color: T.textStrong, marginBottom: S[3] }}>{title}</div>
      {children}
    </div>
  );

  if (loading) return <div style={{ padding: S[6], ...t('body'), color: T.textMuted }}>Loading evidence bundle…</div>;
  if (err) return <div style={{ padding: S[6], ...t('body'), color: 'var(--danger)' }}>{err}</div>;
  if (!bundle) return null;

  const { order, item, shipping, provenance, dispute, evidence } = bundle;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: S[5] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: S[4] }} data-noprint>
        <div style={{ ...t('title'), color: T.textStrong }}>Chargeback Evidence</div>
        <button onClick={() => window.print()} style={{ ...btn('primary') }}>Print / Save as PDF</button>
      </div>

      <Section title="Transaction">
        <Row k="Order ID" v={order.id} />
        <Row k="Date" v={fmtDate(order.created_at)} />
        <Row k="Amount" v={money(order.price_usdc)} />
        <Row k="Payment method" v={order.pay_method ?? '—'} />
        {order.stripe_payment_intent && <Row k="Stripe PaymentIntent" v={order.stripe_payment_intent} />}
        <Row k="Order status" v={order.status} />
        <Row k="Buyer" v={short(order.buyer_wallet)} />
        <Row k="Seller" v={short(order.seller_wallet)} />
      </Section>

      {item && (
        <Section title="Item & authenticity">
          <Row k="Item" v={item.name ?? '—'} />
          {item.brand && <Row k="Brand" v={item.brand} />}
          <Row k="Serial number" v={item.serial_number ?? '—'} />
          <Row k="On-chain provenance NFT" v={item.nft_mint_address ?? '—'} />
        </Section>
      )}

      <Section title="Delivery proof">
        <Row k="Ship to" v={shipping.ship_name ?? '—'} />
        {shipping.ship_address && (
          <Row k="Address" v={[shipping.ship_address.line1, shipping.ship_address.city, shipping.ship_address.state, shipping.ship_address.postal].filter(Boolean).join(', ') || '—'} />
        )}
        <Row k="Carrier" v={shipping.carrier ?? '—'} />
        <Row k="Tracking #" v={shipping.tracking_number ?? '—'} />
        <Row k="Service" v={shipping.service ?? '—'} />
        <Row k="Shipped" v={fmtDate(shipping.shipped_at)} />
        <Row k="Delivered" v={shipping.delivered ? fmtDate(shipping.delivered_at) || 'Yes' : 'Not confirmed'} />
      </Section>

      <Section title="Chain provenance trail">
        {(provenance ?? []).length === 0 ? (
          <div style={{ ...t('meta'), color: T.textMuted }}>No on-chain history recorded.</div>
        ) : (
          provenance.map((p: any, i: number) => (
            <div key={i} style={{ padding: `${S[2]}px 0`, borderBottom: '1px solid var(--divider)' }}>
              <div style={{ ...t('meta'), color: T.textStrong, fontWeight: 700 }}>{p.event_type === 'mint' ? 'Minted' : 'Transferred'} · {fmtDate(p.created_at)}</div>
              <div style={{ ...t('micro'), color: T.textMuted, marginTop: 2 }}>
                {p.from_wallet ? `${short(p.from_wallet)} → ` : ''}{short(p.owner_wallet)}{p.price_usdc != null ? ` · ${money(p.price_usdc)}` : ''}
              </div>
              {p.tx_hash && <div style={{ ...t('micro'), color: T.textMuted, wordBreak: 'break-all' }}>tx: {p.tx_hash}</div>}
            </div>
          ))
        )}
      </Section>

      {dispute && (
        <Section title="Dispute">
          <Row k="Type" v={dispute.kind} />
          <Row k="Status" v={dispute.status} />
          {dispute.reason && <Row k="Reason" v={dispute.reason} />}
          {dispute.resolution_note && <Row k="Resolution" v={dispute.resolution_note} />}
          <Row k="Opened" v={fmtDate(dispute.created_at)} />
        </Section>
      )}

      {(evidence ?? []).length > 0 && (
        <Section title="Uploaded evidence">
          {evidence.map((e: any, i: number) => (
            <div key={i} style={{ padding: `${S[2]}px 0`, borderBottom: '1px solid var(--divider)' }}>
              <div style={{ ...t('micro'), color: T.textMuted }}>{e.role} · {fmtDate(e.created_at)}{e.note ? ` · ${e.note}` : ''}</div>
              <a href={e.file_url} target="_blank" rel="noreferrer" style={{ ...t('micro'), color: 'var(--brand-sky, #2A8AED)', wordBreak: 'break-all' }}>{e.file_url}</a>
            </div>
          ))}
        </Section>
      )}

      <div style={{ ...t('micro'), color: T.textMuted, marginTop: S[3] }}>Generated {fmtDate(bundle.generated_at)} · Visby</div>
      <style>{`@media print { [data-noprint]{display:none!important} }`}</style>
    </div>
  );
}
