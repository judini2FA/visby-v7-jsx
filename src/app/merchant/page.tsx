'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useVisbWallet } from '@/lib/wallet';
import { t, S, card, surface, btn, badge, input, sectionLabel, price, T } from '@/lib/ui';

const GREEN = 'var(--ok)';
const RED   = 'var(--danger)';
const MONO  = "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Code', monospace";

type Merchant = {
  id: string;
  name: string;
  publishable_key: string;
  secret_key_last4: string;
  webhook_url: string | null;
  merchant_wallet?: string;
  fee_bps?: number;
  active?: boolean;
  created_at: string;
};

type Reveal = { secret_key?: string; webhook_secret?: string };

// ───────────────────────────── icons ─────────────────────────────
function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" />
    </svg>
  );
}

// Small "copy to clipboard" button that flips to a checkmark for ~1.5s.
function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }
  return (
    <button type="button" onClick={copy}
      style={{ ...btn('text', { pill: false }), gap: S[1], color: copied ? GREEN : 'var(--text-muted)', padding: '6px 8px', flexShrink: 0 }}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span style={{ ...t('meta') }}>{copied ? 'Copied' : (label ?? 'Copy')}</span>
    </button>
  );
}

// A monospace value row sitting *inside* a card — uses surface() so glass never stacks on glass.
function KeyRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <div style={sectionLabel()}>{label}</div>
      <div style={{ ...surface({ pad: '10px 12px' }), display: 'flex', alignItems: 'center', gap: S[2] }}>
        <div style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 12, color: 'var(--text-strong)', wordBreak: 'break-all', lineHeight: 1.5 }}>
          {value}
        </div>
        <CopyBtn value={copyValue ?? value} />
      </div>
    </div>
  );
}

// ───────────────────────── one-time secret reveal ─────────────────────────
function RevealPanel({ reveal, onDismiss }: { reveal: Reveal; onDismiss: () => void }) {
  return (
    <div style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[4], borderColor: 'var(--warn-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>Copy these now — the secret won&apos;t be shown again</div>
      </div>
      <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
        We store only a hash of your secret key. If you lose it, rotate to generate a new one.
      </div>
      {reveal.secret_key && <KeyRow label="Secret key" value={reveal.secret_key} />}
      {reveal.webhook_secret && <KeyRow label="Webhook signing secret" value={reveal.webhook_secret} />}
      <button type="button" onClick={onDismiss} style={{ ...btn('secondary', { full: true }) }}>
        I&apos;ve saved these — dismiss
      </button>
    </div>
  );
}

// ───────────────────────── create account ─────────────────────────
function CreateAccount({ wallet, onCreated }: { wallet: string; onCreated: (m: Merchant, r: Reveal) => void }) {
  const { getAccessToken } = usePrivy();
  const [name, setName]             = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [status, setStatus]         = useState<'idle' | 'saving' | 'error'>('idle');
  const [err, setErr]               = useState('');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setErr('Enter a business name'); return; }
    setStatus('saving'); setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/merchant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ owner_wallet: wallet, name: name.trim(), webhook_url: webhookUrl.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Could not create account');
      onCreated(data.merchant, { secret_key: data.secret_key, webhook_secret: data.webhook_secret });
    } catch (e: any) {
      setErr(e.message ?? 'Could not create account');
      setStatus('error');
    }
  }

  return (
    <form onSubmit={create} style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
        <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Create your merchant account</div>
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
          Get the keys you need to add Pay with Visby to your own site.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <div style={sectionLabel()}>Business name</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Atelier Mercury" required style={input()} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <div style={sectionLabel()}>Webhook URL (optional)</div>
        <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} inputMode="url" placeholder="https://yoursite.com/visby/webhook" style={{ ...input(), fontFamily: MONO, fontSize: 13 }} />
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Where we POST signed sale events. You can add this later.</div>
      </div>

      {status === 'error' && <div style={{ ...t('meta'), color: RED }}>{err}</div>}

      <button type="submit" disabled={status === 'saving'}
        style={{ ...btn('primary', { full: true }), opacity: status === 'saving' ? 0.6 : 1, cursor: status === 'saving' ? 'not-allowed' : 'pointer' }}>
        {status === 'saving' ? 'Creating…' : 'Create merchant account'}
      </button>
    </form>
  );
}

