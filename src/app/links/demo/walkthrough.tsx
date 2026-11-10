'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { t, S, T, btn, card, sectionLabel } from '@/lib/ui';
import { PhoneFrame } from './phone';
import { HomeScreen, ItemScreen, CheckoutScreen, OrderScreen, ResellScreen } from './screens';
import { WALKTHROUGH, WALKTHROUGH_INTRO } from './copy';

const SCREENS: { label: string; node: ReactNode }[] = [
  { label: 'The Visby home screen with a grid of items for sale', node: <HomeScreen /> },
  { label: 'An item page with its badges, price and Tally', node: <ItemScreen /> },
  { label: 'The checkout screen paying by card with free shipping', node: <CheckoutScreen /> },
  { label: 'An order that has shipped, with Visby holding the payment', node: <OrderScreen stage="shipping" /> },
  { label: 'A delivered order with the Tally now listing you as the owner', node: <OrderScreen stage="delivered" /> },
  { label: 'Listing the item for resale with the fee and payout shown', node: <ResellScreen /> },
];

// globals.css turns all motion off site-wide (!important). The walkthrough opts back in on purpose, scoped to
// .vp-slide, and still honours prefers-reduced-motion.
const OUT_MS = 200;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Walkthrough() {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1 | 0>(0);
  const [dx, setDx] = useState(0);          // live finger offset while dragging
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<1 | -1 | 0>(0);   // slide-out in progress (1 = going to next)
  const gesture = useRef<{ x: number; y: number; locked: boolean } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const wheel = useRef({ acc: 0, timer: 0, lockedUntil: 0 });
  const latest = useRef({ i: 0, leaving: 0 as 1 | -1 | 0, commit: (_n: number) => {} });
  const last = WALKTHROUGH.length - 1;
  const step = WALKTHROUGH[i];

  function show(n: number) {
    setDir(n > i ? 1 : -1);
    setI(n);
  }

  // Every way of changing step (swipe, Next, Back, dots) slides the current screen out, then the new one in.
  function commit(n: number) {
    if (n < 0 || n > last || n === i || leaving) return;
    if (reducedMotion()) { show(n); return; }
    setLeaving(n > i ? 1 : -1);
    window.setTimeout(() => { setLeaving(0); setDx(0); show(n); }, OUT_MS);
  }

  latest.current = { i, leaving, commit };

  // Touch, pen and mouse drags. Vertical drags still scroll the phone's home screen.
  const onDown = (e: PointerEvent) => {
    if (leaving || (e.pointerType === 'mouse' && e.button !== 0)) return;
    gesture.current = { x: e.clientX, y: e.clientY, locked: false };
  };
  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const mx = e.clientX - g.x, my = e.clientY - g.y;
    if (!g.locked) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { gesture.current = null; return; }
      if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.2) {
        g.locked = true; setDragging(true);
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
      } else return;
    }
    const atEdge = (mx > 0 && i === 0) || (mx < 0 && i === last);
    setDx(atEdge ? mx * 0.25 : mx);   // rubber-band at the first and last step
  };
  const onUp = () => {
    const g = gesture.current; gesture.current = null;
    if (!g?.locked) return;
    setDragging(false);
    const target = dx < 0 ? i + 1 : i - 1;
    if (Math.abs(dx) > 56 && target >= 0 && target <= last) commit(target);
    else setDx(0);
  };
  const onCancel = () => { gesture.current = null; setDragging(false); setDx(0); };

  // Trackpad two-finger sideways scrolls: follow a little, then change step once it passes a threshold.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const w = wheel.current, { i: cur, leaving: busy, commit: go } = latest.current;
      if (busy || Date.now() < w.lockedUntil) return;
      w.acc += e.deltaX;
      const target = w.acc > 0 ? cur + 1 : cur - 1;
      const blocked = target < 0 || target > WALKTHROUGH.length - 1;
      setDx(Math.max(-120, Math.min(120, -w.acc * (blocked ? 0.2 : 0.6))));
      window.clearTimeout(w.timer);
      w.timer = window.setTimeout(() => { w.acc = 0; setDx(0); }, 140);
      if (Math.abs(w.acc) > 90 && !blocked) { w.acc = 0; w.lockedUntil = Date.now() + 600; go(target); }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); commit(i + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); commit(i - 1); }
  };

  const slideStyle = {
    display: 'flex', flexDirection: 'column', gap: S[3], flexShrink: 0,
    transform: leaving ? `translateX(${-leaving * 110}%)` : `translateX(${dx}px)`,
    opacity: leaving ? 0 : 1 - Math.min(Math.abs(dx) / 400, 0.35),
    userSelect: 'none', willChange: 'transform',
  } as const;

  return (
    <section aria-labelledby="walkthrough-title" style={{ ...card(), padding: S[5], display: 'flex', flexDirection: 'column', alignItems: 'center', gap: S[4] }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: S[1] }}>
        <div style={sectionLabel()}>{WALKTHROUGH_INTRO.eyebrow}</div>
        <h2 id="walkthrough-title" style={{ ...t('title'), color: T.textStrong, margin: 0 }}>{WALKTHROUGH_INTRO.title}</h2>
        <p style={{ ...t('meta'), color: T.textMuted, margin: 0 }}>{WALKTHROUGH_INTRO.hint}</p>
      </div>

      <style dangerouslySetInnerHTML={{ __html: '@media (prefers-reduced-motion: no-preference){.vp-slide{transition:transform .2s ease-out,opacity .2s ease-out !important}.vp-slide[data-dragging="true"]{transition:none !important}.vp-slide[data-dir="1"]{animation:vp-in-r .3s cubic-bezier(.2,.8,.2,1) !important}.vp-slide[data-dir="-1"]{animation:vp-in-l .3s cubic-bezier(.2,.8,.2,1) !important}}@keyframes vp-in-r{from{opacity:0;transform:translateX(70%)}to{opacity:1;transform:none}}@keyframes vp-in-l{from{opacity:0;transform:translateX(-70%)}to{opacity:1;transform:none}}' }} />
      <div ref={wrapRef} tabIndex={0} aria-label="Walkthrough. Swipe, drag or use the arrow keys to change step." onKeyDown={onKey} onDragStart={e => e.preventDefault()} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} style={{ touchAction: 'pan-y', width: '100%', display: 'flex', justifyContent: 'center', userSelect: 'none', WebkitUserSelect: 'none', cursor: dragging ? 'grabbing' : 'grab', outline: 'none' }}>
        <PhoneFrame label={SCREENS[i].label}>
          <div key={i} className="vp-slide" data-dir={dir} data-dragging={dragging} style={slideStyle}>{SCREENS[i].node}</div>
        </PhoneFrame>
      </div>

      <div role="group" aria-label="Walkthrough steps" style={{ display: 'flex', gap: S[2] }}>
        {WALKTHROUGH.map((s, n) => (
          <button key={s.title} type="button" onClick={() => commit(n)} aria-label={`Step ${n + 1}: ${s.title}`} aria-current={n === i ? 'step' : undefined}
            style={{ width: n === i ? 24 : 8, height: 8, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer', background: n === i ? 'var(--text-strong)' : 'var(--divider)', transition: 'width .2s var(--ease)' }} />
        ))}
      </div>

      <div aria-live="polite" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: S[1], minHeight: 96, maxWidth: 340 }}>
        <div style={sectionLabel()}>Step {i + 1} of {WALKTHROUGH.length}</div>
        <h3 style={{ ...t('heading'), color: T.textStrong, margin: 0 }}>{step.title}</h3>
        <p style={{ ...t('body'), color: T.textMuted, margin: 0 }}>{step.caption}</p>
      </div>

      <div style={{ display: 'flex', gap: S[3], width: '100%', maxWidth: 340 }}>
        <button type="button" onClick={() => commit(i - 1)} disabled={i === 0 || !!leaving} style={{ ...btn('secondary', { full: true }), opacity: i === 0 ? 0.4 : 1 }}>Back</button>
        <button type="button" onClick={() => { if (i === last) { if (!leaving) { setDir(-1); setI(0); } } else commit(i + 1); }} style={btn('primary', { full: true })}>{i === last ? 'Start over' : 'Next'}</button>
      </div>
    </section>
  );
}
