'use client';

import { useEffect, useState } from 'react';
import { t, S, card, surface, btn, badge, sectionLabel } from '@/lib/ui';

const GREEN = 'var(--ok)';
const MONO  = "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Code', monospace";
const FALLBACK_ORIGIN = 'https://YOUR_VISBY_HOST';

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
function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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

// A labelled, copyable monospace code block. Uses surface() so glass never stacks on glass.
function CodeBlock({ snippet, label }: { snippet: string; label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: S[2] }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: S[2] }}>
        {label ? <div style={sectionLabel()}>{label}</div> : <span />}
        <CopyBtn value={snippet} label="Copy code" />
      </div>
      <pre style={{ ...surface({ pad: '14px 14px' }), margin: 0, overflowX: 'auto', fontFamily: MONO, fontSize: 12, lineHeight: 1.6, color: 'var(--text-strong)', whiteSpace: 'pre' }}>
        {snippet}
      </pre>
    </div>
  );
}

// Numbered step heading row.
function StepHead({ n, title }: { n: number; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: S[3] }}>
      <div style={{ ...surface({ radius: '50%' }), width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...t('heading'), color: 'var(--text-strong)' }}>
        {n}
      </div>
      <div style={{ ...t('title'), color: 'var(--text-strong)' }}>{title}</div>
    </div>
  );
}

