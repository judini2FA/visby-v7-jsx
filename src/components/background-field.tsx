'use client';

// Fixed, full-bleed background: a soft pearly gradient (light) / darker composition (dark).
// No glow layer — rendered BEHIND everything and never touches glass, accents, or text.
export function BackgroundField() {
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: -1, pointerEvents: 'none', background: 'var(--bg-0)' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-field)' }} />
    </div>
  );
}
