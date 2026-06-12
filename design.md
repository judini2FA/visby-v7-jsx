# Visby — Design System

The canonical visual spec for Visby. If a screen feels off, it's almost always breaking one of
these rules. Everything here is enforced through helpers in `src/lib/ui.ts` and tokens in
`src/styles/tokens.css` — **use the helpers; don't hand-roll inline numbers.**

---

## 1. North star
A **calm, premium marketplace** — the discipline of Google/Instagram (generous whitespace,
one clear hierarchy, ruthless consistency) wearing Visby's identity: *Ambient Glass Futurism*
— frosted glass floating over a greyscale aurora, with colour entering **only** through the
brand gradient.

Three principles decide most arguments:
1. **One focal point per surface.** A card sells one thing: the image. A section has one job.
2. **Whitespace over borders.** Separate things with space, not lines.
3. **Restraint.** ≤3 type sizes per screen, gradient on ≤2 elements per screen, greyscale
   everywhere else.

## 2. Brand invariants (never change without a deliberate decision)
- The **Visby wordmark/logo** is frozen. Never restyle it.
- Background is the global greyscale **aurora** (`<BackgroundField/>`); dark mode adds a near
  imperceptible white bloom. Glass never glows. Page roots stay `transparent`.
- Colour comes **only** from `--grad-brand` (`135deg #6DE4D5 → #59B4F5 → #D54AF2`). Functional
  red `#FF3B5C` and green `#00C48C` appear **only** on real error/success states.
- No emojis anywhere — inline SVG icons only.

## 3. Type scale — `t(role)`
Six roles. Every text node uses one (or `price()` / `sectionLabel()`). Nothing else.

| role      | size | weight | font      | use |
|-----------|------|--------|-----------|-----|
| `display` | 30   | 800    | Quicksand | rare hero numbers/moments |
| `title`   | 22   | 700    | Quicksand | page titles |
| `heading` | 16   | 700    | Manrope   | card titles, section titles |
| `body`    | 14   | 500    | Manrope   | default text |
| `meta`    | 12   | 500    | Manrope   | secondary / metadata |
| `micro`   | 11   | 700    | Manrope   | uppercase eyebrow labels (0.06em tracking) |

```tsx
<div style={{ ...t('heading'), color: 'var(--text-strong)' }}>Air Jordan 1</div>
<span style={{ ...t('meta'), color: 'var(--text-muted)' }}>2 owners</span>
```
Quicksand is reserved for the wordmark, `title`, and `display`. Everything else is Manrope.
**Never** write a raw `fontSize`/`fontWeight` outside this scale — the one exception is price.

## 4. Spacing — `S` (4/8 grid)
`S = {1:4, 2:8, 3:12, 4:16, 5:24, 6:32, 7:48, 8:64}`. Every padding / margin / gap comes from
`S`. Mirrored in CSS as `--s-1 … --s-8` for stylesheet use.

| context | value |
|---------|-------|
| card internal padding | `S[4]` (16) |
| gap within a card | `S[2]`–`S[3]` (8–12) |
| gap between section blocks | `S[6]` (32) |
| grid gap | `16` (`--s-4`), `24` at ≥1440px |
| list-item padding | `12px 16px` |
| button padding | `12px 20px` |
| input padding | `13px 16px` |

If a value isn't on the grid, it's wrong.

## 5. Radius
Tightened for an editorial feel. Set once in `tokens.css`; consume via the `var(--r*)` tokens.

| token | px | use |
|-------|----|----|
| `--r-sm` | 12 | inputs, badges, icon boxes, nested surfaces |
| `--r` | 16 | rectangular buttons |
| `--r-lg` | 20 | content cards |
| `--r-xl` | 28 | modals, bottom sheets |
| `--pill` | 999 | CTAs, chips, tab slider, avatars |

## 6. Colour & gradient usage
- **Surfaces & text:** greyscale tokens only (`--text*`, `--glass-*`, `--surface-bg`). Never
  hardcode `#fff`/`#000`/theme hexes — they won't flip with light/dark.
- **Brand gradient** is allowed on, and only on: the **primary CTA**, **price** text, the
  **active** tab/nav item, **avatars**, **story rings**, and the occasional gradient heading.
- That's the whole colour budget. If a third thing on screen is coloured, remove it.