// ───────────────────────── keys card ─────────────────────────
function KeysCard({ merchant, wallet, onMerchant, onReveal }: {
  merchant: Merchant;
  wallet: string;
  onMerchant: (m: Merchant) => void;
  onReveal: (r: Reveal) => void;
}) {
  const { getAccessToken } = usePrivy();
  const [rotating, setRotating]   = useState<'secret' | 'webhook' | null>(null);
  const [webhookUrl, setWebhookUrl] = useState(merchant.webhook_url ?? '');
  const [save, setSave]           = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr]             = useState('');

  const urlDirty = webhookUrl.trim() !== (merchant.webhook_url ?? '');

  async function rotate(which: 'secret' | 'webhook') {
    setRotating(which); setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/merchant/rotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ owner_wallet: wallet, merchant_id: merchant.id, which }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Rotation failed');
      if (data.merchant) onMerchant(data.merchant);
      onReveal(which === 'secret' ? { secret_key: data.secret_key } : { webhook_secret: data.webhook_secret });
    } catch (e: any) {
      setErr(e.message ?? 'Rotation failed');
    } finally {
      setRotating(null);
    }
  }

  async function saveWebhook(e: React.FormEvent) {
    e.preventDefault();
    setSave('saving'); setErr('');
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/merchant', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ owner_wallet: wallet, merchant_id: merchant.id, webhook_url: webhookUrl.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? 'Save failed');
      if (data.merchant) onMerchant(data.merchant);
      setSave('saved');
      setTimeout(() => setSave('idle'), 2500);
    } catch (e: any) {
      setErr(e.message ?? 'Save failed');
      setSave('error');
    }
  }

  return (
    <div style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[5] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
        <span style={{ color: 'var(--text-muted)' }}><KeyIcon /></span>
        <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Keys</div>
      </div>

      <KeyRow label="Publishable key (public — embed it)" value={merchant.publishable_key} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] }}>
          <div style={sectionLabel()}>Secret key</div>
          <button type="button" onClick={() => rotate('secret')} disabled={!!rotating}
            style={{ ...btn('text', { pill: false }), opacity: rotating ? 0.5 : 1 }}>
            {rotating === 'secret' ? 'Rotating…' : 'Rotate'}
          </button>
        </div>
        <div style={{ ...surface({ pad: '10px 12px' }), fontFamily: MONO, fontSize: 12, color: 'var(--text-strong)' }}>
          sk_visby_…{merchant.secret_key_last4}
        </div>
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Shown only once at creation or rotation. Used for server-to-server calls.</div>
      </div>

      <form onSubmit={saveWebhook} style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <div style={sectionLabel()}>Webhook URL</div>
        <div style={{ display: 'flex', gap: S[2] }}>
          <input value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} inputMode="url" placeholder="https://yoursite.com/visby/webhook"
            style={{ ...input(), fontFamily: MONO, fontSize: 13 }} />
          <button type="submit" disabled={!urlDirty || save === 'saving'}
            style={{ ...btn('secondary', { pill: false }), opacity: (!urlDirty || save === 'saving') ? 0.5 : 1, cursor: (!urlDirty || save === 'saving') ? 'not-allowed' : 'pointer' }}>
            {save === 'saving' ? '…' : 'Save'}
          </button>
        </div>
        {save === 'saved' && <div style={{ ...t('meta'), color: GREEN }}>Webhook URL saved</div>}
      </form>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
          <div style={sectionLabel()}>Webhook signing secret</div>
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>We use it to HMAC-sign events so you can verify them.</div>
        </div>
        <button type="button" onClick={() => rotate('webhook')} disabled={!!rotating}
          style={{ ...btn('text', { pill: false }), opacity: rotating ? 0.5 : 1, flexShrink: 0 }}>
          {rotating === 'webhook' ? 'Rotating…' : 'Rotate'}
        </button>
      </div>

      {err && <div style={{ ...t('meta'), color: RED }}>{err}</div>}
    </div>
  );
}

// ───────────────────────── embed card ─────────────────────────
function EmbedCard() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://YOUR_DOMAIN';

  const serverSnippet =
`curl -X POST ${origin}/api/sdk/checkout \\
  -H "Authorization: Bearer sk_visby_YOUR_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{"product_name":"Air Max 1 '\\''86 OG","serial_number":"SN-000123","price":99.00,"currency":"USD"}'`;

  const buttonSnippet =
