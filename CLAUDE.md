# Visby — Claude Code Context

## What this project is
Visby is a mobile-first Next.js marketplace for buying/selling physical luxury goods (sneakers, watches, bags, etc.) with NFT provenance on Solana. Each item gets minted as an NFT so ownership history is chain-verified. Users log in with Privy (email-based MPC wallets — no seed phrase). Payments go through Stripe.

## Tech stack
- **Framework**: Next.js 14 (App Router), TypeScript
- **Auth / wallet**: Privy (`@privy-io/react-auth`) — email login, embedded Solana MPC wallet
- **Database / storage**: Supabase (Postgres + Storage). Client uses `@supabase/supabase-js`
- **API layer**: tRPC (`@trpc/client`, `@trpc/server`) with React Query
- **NFT minting**: Metaplex UMI + MPL Core on Solana devnet
- **Payments**: Stripe
- **Styling**: React inline styles throughout (no Tailwind classes used in practice), driven by a **CSS-variable design-token system** (`src/styles/tokens.css`). `globals.css` imports tokens + fonts and holds base resets/keyframes.
- **Theming**: Light + dark, flipped by a `[data-theme]` attribute on `<html>`. `src/lib/theme.tsx` = `ThemeProvider` / `useTheme()` / `<ThemeToggle/>` (default follows OS, override persisted to `localStorage`, no-flash init script). `src/components/background-field.tsx` renders the global background.
- **Font**: **Quicksand** = brand/logo/wordmark + display headings (Google Fonts 400–800). **Manrope** = body / UI / labels / numbers. Headings stay light–medium weight so they never out-weigh the Visby logo.

## Design rules — "Ambient Glass Futurism" (enforce these always)

> The old "solid `#0d0d0d`, no gradient backgrounds, dark-only" rule is **retired.** The aesthetic is now light suspended in polished glass — calm, warm, premium, never cyberpunk.

### Always use design tokens — never hardcode theme colors
All colors/surfaces come from CSS variables in `src/styles/tokens.css`. Inline styles reference them, e.g. `color: 'var(--text)'`, `background: 'var(--glass-bg)'`. Do **not** hardcode `#0d0d0d`/`#fff`/`rgba(255,255,255,.x)` for theme colors — they won't flip with light/dark. Brand accent hexes (`#6DE4D5 #59B4F5 #D54AF2`, etc.) and functional colors (green `#00C48C`, red `#FF3B5C`) are mode-independent and may stay literal.

Key tokens: `--bg-0`, `--bg-field`, `--field-glow`, `--text` / `--text-strong` / `--text-muted`, `--glass-bg` / `--glass-bg-strong` / `--glass-border` / `--glass-shadow` / `--glass-inner`, `--divider`, `--field-input-bg`, `--grad-brand` / `--grad-brand-h` / `--grad-glow`, radii `--r-sm/--r/--r-lg/--r-xl/--pill`. Helpers in `src/lib/ui.ts`: `glass()`, `card()`, `cta()`, `input()`, token map `T`.

### Background & glow (strict)
- The background is global (`<BackgroundField/>`), not per-page. Page roots are `transparent` so it shows through.
- **Nothing glows except the dark-mode background.** Light mode = no glow anywhere. Dark mode = a subtle aurora night-glow in the background field only (it follows cursor/device-tilt, near-imperceptible). **Glass never glows** — no edge-glow/bloom on cards. The soft inner highlight (`--glass-inner`) is a thin hairline, not a glow.
- Gradients are welcome on backgrounds now, plus text (`WebkitBackgroundClip:'text'`), CTAs, avatars, story rings. The aurora must never tint glass, gradient UI elements, or text.

### Liquid glass cards
Cards/panels/modals = frosted glass floating over the colored background:
```js
background: 'var(--glass-bg)',            // text-heavy → var(--glass-bg-strong)
backdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(1.4)',
border: '1px solid var(--glass-border)',
borderRadius: 20–36,                      // var(--r) / var(--r-lg)
boxShadow: 'var(--glass-shadow), var(--glass-inner)',
```
Still no directional light/dark borders or skeuomorphic multi-shadows — keep shadows diffuse/ambient.

