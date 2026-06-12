import type { CSSProperties } from 'react';

// Token strings — reference the CSS variables in src/styles/tokens.css.
// Pages can repoint their local `const C` at these so colors flip with the theme.
export const T = {
  text: 'var(--text)',
  textStrong: 'var(--text-strong)',
  textMuted: 'var(--text-muted)',
  onCta: 'var(--text-on-cta)',

  aqua: 'var(--aqua)',
  turquoise: 'var(--turquoise)',
  sky: 'var(--sky)',
  electric: 'var(--electric)',
  orchid: 'var(--orchid)',
  magenta: 'var(--magenta)',
  peach: 'var(--peach)',
  amber: 'var(--amber)',
  lime: 'var(--lime)',

  gradBrand: 'var(--grad-brand)',
  gradBrandH: 'var(--grad-brand-h)',
  gradGlow: 'var(--grad-glow)',

  glassBg: 'var(--glass-bg)',
  glassBgStrong: 'var(--glass-bg-strong)',
  glassBorder: 'var(--glass-border)',
  divider: 'var(--divider)',
  inputBg: 'var(--field-input-bg)',
} as const;

type GlassOpts = { strong?: boolean; radius?: number | string; pad?: number | string; scrim?: boolean };

// Frosted glass surface. `strong` = higher opacity for text-heavy cards (legibility).
// Glass never glows — only border hairline + ambient shadow + soft inner highlight.
export function glass(o: GlassOpts = {}): CSSProperties {
  return {
    background: o.strong ? 'var(--glass-bg-strong)' : 'var(--glass-bg)',
    backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
    WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
    border: '1px solid var(--glass-border)',
    borderRadius: o.radius ?? 'var(--r)',
    boxShadow: 'var(--glass-shadow), var(--glass-inner)',
    ...(o.pad != null ? { padding: o.pad } : null),
  };
}

// Card = strong glass by default (holds text), generous radius.
export function card(o: GlassOpts = {}): CSSProperties {
  return glass({ strong: true, radius: 'var(--r-lg)', ...o });
}

// Primary CTA — brand gradient fill, pill.
export function cta(o: { radius?: number | string; pad?: string } = {}): CSSProperties {
  return {
    background: 'var(--grad-brand)',
    color: 'var(--text-on-cta)',
    border: 'none',
    borderRadius: o.radius ?? 'var(--pill)',
    padding: o.pad ?? '13px 22px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(89,180,245,.25)',
    transition: 'transform .25s var(--ease), box-shadow .25s var(--ease)',
  };
}

// Form input surface.
export function input(): CSSProperties {
  return {
    width: '100%',
    background: 'var(--field-input-bg)',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--r-sm)',
    padding: '13px 16px',
    color: 'var(--text)',
    fontSize: 15,
    outline: 'none',
  };
}

// Translucent panel that may sit behind text over the aurora — adds a scrim for contrast.
export function readableGlass(o: GlassOpts = {}): CSSProperties {
  return {
    ...glass({ strong: true, ...o }),
    backgroundImage: 'linear-gradient(var(--scrim), var(--scrim))',
  };
}
