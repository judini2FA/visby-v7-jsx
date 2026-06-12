'use client';

import { useEffect, useRef } from 'react';

// Fixed, full-bleed background. Light mode: soft pearly gradient, no glow.
// Dark mode: same composition darker + a single subtle aurora glow layer that
// drifts with the cursor (desktop) or device tilt/gravity (mobile) — near-imperceptible.
// The glow is rendered BEHIND everything and never touches glass, accents, or text.
export function BackgroundField() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = glowRef.current;
    if (!el) return;

    let raf = 0;
    // target + current, eased toward target for a slow "drifting through water" feel
    let tx = 50, ty = 38, cx = 50, cy = 38;

    const tick = () => {
      cx += (tx - cx) * 0.05;
      cy += (ty - cy) * 0.05;
      el.style.setProperty('--glow-x', `${cx.toFixed(2)}%`);
      el.style.setProperty('--glow-y', `${cy.toFixed(2)}%`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Desktop: cursor parallax (tiny amplitude around center)
    const onMove = (e: MouseEvent) => {
      tx = 50 + (e.clientX / window.innerWidth - 0.5) * 16;
      ty = 38 + (e.clientY / window.innerHeight - 0.5) * 12;
    };
    // Mobile: device tilt/gravity (gamma = L/R, beta = F/B), tiny amplitude
    const onTilt = (e: DeviceOrientationEvent) => {
      const g = e.gamma ?? 0, b = e.beta ?? 0;
      tx = 50 + Math.max(-1, Math.min(1, g / 45)) * 12;
      ty = 38 + Math.max(-1, Math.min(1, (b - 45) / 45)) * 10;
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    // Only attach gyro if already permitted; never prompt (effect must stay unobtrusive).
    const DOE = (window as any).DeviceOrientationEvent;
    const needsPrompt = DOE && typeof DOE.requestPermission === 'function';
    if (DOE && !needsPrompt) window.addEventListener('deviceorientation', onTilt, { passive: true } as any);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('deviceorientation', onTilt as any);
    };
  }, []);

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', background: 'var(--bg-0)' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-field)' }} />
      <div ref={glowRef} style={{ position: 'absolute', inset: 0, background: 'var(--field-glow)', transition: 'background .6s var(--ease)' }} />
    </div>
  );
}
