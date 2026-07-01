'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { usePlaidLink } from 'react-plaid-link';
import { useTheme } from '@/lib/theme';
import { t, S, surface, btn, input } from '@/lib/ui';
import { solscanAccount } from '@/lib/explorer';
import { trpc } from '@/lib/trpc/client';

// Wallet "connected methods" manager — the stacked method-card layout from Judah's sketch.
// Each tile: big amount+currency (or just the currency when no amount, e.g. cards), name + masked id,
// a left drag handle, and a right "• • •" menu (make default / order up / order down / contextual actions).
// Top tile = "Primary" (the default), set apart with the brand gradient.
// Order is persisted server-side (profiles.payment_order, index 0 = default) with a localStorage cache;
// it follows the user across devices and feeds the VisbyPay SDK checkout. SDK-checkout wiring is next.
// Real methods this step: the Solana wallet (live balance) + saved cards. Bank/Venmo/Cash App slot in later.

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
const RED = 'var(--danger)';
// Bank linking (Plaid) is parked for MVP — the "Connect a bank" entry point and the balance-tile
// fetch stay hidden until NEXT_PUBLIC_BANK_LINKING=1. Fail-closed: off by default. The routes/lib
// stay dormant (park, not remove).
const BANK_LINKING_ENABLED = process.env.NEXT_PUBLIC_BANK_LINKING === '1';
const ORDER_KEY = 'visby-payment-order';
const GRAD = 'linear-gradient(135deg,#25CDB8,#2A8AED 50%,#BC2DE6)';   // saturated — icon + amount text
const BOX_GRAD = 'var(--grad-brand)';                                // lighter pastel — the primary slot box

