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

/* ───────────────────────── Design system ─────────────────────────
   One type scale, one spacing grid, one of each component. See design.md.
   Pages consume these helpers instead of hand-rolling inline numbers. */

const QUICKSAND = "'Quicksand', sans-serif";
const MANROPE = "'Manrope', sans-serif";

// Spacing — strict 4/8 grid. Mirror of --s-* in tokens.css (identical numbers).
export const S = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const;

export type TypeRole = 'display' | 'title' | 'heading' | 'body' | 'meta' | 'micro';

const TYPE: Record<TypeRole, CSSProperties> = {
  display: { fontFamily: QUICKSAND, fontSize: 30, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.01em' },
  title:   { fontFamily: QUICKSAND, fontSize: 22, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' },
  heading: { fontFamily: MANROPE,   fontSize: 16, fontWeight: 700, lineHeight: 1.3 },
  body:    { fontFamily: MANROPE,   fontSize: 14, fontWeight: 500, lineHeight: 1.5 },
  meta:    { fontFamily: MANROPE,   fontSize: 12, fontWeight: 500, lineHeight: 1.4 },
  micro:   { fontFamily: MANROPE,   fontSize: 11, fontWeight: 700, lineHeight: 1.3, letterSpacing: '0.06em', textTransform: 'uppercase' },
};

// Type scale. Spread into a style and add a `color`. e.g. { ...t('heading'), color: T.textStrong }
export function t(role: TypeRole): CSSProperties {
  return { ...TYPE[role] };
}

// Uppercase eyebrow label used above sections.
export function sectionLabel(): CSSProperties {
  return { ...TYPE.micro, color: 'var(--text-muted)' };
}

// Price — always brand-gradient text. The only place number color comes from the gradient.
const PRICE_SIZE = { sm: 16, md: 22, lg: 30 } as const;
export function price(size: keyof typeof PRICE_SIZE = 'md'): CSSProperties {
  return {
    fontFamily: MANROPE,
    fontSize: PRICE_SIZE[size],
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: '-0.01em',
    background: 'var(--grad-brand-h)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    width: 'fit-content',
  };
}

// Near-solid nested panel — NO backdrop blur. Use for content that sits *inside* a glass
// card (icon boxes, stat tiles, list rows, filter rows) so glass never stacks on glass.
export function surface(o: { radius?: number | string; pad?: number | string; bordered?: boolean } = {}): CSSProperties {
  return {
    background: 'var(--surface-bg)',
    border: o.bordered === false ? 'none' : '1px solid var(--glass-hairline)',
    borderRadius: o.radius ?? 'var(--r-sm)',
    ...(o.pad != null ? { padding: o.pad } : null),
  };
}

// Real frosted glass for the chrome that should float: modals + bottom sheets.
export function sheet(o: GlassOpts = {}): CSSProperties {
  return glass({ strong: true, radius: 'var(--r-xl)', ...o });
}

export type BtnVariant = 'primary' | 'secondary' | 'text' | 'danger';

// One button system. `primary` = brand gradient; `secondary` = glass; `text` = bare;
// `danger` = red-tinted. `full` stretches to 100% (also guarantees gradients never clip).
export function btn(variant: BtnVariant = 'primary', o: { full?: boolean; pill?: boolean } = {}): CSSProperties {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontFamily: MANROPE,
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1,
    padding: '12px 20px',
    borderRadius: o.pill === false ? 'var(--r)' : 'var(--pill)',
    border: '1px solid transparent',
    cursor: 'pointer',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: 'transform .2s var(--ease), box-shadow .2s var(--ease), background .2s var(--ease)',
    ...(o.full ? { width: '100%' } : null),
  };
  const variants: Record<BtnVariant, CSSProperties> = {
    primary:   { background: 'var(--grad-brand)', color: 'var(--text-on-cta)', boxShadow: '0 8px 24px rgba(89,180,245,.22)' },
    secondary: { background: 'var(--glass-bg-strong)', color: 'var(--text-strong)', borderColor: 'var(--glass-border)', backdropFilter: 'blur(var(--glass-blur))', WebkitBackdropFilter: 'blur(var(--glass-blur))' },
    text:      { background: 'transparent', color: 'var(--text-muted)', padding: '8px 12px' },
    danger:    { background: 'rgba(255,59,92,.10)', color: '#FF3B5C', borderColor: 'rgba(255,59,92,.28)' },
  };
  return { ...base, ...variants[variant] };
}

export type BadgeVariant = 'default' | 'onImage' | 'success' | 'danger';

// One badge/pill system. `onImage` carries its own dark scrim for sitting on photos.
export function badge(variant: BadgeVariant = 'default'): CSSProperties {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: MANROPE,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '0.04em',
    padding: '4px 8px',
    borderRadius: 'var(--r-sm)',
    whiteSpace: 'nowrap',
  };
  const variants: Record<BadgeVariant, CSSProperties> = {
    default: { background: 'var(--surface-bg)', color: 'var(--text-muted)', border: '1px solid var(--glass-hairline)' },
    onImage: { background: 'var(--img-scrim)', color: 'rgba(255,255,255,.95)', border: '1px solid rgba(255,255,255,.18)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' },
    success: { background: 'rgba(0,196,140,.12)', color: '#00C48C', border: '1px solid rgba(0,196,140,.30)' },
    danger:  { background: 'rgba(255,59,92,.12)', color: '#FF3B5C', border: '1px solid rgba(255,59,92,.30)' },
  };
  return { ...base, ...variants[variant] };
}

// Avatar circle — two real sizes (sm 32 / lg 64); md 48 for in-between. Fill with a gradient.
const AVATAR_SIZE = { sm: 32, md: 48, lg: 64 } as const;
const AVATAR_FS = { sm: 12, md: 16, lg: 22 } as const;
export function avatar(size: keyof typeof AVATAR_SIZE = 'md'): CSSProperties {
  return {
    width: AVATAR_SIZE[size],
    height: AVATAR_SIZE[size],
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
    fontFamily: QUICKSAND,
    fontWeight: 700,
    fontSize: AVATAR_FS[size],
    color: '#fff',
  };
}

// Segmented control (the tab slider repeated on profile / dashboard / seller).
export function tabSlider(): { wrap: CSSProperties; item: CSSProperties; itemActive: CSSProperties } {
  return {
    wrap: {
      display: 'flex',
      gap: 4,
      padding: 4,
      background: 'var(--surface-bg)',
      border: '1px solid var(--glass-hairline)',
      borderRadius: 'var(--pill)',
    },
    item: {
      flex: 1,
      textAlign: 'center',
      padding: '9px 12px',
      borderRadius: 'var(--pill)',
      border: 'none',
      background: 'transparent',
      color: 'var(--text-muted)',
      fontFamily: MANROPE,
      fontSize: 13,
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      transition: 'color .2s var(--ease), background .2s var(--ease)',
    },
    itemActive: {
      background: 'var(--grad-brand)',
      color: 'var(--text-on-cta)',
      boxShadow: '0 4px 14px rgba(89,180,245,.22)',
    },
  };
}
