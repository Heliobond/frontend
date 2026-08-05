# Heliobond — investor app

> Sunlight made financial. The investor frontend for **Heliobond**, a green-bond
> pool on Stellar that opens green investing to everyone — from a €5 first-timer
> to a €5M institution.

A faithful, production-grade implementation of the **Heliobond Design System**
handoff. The investor click-through —

```
landing → connect → explore → project detail → deposit → portfolio → withdraw
```

— plus the **creator space**, the internal **admin / oracle console**, real
**Stellar wallet** connection, a first-class **dark theme**, **English / French**
i18n, and the live WebGL **Helio**. It honours the brand's _warm · lucid · alive_
brief: a two-color world (deep-pine ink on morning-air canvas) plus one solar
accent, Cabinet Grotesk / Hanken Grotesk / Spline Sans Mono type.

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript** (strict). Each screen is a
  real route → per-route code splitting, real URLs, SSR-ready shells.
- **bun** package manager / runner.
- **@creit.tech/stellar-wallets-kit** — multi-wallet connection (Freighter, xBull,
  Albedo, Lobstr, Hana, WalletConnect) on testnet.
- **three + @react-three/fiber + @react-three/drei** — the live Helio (WebGL/R3F).
- **next-intl** — EN/FR with cookie-based locale (no `[locale]` URL segment).
- Design tokens are plain CSS custom properties (verbatim from the handoff);
  components reference them via `var(--token)`, so light/dark is a pure token swap. See the [Design Tokens & Brand Guide](src/styles/tokens/README.md) for details.

## Run

```bash
bun install
bun run dev        # http://localhost:3000 (Turbopack)
bun run build      # next build
bun run start      # serve the production build
bun run typecheck  # tsc --noEmit
```

## Features

- **Wallet wiring** — `src/wallet/WalletProvider.tsx` connects a real Stellar
  wallet via the kit's modal and shows the live address; `connectDemo()` provides
  a placeholder session so the click-through works without an extension installed.
  Deposit/withdraw math flows through `src/wallet/vault.ts`, a _simulated_ vault
  client structured for real Soroban `convert_to_shares` / `deposit` / `withdraw`
  calls once the contracts are deployed.
- **Dark theme ("After Sunset")** — `src/theme/` provides a no-flash toggle
  (render-blocking bootstrap script + `data-theme` swap), persisted, defaulting to
  the OS preference. Toggle in the top bar.
- **i18n (EN/FR)** — `src/i18n/` + `messages/{en,fr}.json` (117 keys each, in
  parity). The shell and all six investor screens are fully translated; the
  language switcher sets a cookie and refreshes. Design-system primitives and the
  new creator/admin/project-detail surfaces currently ship English (i18n-ready).
- **Project detail** (`/project/[id]`) — hero, verified-creator badge, two large
  sun-arc scores with on-chain score-history sparklines, funding timeline, the
  expandable return formula, and honest pooled-model framing.
- **Creator space** (`/creator`) — whitelist application with a status tracker, a
  project builder with a live `ProjectCard` preview, and a creator dashboard that
  makes the oracle's scoring legible.
- **Admin / oracle console** (`/admin`, linked from the footer) — a denser
  internal surface: vault stats, a sortable project registry with inline score
  editing, oracle "push score / fund project" forms, and whitelist management.
- **Live Helio** — `src/brand/HelioWebGL.tsx`, a soft luminous R3F orb that
  breathes, leans toward the cursor, and carries a per-project mote corona.
  `src/brand/LiveHelio.tsx` swaps in the static SVG `<Helio>` under SSR, no-WebGL,
  or `prefers-reduced-motion`. Used at the landing hero; the smaller portfolio /
  deposit orbs stay static by design.

## Structure

```
src/
  app/                     App Router: layout (i18n + theme + shell), providers,
                           and route wrappers (/, connect, explore, deposit,
                           portfolio, withdraw, project/[id], creator, admin)
  brand/                   Mark (analemma), Helio (static), HelioWebGL, LiveHelio
  components/              design-system primitives (+ Sparkline)
  screens/                 Landing/Connect/Explore/Deposit/Portfolio/Withdraw,
                           ProjectDetail, creator/*, admin/*
  shell/                   TopBar (nav, theme, language, wallet), Footer
  theme/                   ThemeProvider + no-flash script
  wallet/                  WalletProvider (Stellar Wallets Kit) + vault service
  i18n/                    next-intl request config
  data.ts, data/           typed fake pool / project / creator / admin data
  styles/                  tokens (verbatim) + responsive app-shell layer
messages/                  en.json, fr.json
public/assets/             analemma marks, wordmark, favicon
```

## Not in scope (yet)

- **Real on-chain calls** — the vault client is simulated (no contracts are
  deployed); wiring `kit.signTransaction` + Soroban RPC is the next step.
- **Full i18n coverage** — primitives and the creator/admin/project-detail
  surfaces are English; the pattern + catalogs are in place to extend.
- Live score-history / funding data (currently fixtures), and additional locales.

---

Implemented from the _Heliobond Design System_ handoff bundle exported from
Claude Design. The reference bundle lives under `.design-handoff/` (gitignored).


## Issue #299

Feature in development. Closes #299