// Connected (external) crypto wallets share the cross-chain registry used by the Tally Destination picker.
const CW_KEY = 'visby-connected-wallets';
type ConnWallet = { id: string; chain: 'solana' | 'ethereum' | 'bitcoin'; address: string; label?: string };
const CHAIN_META: Record<ConnWallet['chain'], { sym: string; label: string }> = {
  solana:   { sym: 'SOL', label: 'Solana' },
  ethereum: { sym: 'ETH', label: 'Ethereum' },
  bitcoin:  { sym: 'BTC', label: 'Bitcoin' },
};
function readConnWallets(): ConnWallet[] {
  try { const v = JSON.parse(localStorage.getItem(CW_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

type Kind = 'wallet' | 'card' | 'bank' | 'brokerage';
type Method = {
  id: string;            // 'wallet' | stripe pm id
  kind: Kind;
  currency: string;      // 'SOL' | 'USD'
  amount: string | null; // '3.520' | null (cards show currency only)
  name: string;          // 'Solana wallet' | brand
  masked: string;        // 'HTLB37…' | '···· 4242'
  address?: string;      // wallet only
  item_id?: string;      // bank only (Plaid item, for disconnect)
};

function brandLabel(b: string): string {
  const map: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay' };
  return map[(b || '').toLowerCase()] ?? (b ? b[0].toUpperCase() + b.slice(1) : 'Card');
}
function shortAddr(a: string) { return a && a.length > 10 ? `${a.slice(0, 5)}…${a.slice(-3)}` : a; }
function fmtMoney(n: number) { return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

async function fetchSolBalance(addr: string, rpc: string): Promise<number | null> {
  try {
    const res = await fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [addr] }) });
    const d = await res.json();
    return d.result?.value != null ? d.result.value / 1e9 : null;
  } catch { return null; }
}

const cardElStyle = (dark: boolean) => ({
  base: { color: dark ? '#ECE8F6' : '#1B1730', fontSize: '15px', fontFamily: "'Manrope', sans-serif", fontSmoothing: 'antialiased' as const, '::placeholder': { color: dark ? '#9E97B4' : '#6B6480' } },
  invalid: { color: RED, iconColor: RED },
});

function Spinner({ size = 16 }: { size?: number }) {
  return <div style={{ width: size, height: size, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', opacity: 0.7, animation: 'spin .8s linear infinite', flexShrink: 0 }} />;
}

// Left-edge drag grip (the stacked dots in the sketch).
function DragGrip() {
  return (
    <svg width="12" height="20" viewBox="0 0 12 20" fill="currentColor" aria-hidden style={{ flexShrink: 0 }}>
      {[4, 10, 16].map(y => [3, 9].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />))}
    </svg>
  );
}

function KindIcon({ kind }: { kind: Kind }) {
  const p = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'wallet') return <svg {...p}><rect x="2.5" y="6" width="19" height="13" rx="3" /><path d="M16 12.5h.02M2.5 10.5h19" /></svg>;
  if (kind === 'bank') return <svg {...p}><path d="M3 21h18M5 10h14M6 10v8M10 10v8M14 10v8M18 10v8M5 10l7-5 7 5" /></svg>;
  if (kind === 'brokerage') return <svg {...p}><path d="M3 17l5-5 4 4 8-8M15 8h6v6" /></svg>;
  return <svg {...p}><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20" /></svg>;
}

type MenuAction = 'default' | 'up' | 'down' | 'addfunds' | 'export' | 'explorer' | 'openapp' | 'remove' | 'disconnect';

function MethodCard({ m, isDefault, isFirst, isLast, menuOpen, onToggleMenu, onAction, onDragStart, onDragOver, onDragEnd, dragging }: {
  m: Method; isDefault: boolean; isFirst: boolean; isLast: boolean;
  menuOpen: boolean; onToggleMenu: () => void; onAction: (a: MenuAction) => void;
  onDragStart: () => void; onDragOver: () => void; onDragEnd: () => void; dragging: boolean;
}) {
  const items: { a: MenuAction; label: string; danger?: boolean; href?: string }[] = [];
  if (!isDefault) items.push({ a: 'default', label: 'Make default' });
  if (!isFirst) items.push({ a: 'up', label: 'Order up' });
  if (!isLast) items.push({ a: 'down', label: 'Order down' });
  if (m.kind === 'wallet' && m.id === 'wallet') {
    items.push({ a: 'addfunds', label: 'Add funds', href: '/buy-crypto' });
    items.push({ a: 'export', label: 'Export key' });
    items.push({ a: 'explorer', label: 'Open in explorer' });
  } else if (m.kind === 'wallet') {
    items.push({ a: 'remove', label: 'Remove', danger: true });
  }
  if (m.kind === 'card') items.push({ a: 'remove', label: 'Remove', danger: true });
  if (m.kind === 'bank' || m.kind === 'brokerage') {
    items.push({ a: 'openapp', label: m.kind === 'brokerage' ? 'Open Robinhood' : 'Open bank app' });
    items.push({ a: 'disconnect', label: 'Disconnect', danger: true });
  }

  const whiteRef = useRef<HTMLDivElement>(null);

  const body = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
        <span style={{ color: 'var(--text-muted)', cursor: 'grab', display: 'inline-flex', touchAction: 'none' }} aria-label="Drag to reorder"><DragGrip /></span>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><KindIcon kind={m.kind} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Manrope', sans-serif", fontWeight: 800, fontSize: 22, lineHeight: 1.15, letterSpacing: '-.01em', ...(isDefault ? { background: GRAD, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' } : { color: 'var(--text-strong)' }), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.currency}{m.amount ? ` ${m.amount}` : ''}
          </div>
          <div style={{ ...t('meta'), color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.name} {m.masked}
          </div>
        </div>
        <button onClick={onToggleMenu} aria-label="Method options" style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-muted)', padding: 6, flexShrink: 0, display: 'inline-flex' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
      </div>

      {menuOpen && (
        <div style={{ position: 'absolute', top: 44, right: S[3], zIndex: 20, minWidth: 168, ...surface({ pad: '6px' }), background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', boxShadow: 'var(--glass-shadow)', display: 'flex', flexDirection: 'column' }}>
          {items.map(it => it.href ? (
            <Link key={it.a} href={it.href} style={{ ...t('body'), color: 'var(--text)', textDecoration: 'none', padding: '9px 12px', borderRadius: 'var(--r-sm)' }}>{it.label}</Link>
          ) : (
            <button key={it.a} onClick={() => onAction(it.a)} style={{ ...t('body'), color: it.danger ? RED : 'var(--text)', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', padding: '9px 12px', borderRadius: 'var(--r-sm)' }}>{it.label}</button>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div
      draggable
      onDragStart={(e) => {
        // Default tile: drag only the white card — the gradient slot stays pinned in place.
        if (isDefault && whiteRef.current) {
          const r = whiteRef.current.getBoundingClientRect();
          e.dataTransfer.setDragImage(whiteRef.current, e.clientX - r.left, e.clientY - r.top);
        }
        onDragStart();
      }}
      onDragOver={e => { e.preventDefault(); onDragOver(); }}
      onDragEnd={onDragEnd}
      style={{
        position: 'relative',
        borderRadius: 'var(--r-lg)',
        boxShadow: isDefault ? '0 8px 28px rgba(120,110,160,.22)' : 'var(--box-shadow-soft)',
        // Default: keep the gradient slot at full opacity while dragging (it stays put); the white lifts out.
        opacity: isDefault ? 1 : (dragging ? 0.5 : 1),
        transition: 'opacity .15s',
        // Default = a gradient "slot": a thick top bar carries the PRIMARY lip, a thin frame on the
        // other sides — the white pay tile is a separate rounded card that sits into the slot.
        ...(isDefault
          ? { background: BOX_GRAD, padding: '26px 4px 4px' }
          : { background: 'var(--surface-bg)', border: '1px solid var(--glass-hairline)', padding: `${S[4]}px` }),
      }}
    >
      {isDefault && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', ...t('micro'), color: 'var(--text-on-cta)', letterSpacing: '0.18em', pointerEvents: 'none' }}>PRIMARY</div>
      )}
      {isDefault ? (
        <div ref={whiteRef} style={{ position: 'relative', background: 'var(--surface-bg)', borderRadius: 'var(--r)', padding: `${S[4]}px`, opacity: dragging ? 0 : 1, transition: 'opacity .12s' }}>
          {body}
        </div>
      ) : body}
    </div>
  );
}

function AddCardForm({ wallet, onAdded, onCancel }: { wallet: string; onAdded: () => void; onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const { getAccessToken } = usePrivy();
  const { mode } = useTheme();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSaving(true); setErr('');
    try {
      const token = await getAccessToken();
      const r = await fetch('/api/stripe/setup-intent', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ wallet }) });
      const d = await r.json();
      if (!r.ok || !d.client_secret) throw new Error(d.error ?? 'Could not start card setup');
      const card = elements.getElement(CardElement);
      if (!card) throw new Error('Card field not ready');
      const { error } = await stripe.confirmCardSetup(d.client_secret, { payment_method: { card } });
      if (error) throw new Error(error.message ?? 'Card could not be saved');
      onAdded();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Could not save card');
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} style={{ ...surface({ pad: `${S[4]}px ${S[4]}px` }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <CardElement options={{ style: cardElStyle(mode === 'dark'), hidePostalCode: true }} />
      {err && <div style={{ ...t('meta'), color: RED }}>{err}</div>}
      <div style={{ display: 'flex', gap: S[2] }}>
        <button type="button" onClick={onCancel} disabled={saving} style={{ ...btn('secondary'), flex: 1 }}>Cancel</button>
        <button type="submit" disabled={saving || !stripe} style={{ ...btn('primary'), flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: S[2], opacity: saving || !stripe ? 0.7 : 1 }}>{saving ? <><Spinner /> Saving…</> : 'Save card'}</button>
      </div>
    </form>
  );
}

// "Connect a bank" via Plaid Link. Fetches a link_token on click, opens Plaid's secure flow,
// then exchanges the returned public_token server-side and refreshes the bank tiles.
function ConnectBankButton({ wallet, onConnected, onCancel }: { wallet: string; onConnected: () => void; onCancel: () => void }) {
  const { getAccessToken } = usePrivy();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const onSuccess = useCallback(async (public_token: string, metadata: any) => {
    setBusy(true); setErr('');
    try {
      const token = await getAccessToken();
      const r = await fetch('/api/plaid/exchange', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ wallet, public_token, institution_name: metadata?.institution?.name }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? 'Could not link bank');
      onConnected();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Could not link bank'); setBusy(false);
    }
  }, [wallet, getAccessToken, onConnected]);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit: () => setBusy(false) });

  useEffect(() => { if (linkToken && ready) open(); }, [linkToken, ready, open]);

  async function start() {
    setBusy(true); setErr('');
    try {
      const token = await getAccessToken();
      const r = await fetch('/api/plaid/link-token', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ wallet }) });
      const d = await r.json();
      if (!r.ok || !d.link_token) throw new Error(d.error ?? 'Bank connection unavailable');
      setLinkToken(d.link_token);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Bank connection unavailable'); setBusy(false);
    }
  }

  return (
    <div style={{ ...surface({ pad: `${S[4]}px` }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 600 }}>Connect a bank</div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>You'll log in securely to your bank — Visby never sees your password.</div>
      {err && <div style={{ ...t('meta'), color: RED }}>{err}</div>}
      <div style={{ display: 'flex', gap: S[2] }}>
        <button type="button" onClick={onCancel} disabled={busy} style={{ ...btn('secondary'), flex: 1 }}>Cancel</button>
        <button type="button" onClick={start} disabled={busy} style={{ ...btn('primary'), flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: S[2], opacity: busy ? 0.7 : 1 }}>{busy ? <><Spinner /> Connecting…</> : 'Continue'}</button>
      </div>
    </div>
  );
}

// "Connect a brokerage" via SnapTrade. Opens SnapTrade's hosted connection portal in a popup;
// when the user finishes there and returns, we refresh the brokerage tiles.
function ConnectBrokerageButton({ wallet, onConnected, onCancel }: { wallet: string; onConnected: () => void; onCancel: () => void }) {
  const { getAccessToken } = usePrivy();
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [err, setErr] = useState('');

  // Once the portal is open, refreshing on window-focus catches the user returning after linking.
  useEffect(() => {
    if (!opened) return;
    const onFocus = () => onConnected();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [opened, onConnected]);

  async function start() {
    setBusy(true); setErr('');
    try {
      const token = await getAccessToken();
      const r = await fetch('/api/snaptrade/connect', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ wallet }) });
      const d = await r.json();
      if (!r.ok || !d.redirectURI) throw new Error(d.error ?? 'Brokerage connection unavailable');
      window.open(d.redirectURI, 'snaptrade', 'width=480,height=720');
      setOpened(true);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Brokerage connection unavailable');
    } finally { setBusy(false); }
  }

  return (
    <div style={{ ...surface({ pad: `${S[4]}px` }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 600 }}>Connect a brokerage</div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Link Robinhood and others through SnapTrade's secure portal — Visby never sees your brokerage login.</div>
      {err && <div style={{ ...t('meta'), color: RED }}>{err}</div>}
      <div style={{ display: 'flex', gap: S[2] }}>
        <button type="button" onClick={onCancel} disabled={busy} style={{ ...btn('secondary'), flex: 1 }}>{opened ? 'Close' : 'Cancel'}</button>
        <button type="button" onClick={opened ? onConnected : start} disabled={busy} style={{ ...btn('primary'), flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: S[2], opacity: busy ? 0.7 : 1 }}>{busy ? <><Spinner /> Opening…</> : opened ? "I'm done" : 'Continue'}</button>
      </div>
    </div>
  );
}

