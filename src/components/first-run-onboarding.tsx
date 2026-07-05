'use client';

import { useEffect, useState } from 'react';
import { t, S, btn, card, T } from '@/lib/ui';

// Blueprint 7.1 — first-run onboarding. A one-time, plain-English intro (what Visby is, what a Tally is,
// how paying works) with ZERO crypto jargon — the "toddler-proof" entry. localStorage-gated so it shows
// once per device; fully skippable. Rendered on the home page.
const SEEN_KEY = 'visby-onboarding-seen-v2';

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
const Tag = (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="url(#g4)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <defs><linearGradient id="g4" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#25CDB8" /><stop offset="0.5" stopColor="#2A8AED" /><stop offset="1" stopColor="#BC2DE6" /></linearGradient></defs>
    <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
    <circle cx="7.5" cy="7.5" r="1.3" />
  </svg>
);
const Box = (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="url(#g5)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <defs><linearGradient id="g5" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#25CDB8" /><stop offset="0.5" stopColor="#2A8AED" /><stop offset="1" stopColor="#BC2DE6" /></linearGradient></defs>
    <path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" />
  </svg>
);
const Heart = (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="url(#g6)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <defs><linearGradient id="g6" x1="0" y1="0" x2="24" y2="24"><stop stopColor="#25CDB8" /><stop offset="0.5" stopColor="#2A8AED" /><stop offset="1" stopColor="#BC2DE6" /></linearGradient></defs>
    <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" />
  </svg>
);

const SLIDES: Slide[] = [
  { icon: ShieldCheck, title: 'Welcome to Visby', body: 'Visby is where you buy and sell real luxury goods, like sneakers, watches, and bags. The best part is that every item comes with proof it’s genuine, so you never have to wonder whether it’s the real thing.' },
  { icon: Sparkle, title: 'Every item has a Tally', body: 'A Tally is an item’s certificate of authenticity. It proves the item is real and shows everyone who has ever owned it. Tallys are NFTs used as authenticators, so they can’t be faked, copied, or tampered with. You don’t need to know anything about crypto, it just works quietly in the background.' },
  { icon: Tag, title: 'Buying is easy', body: 'Find something you love, then pay however you like, with a card, a bank transfer, or crypto. The seller ships it to you, and the item’s Tally becomes yours, so its whole history comes along with it.' },
  { icon: Box, title: 'Selling is simple too', body: 'List your item and set a price. We’ll show you exactly what you keep after our small fee, before anything is final. When it sells, we handle the payment and pass the Tally to the new owner for you.' },
  { icon: Heart, title: 'You’re all set', body: 'That’s really all there is to it. No seed phrases, no confusing wallets, and no jargon. Just real items you can trust. Have a look around and enjoy.' },
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
