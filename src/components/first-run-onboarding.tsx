'use client';

import { useEffect, useState } from 'react';
import { t, S, btn, card, T } from '@/lib/ui';

// Blueprint 7.1 — first-run onboarding. A one-time, plain-English intro (what Visby is, what a Tally is,
// how paying works) with ZERO crypto jargon — the "toddler-proof" entry. localStorage-gated so it shows
// once per device; fully skippable. Rendered on the home page.
const SEEN_KEY = 'visby-onboarding-seen-v1';

type Slide = { icon: React.ReactNode; title: string; body: string };

const ShieldCheck = (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="url(#g)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <defs><linearGradient id="g" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#25CDB8" /><stop offset="0.5" stopColor="#2A8AED" /><stop offset="1" stopColor="#BC2DE6" /></linearGradient></defs>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);
const Sparkle = (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="url(#g2)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <defs><linearGradient id="g2" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#25CDB8" /><stop offset="0.5" stopColor="#2A8AED" /><stop offset="1" stopColor="#BC2DE6" /></linearGradient></defs>
    <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
  </svg>
);
const Wallet = (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="url(#g3)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <defs><linearGradient id="g3" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#25CDB8" /><stop offset="0.5" stopColor="#2A8AED" /><stop offset="1" stopColor="#BC2DE6" /></linearGradient></defs>
    <rect x="2.5" y="6" width="19" height="13" rx="2.5" />
    <path d="M16 12.5h2" /><path d="M2.5 10h19" />
  </svg>
);

const SLIDES: Slide[] = [
  { icon: ShieldCheck, title: 'Welcome to Visby', body: 'Buy and sell real luxury goods — sneakers, watches, bags — with proof they’re authentic. No fakes, no guessing.' },
  { icon: Sparkle, title: 'Every item has a Tally', body: 'A Tally is a tamper-proof certificate that travels with the item. It proves the item is real and shows its full ownership history. You don’t need to know anything about crypto — it just works.' },
  { icon: Wallet, title: 'Pay your way', body: 'Card, bank transfer, or instant — whatever you prefer. We handle the rest: your item ships, and its Tally becomes yours. You’ll always see the full price before you confirm.' },
];

export function FirstRunOnboarding() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch { /* storage blocked — just don't show it */ }
  }, []);

  function dismiss() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch {}
    setOpen(false);
  }

  if (!open) return null;
  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 2147483000, background: 'var(--modal-scrim, rgba(0,0,0,.45))', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...card(), width: '100%', maxWidth: 460, margin: 0, borderRadius: '28px 28px 0 0', padding: `${S[6]}px ${S[5]}px ${S[5]}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
      >
        <div style={{ width: 64, height: 64, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--glass-bg-strong)', border: '1px solid var(--glass-border)', marginBottom: S[4] }}>
          {slide.icon}
        </div>

        <div style={{ ...t('title'), color: T.textStrong }}>{slide.title}</div>
        <div style={{ ...t('body'), color: T.textMuted, marginTop: S[3], lineHeight: 1.6, minHeight: 88 }}>{slide.body}</div>

        {/* progress dots */}
        <div style={{ display: 'flex', gap: 6, marginTop: S[5], marginBottom: S[5] }}>
          {SLIDES.map((_, idx) => (
            <span key={idx} style={{ width: idx === i ? 20 : 7, height: 7, borderRadius: 4, transition: 'all .2s', background: idx === i ? 'var(--grad-brand)' : 'var(--divider)' }} />
          ))}
        </div>

        <button
          onClick={() => (last ? dismiss() : setI(i + 1))}
          style={{ ...btn('primary', { full: true }) }}
        >
          {last ? 'Start browsing' : 'Next'}
        </button>
        <button
          onClick={dismiss}
          style={{ background: 'none', border: 'none', ...t('meta'), color: T.textMuted, cursor: 'pointer', marginTop: S[3] }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