export default function PaymentMethodsManager({ wallet, onExportWallet, previewMethods }: { wallet: string; onExportWallet?: () => void; previewMethods?: Method[] }) {
  const { getAccessToken } = usePrivy();
  const [cards, setCards] = useState<{ id: string; brand: string; last4: string }[] | null>(previewMethods ? [] : null);
  const [banks, setBanks] = useState<{ id: string; item_id: string; institution: string; mask: string; currency: string; balance: number | null }[]>([]);
  const [brokerages, setBrokerages] = useState<{ id: string; institution: string; mask: string; currency: string; balance: number | null }[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [openMenu, setOpenMenu] = useState('');
  const [dragId, setDragId] = useState('');
  const [addMode, setAddMode] = useState<'' | 'choose' | 'card' | 'bank' | 'brokerage' | 'wallet'>('');
  const [connWallets, setConnWallets] = useState<ConnWallet[]>([]);
  const [err, setErr] = useState('');
  const upsertProfile = trpc.profiles.upsertProfile.useMutation();

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); if (Array.isArray(s)) setOrder(s); } catch {}
  }, []);

  // Connected external wallets — local cache first, then the authed server copy (cross-device, shared with
  // the Tally Destination picker).
  useEffect(() => {
    if (previewMethods) return;
    setConnWallets(readConnWallets());
    if (!wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const r = await fetch(`/api/profile/private?wallet=${encodeURIComponent(wallet)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return;
        const d = await r.json();
        if (!cancelled && Array.isArray(d.connected_wallets) && d.connected_wallets.length) {
          setConnWallets(d.connected_wallets);
          try { localStorage.setItem(CW_KEY, JSON.stringify(d.connected_wallets)); } catch {}
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [wallet, getAccessToken, previewMethods]);

  function saveConnWallets(next: ConnWallet[]) {
    setConnWallets(next);
    try { localStorage.setItem(CW_KEY, JSON.stringify(next)); } catch {}
    if (wallet) upsertProfile.mutate({ wallet, connected_wallets: next });
  }

  // Server is the source of truth (follows the user across devices + feeds VisbyPay checkout); localStorage
  // is a fast local cache. On mount, a non-empty server order overrides the cached one.
  useEffect(() => {
    if (previewMethods || !wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const r = await fetch(`/api/payment-methods/order?wallet=${wallet}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        if (!cancelled && r.ok && Array.isArray(d.order) && d.order.length) {
          setOrder(d.order);
          try { localStorage.setItem(ORDER_KEY, JSON.stringify(d.order)); } catch {}
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [wallet, getAccessToken, previewMethods]);

  function persistOrder(next: string[]) {
    setOrder(next);
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch {}
    if (previewMethods || !wallet) return;
    (async () => {
      try {
        const token = await getAccessToken();
        await fetch('/api/payment-methods/order', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ wallet, order: next }) });
      } catch {}
    })();
  }

  const loadCards = useCallback(async () => {
    if (previewMethods || !wallet) { if (!previewMethods) setCards([]); return; }
    try {
      const token = await getAccessToken();
      const r = await fetch(`/api/stripe/payment-methods?wallet=${wallet}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setCards(r.ok ? (d.methods ?? []) : []);
    } catch { setCards([]); }
  }, [wallet, getAccessToken, previewMethods]);

  useEffect(() => { loadCards(); }, [loadCards]);

  const loadBanks = useCallback(async () => {
    if (!BANK_LINKING_ENABLED || previewMethods || !wallet) return;
    try {
      const token = await getAccessToken();
      const r = await fetch(`/api/plaid/accounts?wallet=${wallet}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setBanks(r.ok ? (d.banks ?? []) : []);
    } catch { setBanks([]); }
  }, [wallet, getAccessToken, previewMethods]);

  useEffect(() => { loadBanks(); }, [loadBanks]);

  const loadBrokerages = useCallback(async () => {
    if (previewMethods || !wallet) return;
    try {
      const token = await getAccessToken();
      const r = await fetch(`/api/snaptrade/accounts?wallet=${wallet}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setBrokerages(r.ok ? (d.brokerages ?? []) : []);
    } catch { setBrokerages([]); }
  }, [wallet, getAccessToken, previewMethods]);

  useEffect(() => { loadBrokerages(); }, [loadBrokerages]);

  useEffect(() => {
    if (previewMethods || !wallet) return;
    const rpc = process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? 'https://api.devnet.solana.com';
    fetchSolBalance(wallet, rpc).then(setBalance);
  }, [wallet, previewMethods]);

  // Build the live method set, then apply the saved favorites order (unknown ids append). Top = default.
  const methods: Method[] = useMemo(() => {
    if (previewMethods) return previewMethods;
    const live: Method[] = [];
    if (wallet) live.push({ id: 'wallet', kind: 'wallet', currency: 'SOL', amount: balance != null ? balance.toFixed(3) : null, name: 'Solana wallet', masked: shortAddr(wallet), address: wallet });
    connWallets.forEach(w => live.push({ id: `cw:${w.id}`, kind: 'wallet', currency: CHAIN_META[w.chain].sym, amount: null, name: w.label || `${CHAIN_META[w.chain].label} wallet`, masked: shortAddr(w.address), address: w.address }));
    (cards ?? []).forEach(c => live.push({ id: c.id, kind: 'card', currency: 'USD', amount: null, name: brandLabel(c.brand), masked: `···· ${c.last4}` }));
    banks.forEach(b => live.push({ id: b.id, kind: 'bank', currency: b.currency, amount: b.balance != null ? fmtMoney(b.balance) : null, name: b.institution, masked: b.mask ? `···· ${b.mask}` : '', item_id: b.item_id }));
    brokerages.forEach(b => live.push({ id: b.id, kind: 'brokerage', currency: b.currency, amount: b.balance != null ? fmtMoney(b.balance) : null, name: b.institution, masked: b.mask ? `···· ${b.mask}` : '' }));
    const byId = new Map(live.map(m => [m.id, m]));
    const ordered = order.map(id => byId.get(id)).filter(Boolean) as Method[];
    const seen = new Set(ordered.map(m => m.id));
    live.forEach(m => { if (!seen.has(m.id)) ordered.push(m); });
    return ordered;
  }, [wallet, balance, cards, banks, brokerages, connWallets, order, previewMethods]);

  function reorder(ids: string[]) { persistOrder(ids); }
  function idsOf() { return methods.map(m => m.id); }
  function move(id: string, dir: -1 | 1) {
    const ids = idsOf(); const i = ids.indexOf(id); const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]]; reorder(ids); setOpenMenu('');
  }
  function makeDefault(id: string) { const ids = idsOf().filter(x => x !== id); reorder([id, ...ids]); setOpenMenu(''); }
  function dragOver(overId: string) {
    if (!dragId || dragId === overId) return;
    const ids = idsOf(); const from = ids.indexOf(dragId); const to = ids.indexOf(overId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]); reorder(ids);
  }

  async function removeCard(id: string) {
    setOpenMenu(''); setErr('');
    try {
      const token = await getAccessToken();
      const r = await fetch('/api/stripe/delete-payment-method', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ payment_method_id: id, wallet }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? 'Could not remove card');
      setCards(c => (c ?? []).filter(x => x.id !== id));
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Could not remove card'); }
  }

  async function disconnectBank(m: Method) {
    setOpenMenu(''); setErr('');
    if (!m.item_id) return;
    try {
      const token = await getAccessToken();
      const r = await fetch('/api/plaid/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ wallet, item_id: m.item_id }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? 'Could not disconnect bank');
      setBanks(b => b.filter(x => x.item_id !== m.item_id));
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Could not disconnect bank'); }
  }

  async function disconnectBrokerage() {
    setOpenMenu(''); setErr('');
    try {
      const token = await getAccessToken();
      const r = await fetch('/api/snaptrade/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ wallet }) });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error ?? 'Could not disconnect brokerage');
      setBrokerages([]);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Could not disconnect brokerage'); }
  }

  function removeWallet(m: Method) {
    setOpenMenu('');
    saveConnWallets(connWallets.filter(w => `cw:${w.id}` !== m.id));
  }

  function handleAction(m: Method, a: MenuAction) {
    if (a === 'default') return makeDefault(m.id);
    if (a === 'up') return move(m.id, -1);
    if (a === 'down') return move(m.id, 1);
    if (a === 'remove') return m.kind === 'wallet' ? removeWallet(m) : removeCard(m.id);
    if (a === 'export') { setOpenMenu(''); onExportWallet?.(); return; }
    if (a === 'explorer') { setOpenMenu(''); if (m.address) window.open(solscanAccount(m.address), '_blank', 'noopener'); return; }
    if (a === 'disconnect') return m.kind === 'brokerage' ? disconnectBrokerage() : disconnectBank(m);
    // openapp = deep-link out to the bank/Robinhood app — wired per-institution later (brokerage = SnapTrade).
    if (a === 'openapp') { setOpenMenu(''); return; }
  }

  const loading = !previewMethods && cards === null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[3] }} onClick={() => openMenu && setOpenMenu('')}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {loading ? (
        <div style={{ ...surface({ pad: '16px' }), display: 'flex', alignItems: 'center', gap: S[3], color: 'var(--text-muted)' }}><Spinner /> <span style={{ ...t('meta') }}>Loading methods…</span></div>
      ) : methods.length === 0 ? (
        <div style={{ ...surface({ pad: '16px' }), ...t('meta'), color: 'var(--text-muted)' }}>{wallet ? 'No payment methods yet. Add one below.' : 'Set up your Visby wallet to get started.'}</div>
      ) : (
        methods.map((m, i) => (
          <div key={m.id} onClick={e => e.stopPropagation()}>
            <MethodCard
              m={m} isDefault={i === 0} isFirst={i === 0} isLast={i === methods.length - 1}
              menuOpen={openMenu === m.id} onToggleMenu={() => setOpenMenu(openMenu === m.id ? '' : m.id)}
              onAction={a => handleAction(m, a)}
              onDragStart={() => setDragId(m.id)} onDragOver={() => dragOver(m.id)} onDragEnd={() => setDragId('')}
              dragging={dragId === m.id}
            />
          </div>
        ))
      )}

      {err && <div style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-soft)', borderRadius: 'var(--r)', padding: `${S[2]}px ${S[3]}px`, ...t('meta'), color: RED }}>{err}</div>}

      {addMode === 'card' ? (
        <Elements stripe={stripePromise}>
          <AddCardForm wallet={wallet} onAdded={() => { setAddMode(''); loadCards(); }} onCancel={() => setAddMode('')} />
        </Elements>
      ) : addMode === 'bank' ? (
        <ConnectBankButton wallet={wallet} onConnected={() => { setAddMode(''); loadBanks(); }} onCancel={() => setAddMode('')} />
      ) : addMode === 'brokerage' ? (
        <ConnectBrokerageButton wallet={wallet} onConnected={() => { setAddMode(''); loadBrokerages(); }} onCancel={() => setAddMode('')} />
      ) : addMode === 'wallet' ? (
        <ConnectWalletForm existing={connWallets} onAdd={w => { saveConnWallets([...connWallets, w]); setAddMode(''); }} onCancel={() => setAddMode('')} />
      ) : addMode === 'choose' ? (
        <div style={{ ...surface({ pad: `${S[2]}px` }), display: 'flex', flexDirection: 'column', gap: S[1] }}>
          <AddRow kind="card" label="Add a card" onClick={() => setAddMode('card')} />
          <AddRow kind="wallet" label="Connect a wallet" onClick={() => setAddMode('wallet')} />
          {BANK_LINKING_ENABLED && <AddRow kind="bank" label="Connect a bank" onClick={() => setAddMode('bank')} />}
          <AddRow kind="brokerage" label="Connect a brokerage" onClick={() => setAddMode('brokerage')} />
          <button onClick={() => setAddMode('')} style={{ ...t('meta'), color: 'var(--text-muted)', background: 'none', border: 0, cursor: 'pointer', padding: `${S[2]}px 0 ${S[1]}px`, textAlign: 'center' }}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAddMode('choose')} disabled={!wallet && !previewMethods} style={{ ...btn('secondary', { full: true }), opacity: (wallet || previewMethods) ? 1 : 0.6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: S[2] }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Add payment method
        </button>
      )}
    </div>
  );
}

// Connect an external crypto wallet (paste address) into the shared cross-chain registry. Honest: a pasted
// wallet receives Tallys + shows here, but paying FROM it (signing) needs real wallet-connect — coming soon.
function ConnectWalletForm({ existing, onAdd, onCancel }: { existing: ConnWallet[]; onAdd: (w: ConnWallet) => void; onCancel: () => void }) {
  const [chain, setChain] = useState<ConnWallet['chain']>('solana');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [formErr, setFormErr] = useState('');

  function add() {
    const a = address.trim();
    if (!a) { setFormErr('Enter a wallet address'); return; }
    if (existing.some(w => w.address === a)) { setFormErr('That wallet is already connected'); return; }
    onAdd({ id: `${a.slice(0, 8)}-${existing.length}`, chain, address: a, label: label.trim() || undefined });
  }

  return (
    <div style={{ ...surface({ pad: S[4] }), display: 'flex', flexDirection: 'column', gap: S[3] }}>
      <div style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 600 }}>Connect a wallet</div>
      <div style={{ display: 'flex', gap: S[2] }}>
        {(['solana', 'ethereum', 'bitcoin'] as const).map(c => (
          <button key={c} onClick={() => setChain(c)} style={{ ...btn(chain === c ? 'primary' : 'secondary'), padding: '7px 12px', fontSize: 12, flex: 1, ...(chain === c ? {} : { color: 'var(--text-muted)' }) }}>{CHAIN_META[c].label}</button>
        ))}
      </div>
      <input value={address} onChange={e => { setAddress(e.target.value); setFormErr(''); }} placeholder={`${CHAIN_META[chain].label} wallet address`} style={input()} />
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (optional)" style={input()} />
      {formErr && <div style={{ ...t('meta'), color: RED }}>{formErr}</div>}
      <div style={{ display: 'flex', gap: S[2] }}>
        <button onClick={add} disabled={!address.trim()} style={{ ...btn('primary', { full: true }), flex: 1, opacity: address.trim() ? 1 : 0.5 }}>Connect wallet</button>
        <button onClick={onCancel} style={btn('secondary')}>Cancel</button>
      </div>
      <div style={{ ...t('micro'), color: 'var(--text-muted)', lineHeight: 1.5 }}>Connected wallets receive your Tallys and appear here. Paying from an external wallet (signing) is coming soon.</div>
    </div>
  );
}

function AddRow({ kind, label, soon, onClick }: { kind: Kind; label: string; soon?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!!soon} style={{ display: 'flex', alignItems: 'center', gap: S[3], padding: `${S[2]}px ${S[2]}px`, borderRadius: 'var(--r-sm)', background: 'none', border: 0, cursor: soon ? 'default' : 'pointer', textAlign: 'left', opacity: soon ? 0.6 : 1, width: '100%' }}>
      <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--grad-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><KindIcon kind={kind} /></span>
      <span style={{ ...t('body'), color: 'var(--text-strong)', fontWeight: 600, flex: 1 }}>{label}</span>
      {soon && <span style={{ ...t('micro'), color: 'var(--text-muted)' }}>SOON</span>}
    </button>
  );
}

export type { Method };