## 7. Glass — the nesting law
Glass is the brand, but stacked glass turns to mud. The law:

> **Never put glass inside glass.**

- **Real frosted glass** (`card()`, `glass()`, `sheet()`, the sticky nav) is for *top-level*
  surfaces only: the nav, a modal/bottom sheet, the one elevated card in a group.
- Anything **nested inside** a glass surface — icon boxes, stat tiles, list rows, filter rows,
  grouped settings — uses **`surface()`**: a near-solid fill with a hairline border and **no
  blur**. It reads as a quiet inset panel without compounding the frost.
- The soft inner-highlight (`--glass-inner`) belongs to top-level cards, not to little nested
  chips.
- Badges sitting on photos use `badge('onImage')`, which carries its own `--img-scrim`.

## 8. Component anatomy (all in `src/lib/ui.ts`)
| helper | what it is |
|--------|-----------|
| `card(o?)` | elevated frosted card (top-level panels) |
| `sheet(o?)` | frosted glass for modals / bottom sheets |
| `surface(o?)` | near-solid nested panel, no blur — `{radius?, pad?, bordered?}` |
| `btn(variant, o?)` | `primary`(gradient) / `secondary`(glass) / `text`(bare) / `danger`(red); `{full?, pill?}` |
| `badge(variant)` | `default` / `onImage` / `success` / `danger` |
| `price(size)` | gradient price text — `sm`16 / `md`22 / `lg`30 |
| `avatar(size)` | circle — `sm`32 / `md`48 / `lg`64 (fill with a brand gradient) |
| `tabSlider()` | the segmented control (`{wrap, item, itemActive}`) |
| `sectionLabel()` | uppercase eyebrow label |
| `input()` | form input surface |
| `t(role)`, `S`, `T` | type scale / spacing / colour tokens |

**Buttons:** exactly four variants — don't invent a fifth. Primary = the one main action per
view. `{full:true}` for full-width (also guarantees the gradient never clips).

**Listing card** (`src/components/listing-card.tsx`) is the reference card: square image hero,
one `onImage` badge, an Instagram-style like affordance, then `heading` name → seller `meta` →
`price('md')`. The whole card is a single tap target. Item grids reuse this structure.

**Tabs:** profile, dashboard, and sell all use `tabSlider()` — never a bespoke segmented control.

## 9. Do / Don't
| Don't | Do |
|-------|----|
| `fontSize: 13` (off-scale) | `...t('meta')` |
| `padding: '11px 13px'` | `padding: S[3]` / `'12px 16px'` |
| glass card inside a glass card | `card()` → `surface()` inside |
| 5 different button styles | `btn('primary' \| 'secondary' \| 'text' \| 'danger')` |
| dark `rgba(0,0,0,.55)` + blur + border on a photo badge, hand-written | `badge('onImage')` |
| "NFT verified · Solana devnet · MPC wallet" | show only what a buyer/seller needs |
| three accent colours on one screen | gradient on CTA + price, greyscale rest |
| sections divided by boxed borders | `S[6]` of whitespace, optional hairline `--divider` |

## 10. Cleanliness checklist (Google/Instagram bar)
Before shipping a screen:
- [ ] ≤3 type sizes visible; all from `t()`.
- [ ] Every gap/padding is on the `S` grid.
- [ ] Gradient appears on ≤2 elements (CTA, price).
- [ ] No glass inside glass; nested panels are `surface()`.
- [ ] One clear focal point; secondary info is muted `meta`.
- [ ] Generous breathing room; nothing crammed against an edge.
- [ ] No jargon/noise text a normal buyer wouldn't need.
- [ ] Reads cleanly in **both** light and dark.

## 11. File map
- `src/lib/ui.ts` — helpers + scale (`t`, `S`, `price`, `card`, `sheet`, `surface`, `btn`,
  `badge`, `avatar`, `tabSlider`, `sectionLabel`, `input`, `T`).
- `src/styles/tokens.css` — CSS variables: colour, glass, `--surface-bg`, `--img-scrim`, type
  sizes (`--fs-*`), spacing (`--s-*`), radii (`--r*`), gradients, motion.
- `src/app/globals.css` — resets, fonts, keyframes, `.visby-page` / `.visby-inner` /
  `.visby-grid` responsive containers.
- `src/components/listing-card.tsx` — the reference card.
- `src/components/background-field.tsx` — the global aurora.
