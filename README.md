# Heliobond — investor app

> Sunlight made financial. The investor frontend for **Heliobond**, a green-bond
> pool on Stellar that opens green investing to everyone — from a €5 first-timer
> to a €5M institution.

A faithful, production-grade implementation of the **Heliobond Design System**
handoff (`ui_kits/app`) — the full investor click-through:

```
landing → connect → explore → deposit → portfolio → withdraw
```

It composes the design-system primitives (Button, AmountInput, ScoreGauge,
LiquidityMeter, StatBlock, ProjectCard, …) and honours the brand's *warm · lucid
· alive* brief: a two-color world (deep-pine ink on morning-air canvas) plus one
solar accent, Cabinet Grotesk / Hanken Grotesk / Spline Sans Mono type, and **the
Helio** — the platform's one spectacle, here in its static accessible fallback.

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript** (strict). Each screen is a
  real route, so the app gets per-route code splitting, real URLs, and SSR-ready
  shells — the structure the future Stellar/Soroban data layer plugs into (e.g.
  `/explore` can become a Server Component that reads `ProjectRegistry`).
- **bun** as the package manager / runner.
- Deliberately **not** a static export — it's a full Next app (Node runtime) so
  Server Components + per-route data fetching can be added without restructuring.
- Design tokens are plain CSS custom properties (copied verbatim from the
  handoff); components reference them via `var(--token)`.

## Run

```bash
bun install
bun run dev        # http://localhost:3000  (Turbopack)
```

```bash
bun run build      # next build  → .next/
bun run start      # serve the production build
bun run typecheck  # tsc --noEmit
```

## Architecture

The screens are **prop-driven and route-agnostic** — navigation is injected by
thin client `page.tsx` wrappers, so the UI components stay portable and testable.
Wallet/connection state lives in a single client context (`SessionProvider`) in
the root layout, so it survives client-side navigation between routes.

```
src/
  app/                     Next.js App Router
    layout.tsx             root (Server Component): <html>, metadata, viewport,
                           global CSS; renders the persistent TopBar + Footer
                           shell around the routed page, wrapped in <Providers>
    providers.tsx          'use client' SessionProvider — connection state +
                           useSession() (where the wallet kit / Soroban account
                           context will live)
    page.tsx               /            → Landing
    connect/page.tsx       /connect     → Connect   (sets connected → /deposit)
    explore/page.tsx       /explore     → Explore   (open → /deposit | /connect)
    deposit/page.tsx       /deposit     → Deposit   (done → /portfolio)
    portfolio/page.tsx     /portfolio   → Portfolio
    withdraw/page.tsx      /withdraw    → Withdraw
  data.ts                  typed fake pool / project / activity data (stands in
                           for live reads from the Soroban contracts)
  types.ts                 Screen union (used by screen prop contracts)
  brand/
    Mark.tsx               the analemma logo mark (Server-compatible, no hooks)
    Helio.tsx              the signature solar orb — static accessible fallback
  components/              design-system primitives (the reusable building blocks)
    Button, IconButton, Badge, Tag, AddressChip, ScoreGauge, LiquidityMeter,
    StatBlock, AmountInput, ProjectCard, Toast  (+ index.ts barrel)
  shell/
    TopBar.tsx             'use client' nav — usePathname/useRouter + useSession
    Footer.tsx             quiet footer incl. "Talk to a human"
  screens/                 Landing, Connect, Explore, Deposit, Portfolio, Withdraw
                           — prop-driven; unchanged by routing
  styles/
    index.css              global entry — imports tokens + base + app
    tokens/                fonts, colors, typography, spacing, motion, base
                           (verbatim from the design handoff — brand source of truth)
    app.css                app-shell layout grids + responsive layer + keyframes
public/assets/             analemma marks, wordmark, favicon (SVG)
```

### RSC boundaries

`layout.tsx`, `Footer`, and `Mark` are Server Components (no client hooks). The
client boundary starts at `<Providers>`, `<TopBar>`, and each `page.tsx`; every
screen and primitive they render is in the client graph (no per-file directive
needed). `useId` gives the Helio's SVG gradients SSR-stable ids, so there are no
hydration mismatches.

## Design fidelity & notable decisions

- **Tokens are verbatim.** `src/styles/tokens/*.css` are copied unchanged from the
  handoff so colors, type scale, motion easings, spacing, radii, and shadows are
  exact. Light theme is default; "After Sunset" dark ships as a
  `:root[data-theme="dark"]` token swap (not yet wired to a UI toggle).
- **Components match the prototype 1:1** (typed inline styles referencing CSS
  vars). The only structural changes: shared keyframes live once in `app.css`,
  and per-instance SVG gradient ids in the Helio use `useId()`.
- **Responsive layer** (`app.css`): screen grids collapse to a single column on
  phones (the brief insists mobile is first-class). No new visual language — the
  secondary nav hides < 680px and columns stack.
- **The hard honesty rules are intact**: the withdrawal liquidity cap is always
  visible (Portfolio + Withdraw); typing past it turns the input *solar, not
  error-red* and offers a one-tap "Withdraw max available"; deposit/withdraw show
  a live on-chain-accurate preview before any signature; every delta carries a
  sign + arrow so colour is never the sole carrier.
- **Iconography**: inline 1.5px-stroke line icons matching the Lucide spec
  (incl. the language-switcher chevron — upgraded from the prototype's unicode
  caret to satisfy the brief's "no unicode as UI icons" rule).
- **Fonts from CDN.** Cabinet Grotesk (Fontshare — not on Google Fonts), Hanken
  Grotesk + Spline Sans Mono (Google) load via `@import` in `tokens/fonts.css`.
  Vendor the binaries and switch to `next/font/local` to self-host / drop the
  external requests.
- **The Helio** is the documented static SVG fallback (a soft solar orb with a
  per-project mote corona and a 6s breathing cycle, neutralised under
  `prefers-reduced-motion`). The live WebGL/R3F build is a separate deliverable.

## Not in scope (yet)

This is the high-fidelity investor click-through. It does **not** include: real
wallet / Soroban contract wiring, the creator space, the admin/oracle console,
the project-detail screen, the live WebGL Helio, the dark-theme toggle, or i18n
(EN/FR) — all called for in the full brief and ready to layer onto this
route-based foundation.

---

Implemented from the *Heliobond Design System* handoff bundle exported from
Claude Design. The reference bundle lives under `.design-handoff/` (gitignored).