`<script src="${origin}/sdk/v1/button.js"></script>
<visby-button checkout-url="CHECKOUT_URL_FROM_STEP_1"></visby-button>`;

  return (
    <div style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[5] }}>
      <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Embed</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] }}>
          <div style={sectionLabel()}>1. Create a session on your server</div>
          <CopyBtn value={serverSnippet} label="Copy" />
        </div>
        <pre style={{ ...surface({ pad: '14px 14px' }), margin: 0, overflowX: 'auto', fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: 'var(--text-strong)', whiteSpace: 'pre' }}>
          {serverSnippet}
        </pre>
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
          Returns <code style={{ fontFamily: MONO }}>{`{ session_id, checkout_url }`}</code>. Your secret key never touches the browser — keep this call server-side.
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] }}>
          <div style={sectionLabel()}>2. Drop the button on your page</div>
          <CopyBtn value={buttonSnippet} label="Copy" />
        </div>
        <pre style={{ ...surface({ pad: '14px 14px' }), margin: 0, overflowX: 'auto', fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: 'var(--text-strong)', whiteSpace: 'pre' }}>
          {buttonSnippet}
        </pre>
        <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
          The button opens checkout in a popup and fires a <code style={{ fontFamily: MONO }}>visby:complete</code> event on success.
        </div>
      </div>

      <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
        The button and hosted checkout are live. <a href="/sdk" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Full integration guide →</a>
      </div>
    </div>
  );
}

// ───────────────────────── sales + webhook deliveries ─────────────────────────
type Delivery = {
  id: string;
  product_name: string;
  status: string;
  created_at: string;
  webhook_attempts: number;
  webhook_next_attempt_at: string | null;
  webhook_last_error: string | null;
  delivery_status: 'delivered' | 'retrying' | 'failed';
};

const AMBER = 'var(--warn)';