### Contrast & legibility (WCAG, non-negotiable)
Body text ≥ **4.5:1**, large text & UI/borders ≥ **3:1** (aim AAA 7:1 on primary reading text). Measure translucent surfaces against the **worst-case** background showing through. Match text tone to glass tone, add a ~20–30% scrim behind text over busy areas, keep busy aurora away from text. `tokens.css` already honors `prefers-reduced-transparency` / `prefers-contrast`.

### No emojis
All emoji characters have been replaced with inline SVG icons. Never add emojis to any file. Use inline SVG paths instead.

### Colour palette (brand — mode-independent)
```js
// Primary brand accents (literal hex OK — same in light & dark)
aqua '#6DE4D5'  turquoise '#5ED9D1'  sky '#59B4F5'  electric '#4B93F1'
orchid '#D54AF2'  magenta '#C62FEA'  peach '#FFC6A3'  amber '#FFB36B'  lime '#9BE15D'
// Neutrals (drive the light/dark tokens)
cloud '#FAF9FC'  pearl '#F4F0F7'  lavender '#EEE7F5'  softGray '#CFC8D8'  slate '#655B78'  plum '#40384E'
// Brand gradient (text/CTAs/avatars/story rings AND backgrounds now)
--grad-brand: linear-gradient(135deg,#6DE4D5,#59B4F5 50%,#D54AF2)
```
Per-page files keep a local `const C = {...}` for convenience, but its values now point at tokens (e.g. `navy:'transparent'`, `muted:'var(--text-muted)'`, `border:'var(--glass-border)'`) with brand accents as literal hex. The Visby logo/wordmark on the homepage is intentionally frozen — never restyle it.

### No comments explaining what the code does
Only add a comment when the WHY is non-obvious (hidden constraint, workaround, invariant). Never describe what a function does — good names do that.

---

## Page & navigation structure

### Bottom nav (5 tabs)
| Tab | Icon | Route |
|-----|------|-------|
| Home | house | `/` |
| Search | magnifier | `/marketplace` |
| Sell | plus | `/dashboard/seller` |
| Inbox | speech bubble | `/dashboard` |
| Profile | person | `/profile` |

### Pages
- **`/`** — "Market Square": grid of all listings, stories row, category chips, sort, search. Top-right has hamburger menu (three bars) that opens a bottom sheet with Profile / Notifications / Sell / Settings / Sign In or Sign Out.
- **`/marketplace`** — "Search": full search + filter page (category, condition, price range)
- **`/dashboard/seller`** — Sell page with tab slider: **Mint New** | **Relist**
- **`/dashboard`** — "Notifications" page with tab slider: **Notifications** | **Sales History** | **Messages**. Icon in header is speech bubble SVG.
- **`/profile`** — Profile page with tab slider: **Wallet** | **My Items** | **Public View**. Separate "Edit" button in header. Wallet tab contains payout settings when scrolled. No separate wallet page.
- **`/item/[id]`** — Item detail / buy flow
- **`/mint`** — Mint new NFT (standalone page, not in bottom nav)
- **`/login`** — Login page (Privy)
- **`/order/[itemId]`** — Post-purchase confirmation
- **`/p/[wallet]`** — Public seller profile
- **`/checkout/success`** — Stripe success redirect

---

## Image uploads
Photos are uploaded server-side via `/api/upload-image` (not from the browser directly). This route uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS and auto-creates the `item-images` bucket if needed. All mint/sell forms call this endpoint.

```ts
// src/app/api/upload-image/route.ts
async function POST(req) {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  await supabase.storage.createBucket('item-images', { public: true }).catch(() => {});
  // upload and return publicUrl
}
```

---

## Security — critical
**Never commit `.env.local`** — it contains:
- `SUPABASE_SERVICE_ROLE_KEY` (live, bypasses RLS)
- `PRIVY_APP_SECRET`
- Solana mint authority secret key
- Stripe test keys

`.env.local` is in `.gitignore`. Double-check before any `git add`.

---

## Component locations
- `src/components/listing-card.tsx` — `<ListingCard>` used on full-width listing pages
- `src/components/layout/bottom-nav.tsx` — `<BottomNav>` fixed bottom navigation
- `src/components/providers.tsx` — Privy + tRPC + React Query providers
- `src/lib/wallet.ts` — `useVisbWallet()` hook (wraps Privy Solana wallet)
- `src/lib/trpc/` — tRPC router + client setup

---

## Running the project
```bash
npm run dev      # starts on localhost:3000
npx tsc --noEmit # type-check (should always be clean)
```