// ───────────────────────────── page ─────────────────────────────
export default function SdkDocsPage() {
  const [origin, setOrigin] = useState(FALLBACK_ORIGIN);
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const curlSnippet =
`curl -X POST ${origin}/api/sdk/checkout \\
  -H "Authorization: Bearer sk_visby_YOUR_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{
    "product_name": "Air Max 1 '\\''86 OG",
    "serial_number": "SN-000123",
    "price": 99.00,
    "currency": "USD",
    "success_url": "https://yoursite.com/thanks",
    "cancel_url": "https://yoursite.com/cart"
  }'

# → { "session_id": "...", "checkout_url": "${origin}/sdk/checkout/<id>" }`;

  const nodeSnippet =
`// Runs on YOUR server. The secret key must never reach the browser.
const res = await fetch("${origin}/api/sdk/checkout", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.VISBY_SECRET_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    product_name: "Air Max 1 '86 OG",
    serial_number: "SN-000123",
    price: 99.0,
    currency: "USD",
    success_url: "https://yoursite.com/thanks",
    cancel_url: "https://yoursite.com/cart",
  }),
});

const { session_id, checkout_url } = await res.json();
// Pass checkout_url to your page and render the button with it.`;

  const buttonSnippet =
`<!-- 1. Load the button once, anywhere on the page -->
<script src="${origin}/sdk/v1/button.js"></script>

<!-- 2. Drop the button. checkout-url is the one you got server-side. -->
<visby-button
  checkout-url="${origin}/sdk/checkout/<id>"
></visby-button>`;

  const listenSnippet =
`// Fires after the buyer completes payment and the NFT is minted.
document
  .querySelector("visby-button")
  .addEventListener("visby:complete", (e) => {
    const { order_id, nft_address } = e.detail;
    // Show your own confirmation, update the cart, etc.
    console.log("Visby order", order_id, "minted", nft_address);
  });`;

  const verifySnippet =
`import crypto from "crypto";

// Your route MUST read the RAW request body (not a parsed object) —
// re-serializing JSON changes bytes and breaks the signature.
export function verifyVisbyWebhook(rawBody, signatureHeader, signingSecret) {
  // Header looks like: t=1718600000,v1=9f86d0...
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => kv.split("="))
  );
  const t = parts.t;
  const expected = crypto
    .createHmac("sha256", signingSecret)
    .update(\`\${t}.\${rawBody}\`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1 || "", "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`;

  const fields: { name: string; desc: string }[] = [
    { name: 'id', desc: 'Stable event id (same on every re-delivery) — dedupe on this' },
    { name: 'type', desc: "'order.completed' once the NFT is minted, else 'order.payment_succeeded'" },
    { name: 'order_id', desc: 'The session_id from step 1' },
    { name: 'nft_address', desc: 'On-chain mint address (null until minting finalizes)' },
    { name: 'minted', desc: 'true when the NFT exists; false = payment in, provenance pending' },
    { name: 'serial_number', desc: 'The serial you passed when creating the session' },
    { name: 'product_name', desc: 'The product name you passed when creating the session' },
    { name: 'amount_usd', desc: 'Amount charged to the buyer, in USD' },
    { name: 'payment_confirmed', desc: 'true — the payment succeeded' },
  ];

  return (
    <div style={{ background: 'transparent', minHeight: '100vh', fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--glass-bg-strong)', backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)', borderBottom: '1px solid var(--divider)', boxShadow: '0 2px 16px rgba(0,0,0,.06)' }}>
        <div className="visby-page" style={{ paddingTop: S[3], paddingBottom: S[3], display: 'flex', alignItems: 'center', gap: S[2] }}>
          <span style={{ color: 'var(--text-strong)' }}><CodeIcon /></span>
          <div style={{ flex: 1, ...t('heading'), color: 'var(--text-strong)' }}>Pay with Visby — Integration</div>
        </div>
      </div>

      <div className="visby-page" style={{ paddingTop: S[5], paddingBottom: 100, display: 'flex', flexDirection: 'column', gap: S[4] }}>

        {/* Intro */}
        <div style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: S[2] }}>
            <span style={{ ...badge('default') }}>SDK v1</span>
          </div>
          <div style={{ ...t('display'), color: 'var(--text-strong)' }}>Sell with chain-verified provenance</div>
          <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
            Pay with Visby lets you take payments on your own site and hand every buyer an NFT proving the
            item is authentic. Your server creates a locked checkout session; you drop a button on the page;
            Visby hosts the secure payment and mints the provenance NFT; we send your server a signed event
            when it&apos;s done. Three short steps below.
          </div>
          <a href="/merchant" style={{ ...btn('primary'), alignSelf: 'flex-start' }}>
            Get your keys at /merchant
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </a>
        </div>

        {/* Step 1 — Create a checkout session */}
        <div style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[4] }}>
          <StepHead n={1} title="Create a checkout session" />
          <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
            From your <strong style={{ color: 'var(--text-strong)' }}>server</strong>, POST the product, serial,
            and price to <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-strong)' }}>/api/sdk/checkout</span> with
            your secret key. You get back a <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-strong)' }}>checkout_url</span> —
            an absolute Visby URL with the price and serial already locked in.
          </div>
          <div style={{ ...surface({ pad: '10px 12px' }), display: 'flex', alignItems: 'flex-start', gap: S[2] }}>
            <span style={{ color: 'var(--warn)', marginTop: 1 }}><ShieldIcon /></span>
            <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>
              Your secret key <strong style={{ color: 'var(--text-strong)' }}>sk_visby_…</strong> is server-only.
              Never put it in client-side code, a public repo, or the browser.
            </div>
          </div>
          <CodeBlock label="cURL" snippet={curlSnippet} />
          <CodeBlock label="Node — fetch" snippet={nodeSnippet} />
        </div>

        {/* Step 2 — Add the button */}
        <div style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[4] }}>
          <StepHead n={2} title="Add the button" />
          <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
            Load the script and render <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-strong)' }}>&lt;visby-button&gt;</span> with
            the <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-strong)' }}>checkout-url</span> from step 1.
            Clicking it opens Visby&apos;s hosted checkout in a centered popup — no secret ever touches the page.
          </div>
          <CodeBlock label="HTML" snippet={buttonSnippet} />
          <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
            When the buyer finishes, the button fires a DOM event you can listen for to update your page.
          </div>
          <CodeBlock label="JavaScript — listen for completion" snippet={listenSnippet} />
        </div>

        {/* Step 3 — Verify the webhook */}
        <div style={{ ...card({ pad: S[5] }), display: 'flex', flexDirection: 'column', gap: S[4] }}>
          <StepHead n={3} title="Verify the webhook" />
          <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
            The browser event is for UX only — fulfill orders from the webhook. Visby POSTs a signed event to
            your webhook URL with a <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-strong)' }}>Visby-Signature</span> header
            shaped like <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-strong)' }}>t=&lt;ts&gt;,v1=&lt;hmac&gt;</span>.
            Recompute the HMAC over <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-strong)' }}>{'`${t}.${rawBody}`'}</span> with
            your webhook signing secret and compare in constant time.
          </div>
          <CodeBlock label="Node — verify signature" snippet={verifySnippet} />

          <div style={{ ...t('body'), color: 'var(--text-muted)' }}>
            Return 2xx to acknowledge. If your endpoint is down we retry with backoff for ~24h, so make handling
            idempotent — dedupe on the event <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-strong)' }}>id</span>, which is identical across re-deliveries.
          </div>
          <div style={{ ...t('body'), color: 'var(--text-muted)' }}>The JSON payload contains:</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {fields.map((f, i) => (
              <div key={f.name} style={{ display: 'flex', gap: S[3], alignItems: 'baseline', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--divider)' }}>
                <code style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-strong)', fontWeight: 700, flexShrink: 0, minWidth: 132 }}>{f.name}</code>
                <div style={{ ...t('meta'), color: 'var(--text-muted)' }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