function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function DeliveryRow({ d }: { d: Delivery }) {
  const variant = d.delivery_status === 'delivered' ? 'success' : d.delivery_status === 'failed' ? 'danger' : 'default';
  const label = d.delivery_status === 'delivered' ? 'Delivered' : d.delivery_status === 'failed' ? 'Failed' : 'Retrying';
  const detail =
    d.delivery_status === 'retrying'
      ? `Next try ${shortDate(d.webhook_next_attempt_at)} · ${d.webhook_attempts} attempts`
      : d.delivery_status === 'failed'
        ? (d.webhook_last_error ?? 'Gave up after retries')
        : `${d.webhook_attempts} attempt${d.webhook_attempts === 1 ? '' : 's'}`;

  return (
    <div style={{ ...surface({ pad: '10px 12px' }), display: 'flex', alignItems: 'center', gap: S[3] }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ ...t('meta'), color: 'var(--text-strong)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {d.product_name}
        </div>
        <div style={{ ...t('micro'), color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shortDate(d.created_at)} · {detail}
        </div>
      </div>
      <span style={{ ...badge(variant), ...(d.delivery_status === 'retrying' ? { color: AMBER, borderColor: 'var(--warn-soft)', background: 'var(--warn-soft)' } : {}) }}>
        {label}
      </span>
    </div>
  );
}

function SalesCard({ merchant, wallet }: { merchant: Merchant; wallet: string }) {
  const { getAccessToken } = usePrivy();
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);
  const [pending, setPending]       = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(
          `/api/merchant/deliveries?owner_wallet=${encodeURIComponent(wallet)}&merchant_id=${encodeURIComponent(merchant.id)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (!cancelled && res.ok) { setDeliveries(data.deliveries ?? []); setPending(data.pending_count ?? 0); }
        else if (!cancelled) setDeliveries([]);
      } catch {
        if (!cancelled) setDeliveries([]);
      }
    })();
    return () => { cancelled = true; };
  }, [merchant.id, wallet, getAccessToken]);

  return (
    <div style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] }}>
        <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Sales &amp; webhooks</div>
        {pending > 0 && <span style={{ ...badge('default'), color: AMBER, borderColor: 'var(--warn-soft)', background: 'var(--warn-soft)' }}>{pending} awaiting delivery</span>}
      </div>

      {deliveries === null ? (
        <div style={{ height: 64, background: 'var(--glass-bg)', borderRadius: 'var(--r)', animation: 'pulse 2s infinite' }} />
      ) : deliveries.length === 0 ? (
        <div style={{ ...surface({ pad: '28px 16px' }), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2], textAlign: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
          </svg>
          <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>No Pay-with-Visby sales yet</div>
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Sales made through your embedded button will appear here, with their webhook delivery status.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {deliveries.map(d => <DeliveryRow key={d.id} d={d} />)}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── orders + revenue (blueprint 5.1 / 5.2 / 5.3) ─────────────────────────
type StatusCounts = { paid: number; minted: number; failed: number; pending: number; cancelled: number };

type Summary = {
  gross_usd: number;
  platform_fee_usd: number;
  merchant_net_usd: number;
  count: number;
  by_status: StatusCounts;
};

type Order = {
  id: string;
  product_name: string;
  price_usdc: number;
  currency: string;
  status: 'pending' | 'paid' | 'minted' | 'failed' | 'cancelled';
  buyer_wallet: string | null;
  pay_method: string | null;
  fee_bps: number | null;
  platform_fee_usd: number | null;
  merchant_net_usd: number | null;
  created_at: string;
  paid_at: string | null;
  minted_at: string | null;
  webhook_delivered: boolean;
  webhook_last_error: string | null;
  nft_mint_address: string | null;
  serial_number: string | null;
};

function money(n: number | null | undefined): string {
  return `$${(n ?? 0).toFixed(2)}`;
}

function StatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

function StatTile({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div style={{ ...surface({ pad: '12px 14px' }), display: 'flex', flexDirection: 'column', gap: S[1], flex: 1, minWidth: 0 }}>
      <div style={sectionLabel()}>{label}</div>
      {emphasize ? (
        <div style={{ ...price('sm') }}>{value}</div>
      ) : (
        <div style={{ ...t('heading'), color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      )}
    </div>
  );
}

function RevenueCard({ summary }: { summary: Summary | null }) {
  return (
    <div style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
        <span style={{ color: 'var(--text-muted)' }}><StatIcon /></span>
        <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Revenue</div>
      </div>

      {summary === null ? (
        <div style={{ height: 84, background: 'var(--glass-bg)', borderRadius: 'var(--r)', animation: 'pulse 2s infinite' }} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: S[2], flexWrap: 'wrap' }}>
            <StatTile label="Gross (GMV)" value={money(summary.gross_usd)} />
            <StatTile label="Platform fees" value={money(summary.platform_fee_usd)} />
            <StatTile label="Your net" value={money(summary.merchant_net_usd)} emphasize />
          </div>
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
            {summary.count} settled order{summary.count === 1 ? '' : 's'} · {summary.by_status.minted} minted · {summary.by_status.paid} paid · {summary.by_status.pending} pending · {summary.by_status.failed} failed · {summary.by_status.cancelled} cancelled
          </div>
        </>
      )}
    </div>
  );
}

function statusBadgeVariant(status: Order['status']): 'success' | 'danger' | 'default' {
  if (status === 'minted') return 'success';
  if (status === 'failed') return 'danger';
  return 'default';
}

function webhookLabel(o: Order): { text: string; variant: 'success' | 'danger' | 'default' } {
  if (o.webhook_delivered) return { text: 'Delivered', variant: 'success' };
  if (o.status === 'minted' || o.status === 'failed') {
    const err = o.webhook_last_error ? ` · ${o.webhook_last_error.slice(0, 40)}` : '';
    return { text: `Failed${err}`, variant: 'danger' };
  }
  return { text: 'Pending', variant: 'default' };
}

function OrderRow({ order, onResend }: { order: Order; onResend: (id: string) => Promise<boolean> }) {
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const wh = webhookLabel(order);
  const canResend = !order.webhook_delivered && (order.status === 'minted' || order.status === 'failed');

  async function handleResend() {
    setSendState('sending');
    const ok = await onResend(order.id);
    setSendState(ok ? 'sent' : 'error');
  }

  return (
    <div style={{ ...surface({ pad: '12px 14px' }), display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ ...t('meta'), color: 'var(--text-strong)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {order.product_name}
          </div>
          <div style={{ ...t('micro'), color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
            {shortDate(order.created_at)}{order.serial_number ? ` · ${order.serial_number}` : ''}
          </div>
        </div>
        <span style={badge(statusBadgeVariant(order.status))}>{order.status}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: S[4] }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={sectionLabel()}>Price</div>
            <div style={{ ...t('meta'), color: 'var(--text-strong)', fontWeight: 600 }}>{money(order.price_usdc)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={sectionLabel()}>Your net</div>
            <div style={{ ...t('meta'), color: 'var(--text-strong)', fontWeight: 600 }}>{money(order.merchant_net_usd)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2], flexWrap: 'wrap' }}>
        <span style={{ ...badge(wh.variant), ...(wh.variant === 'default' ? { color: 'var(--text-muted)' } : {}) }}>{wh.text}</span>
        {canResend && (
          <button type="button" onClick={handleResend} disabled={sendState === 'sending' || sendState === 'sent'}
            style={{ ...btn('text', { pill: false }), padding: '4px 8px', opacity: sendState === 'sending' ? 0.6 : 1 }}>
            {sendState === 'idle' && 'Re-send webhook'}
            {sendState === 'sending' && 'Sending…'}
            {sendState === 'sent' && <span style={{ color: GREEN }}>Sent</span>}
            {sendState === 'error' && <span style={{ color: RED }}>Failed — retry</span>}
          </button>
        )}
      </div>
    </div>
  );
}

function OrdersCard({ merchant, wallet, orders, onRefresh }: {
  merchant: Merchant;
  wallet: string;
  orders: Order[] | null;
  onRefresh: () => void;
}) {
  const { getAccessToken } = usePrivy();

  async function resend(order_id: string): Promise<boolean> {
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/merchant/redeliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ owner_wallet: wallet, merchant_id: merchant.id, order_id }),
      });
      const data = await res.json();
      const ok = res.ok && !data.error && !!data.delivered;
      if (ok) onRefresh();
      return ok;
    } catch {
      return false;
    }
  }

  return (
    <div style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[4] }}>
      <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Orders</div>

      {orders === null ? (
        <div style={{ height: 96, background: 'var(--glass-bg)', borderRadius: 'var(--r)', animation: 'pulse 2s infinite' }} />
      ) : orders.length === 0 ? (
        <div style={{ ...surface({ pad: '28px 16px' }), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2], textAlign: 'center' }}>
          <span style={{ color: 'var(--text-muted)' }}><StatIcon /></span>
          <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>No orders yet</div>
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Orders placed through your embedded button will appear here.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
          {orders.map(o => <OrderRow key={o.id} order={o} onResend={resend} />)}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── install tutorial (opt-in, opens only on the header button) ─────────────────────────
function HelpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function TutorialStep({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: S[3] }}>
      <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'var(--grad-brand)', backgroundSize: 'cover', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, fontFamily: "'Manrope',sans-serif" }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: S[2] }}>
        <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

// A code block with a copy button, matching EmbedCard's monospace style.
function TutorialCode({ code }: { code: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 1 }}><CopyBtn value={code} label="Copy" /></div>
      <pre style={{ ...surface({ pad: '14px 14px' }), margin: 0, overflowX: 'auto', fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: 'var(--text-strong)', whiteSpace: 'pre' }}>
        {code}
      </pre>
    </div>
  );
}

function InstallTutorial({ onClose }: { onClose: () => void }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://YOUR_DOMAIN';

  const sessionSnippet =
`curl -X POST ${origin}/api/sdk/checkout \\
  -H "Authorization: Bearer sk_visby_YOUR_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{
    "product_name": "Air Max 1 '\\''86 OG",
    "serial_number": "SN-000123",
    "price": 99.00,
    "currency": "USD",
    "success_url": "https://yoursite.com/thanks"
  }'`;

  const buttonSnippet =
`<script src="${origin}/sdk/v1/button.js" async></script>
<visby-button checkout-url="CHECKOUT_URL_FROM_STEP_2"></visby-button>`;

  const completeSnippet =
`document.querySelector('visby-button')
  .addEventListener('visby:complete', (e) => {
    // e.detail = { order_id, nft_address }
    window.location = '/thanks?order=' + e.detail.order_id;
  });`;

  const verifySnippet =
`const crypto = require('crypto');

// Header: "Visby-Signature: t=<timestamp>,v1=<hmac>"
function verifyVisby(rawBody, header, secret) {
  const parts = Object.fromEntries(
    header.split(',').map(p => p.split('='))
  );
  const expected = crypto
    .createHmac('sha256', secret)
    .update(parts.t + '.' + rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(parts.v1), Buffer.from(expected)
  );
}`;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(6,6,10,0.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: S[4], overflowY: 'auto' }}
      role="dialog"
      aria-modal="true"
      aria-label="How to install Pay with Visby"
    >
      <div onClick={e => e.stopPropagation()} style={{ ...card({ pad: S[5] }), width: '100%', maxWidth: 640, margin: 'auto', display: 'flex', flexDirection: 'column', gap: S[5] }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: S[2] }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: S[1] }}>
            <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Pay with Visby</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>How it works &mdash; and how to add it to your store.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...btn('text', { pill: false }), color: 'var(--text-muted)', padding: 6, flexShrink: 0 }}>
            <CloseIcon />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: S[5] }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>What it is</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
              Pay with Visby lets you sell an item and hand the buyer a <strong style={{ color: 'var(--text-strong)' }}>Tally</strong> &mdash; a tamper-proof certificate of authenticity and ownership, recorded on-chain. Buyers pay by card, bank, or crypto; you&rsquo;re paid your net automatically. Visby never holds your funds.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>What your buyer experiences</div>
            {[
              'They click the Pay with Visby button on your site.',
              'They pay in a secure popup — card, bank, or crypto — seeing the full price up front.',
              'They receive the item’s Tally; you’re paid your net (fee is 3.5%, minimum $0.50).',
            ].map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: S[2], alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0, marginTop: 7, width: 6, height: 6, borderRadius: '50%', background: 'var(--grad-brand)' }} />
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{line}</div>
              </div>
            ))}
            <div style={{ ...surface({ pad: '20px 16px' }), display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[2], marginTop: S[1] }}>
              {/* Static replica of the real <visby-button> (public/sdk/v1/button.js) so merchants see the button without embedding the live SDK. Gradient/mark/wordmark match button.js exactly. */}
              <div aria-label="Pay with Visby button preview" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '15px 28px', borderRadius: 999,
                fontFamily: '"Quicksand",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
                fontStyle: 'italic', fontWeight: 600, fontSize: 18, letterSpacing: '-0.01em', lineHeight: 1,
                color: '#33303D',
                background: 'linear-gradient(95deg,#3FD0BA 0%,#86A9F0 50%,#CF6FE0 100%)',
                boxShadow: '0 2px 12px rgba(120,110,160,.30),0 1px 2px rgba(16,18,21,.12)',
              }}>
                <img src="/visby-logo-mark.png" alt="" aria-hidden="true"
                  style={{ height: 23, width: 'auto', display: 'block', marginLeft: -6, filter: 'brightness(0)', opacity: 0.92 }} />
                <span style={{ whiteSpace: 'nowrap' }}>VisbyPay</span>
              </div>
              <div style={{ ...t('micro'), color: 'var(--text-muted)' }}>The button buyers click &mdash; looks the same in light and dark.</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: S[1] }}>
            <div style={{ ...t('heading'), color: 'var(--text-strong)' }}>Add it to your store</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Not technical? Hand these five steps to whoever builds your site.</div>
          </div>

          <TutorialStep n={1} title="Create your merchant account">
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
              Close this and create your account below to get your <strong style={{ color: 'var(--text-strong)' }}>publishable key</strong> (safe to embed) and <strong style={{ color: 'var(--text-strong)' }}>secret key</strong> (server-only, shown once). Add a webhook URL now or later.
            </div>
          </TutorialStep>

          <TutorialStep n={2} title="Create a checkout session on your server">
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Call this from your backend with your secret key — never from the browser. It returns <code style={{ fontFamily: MONO }}>{`{ session_id, checkout_url }`}</code>.</div>
            <TutorialCode code={sessionSnippet} />
          </TutorialStep>

          <TutorialStep n={3} title="Drop the button on your product page">
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>Pass the <code style={{ fontFamily: MONO }}>checkout_url</code> from step 2. The button opens checkout in a popup — it holds no secret.</div>
            <TutorialCode code={buttonSnippet} />
          </TutorialStep>

          <TutorialStep n={4} title="React when the sale completes">
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>The button fires a <code style={{ fontFamily: MONO }}>visby:complete</code> event with the order id and the minted Tally NFT address.</div>
            <TutorialCode code={completeSnippet} />
          </TutorialStep>

          <TutorialStep n={5} title="Verify webhooks (recommended)">
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>We POST signed sale events to your webhook URL with a <code style={{ fontFamily: MONO }}>Visby-Signature</code> header. Verify it with your webhook signing secret before trusting the payload.</div>
            <TutorialCode code={verifySnippet} />
          </TutorialStep>
        </div>

        <div style={{ ...surface({ pad: '12px 14px' }), display: 'flex', flexDirection: 'column', gap: S[1] }}>
          <div style={{ ...t('meta'), color: 'var(--text-strong)', fontWeight: 600 }}>Test before going live</div>
          <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
            Everything runs on sandbox keys today. Pay with Stripe test card <code style={{ fontFamily: MONO }}>4242 4242 4242 4242</code> to run a full order end-to-end.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2], flexWrap: 'wrap' }}>
          <a href="/sdk" style={{ ...t('meta'), color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Full integration guide &rarr;</a>
          <button type="button" onClick={onClose} style={{ ...btn('secondary', { pill: false }) }}>Got it</button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── page ─────────────────────────────
export default function MerchantPage() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { address: wallet } = useVisbWallet();

  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [reveal, setReveal]     = useState<Reveal | null>(null);
  const [loading, setLoading]   = useState(true);
  const [orders, setOrders]     = useState<Order[] | null>(null);
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!ready || !authenticated || !wallet) { if (ready) setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/merchant?owner_wallet=${encodeURIComponent(wallet)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled) setMerchant((data.merchants ?? [])[0] ?? null);
      } catch {
        if (!cancelled) setMerchant(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, authenticated, wallet, getAccessToken]);

  useEffect(() => {
    if (!merchant || !wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(
          `/api/merchant/orders?owner_wallet=${encodeURIComponent(wallet)}&merchant_id=${encodeURIComponent(merchant.id)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (!cancelled && res.ok) { setOrders(data.orders ?? []); setSummary(data.summary ?? null); }
        else if (!cancelled) { setOrders([]); setSummary(null); }
      } catch {
        if (!cancelled) { setOrders([]); setSummary(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [merchant, wallet, getAccessToken, refreshTick]);

  const signedOut = ready && !authenticated;
  // Signed in but Privy hasn't surfaced the embedded wallet yet — don't render Create with an empty wallet.
  const preparingWallet = ready && authenticated && !wallet;

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-page" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[2] }}>
          <span style={{ color: 'var(--text-strong)' }}><KeyIcon /></span>
          <div style={{ flex: 1, ...t('heading'), color: 'var(--text-strong)' }}>Pay with Visby</div>
          <button type="button" onClick={() => setShowHelp(true)} aria-label="How it works"
            style={{ ...btn('secondary', { pill: true }), gap: S[1], padding: '6px 12px', flexShrink: 0, marginLeft: 'auto' }}>
            <HelpIcon />
            <span style={{ ...t('meta') }}>How it works</span>
          </button>
        </div>
      </div>

      {showHelp && <InstallTutorial onClose={() => setShowHelp(false)} />}

      <div className="visby-page" style={{ paddingTop: S[5], paddingBottom: 100, display: 'flex', flexDirection: 'column', gap: S[4] }}>

        {!ready || loading || preparingWallet ? (
          <>
            {[1, 2].map(i => <div key={i} style={{ height: 140, background: 'var(--glass-bg)', borderRadius: 'var(--r-lg)', animation: 'pulse 2s infinite' }} />)}
          </>
        ) : signedOut ? (
          <div style={{ ...card({ pad: S[6] }), textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[3] }}>
            <span style={{ color: 'var(--text-muted)' }}><KeyIcon /></span>
            <div style={{ ...t('title'), color: 'var(--text-strong)' }}>Sign in to set up Pay with Visby</div>
            <div style={{ ...t('meta'), color: 'var(--text-muted)', maxWidth: 320 }}>
              Sell on your own site with chain-verified provenance. Sign in to create your merchant account and get your keys.
            </div>
          </div>
        ) : merchant ? (
          <>
            {reveal && <RevealPanel reveal={reveal} onDismiss={() => setReveal(null)} />}
            <KeysCard merchant={merchant} wallet={wallet} onMerchant={setMerchant} onReveal={setReveal} />
            <RevenueCard summary={summary} />
            <OrdersCard merchant={merchant} wallet={wallet} orders={orders} onRefresh={() => setRefreshTick(x => x + 1)} />
            <EmbedCard />
            <SalesCard merchant={merchant} wallet={wallet} />
          </>
        ) : (
          <CreateAccount wallet={wallet} onCreated={(m, r) => { setMerchant(m); setReveal(r); }} />
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }`}</style>
    </div>
  );
}
