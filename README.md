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
**Stellar wallet** connection, a first-class **dark theme**, **five-language**
i18n, and the live WebGL **Helio**. It honours the brand's _warm · lucid · alive_
brief: a two-color world (deep-pine ink on morning-air canvas) plus one solar
accent, Cabinet Grotesk / Hanken Grotesk / Spline Sans Mono type.

[ARCHITECTURE.md](ARCHITECTURE.md) maps every surface to the Soroban contracts
it touches, and [SECURITY.md](SECURITY.md) covers CSP, telemetry and sign-in.

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript** (strict). Each screen is a
  real route → per-route code splitting, real URLs, SSR-ready shells.
- **bun** package manager / runner.
- **@creit.tech/stellar-wallets-kit** — multi-wallet connection (Freighter, xBull,
  Albedo, Lobstr, Hana, WalletConnect) on testnet.
- **three + @react-three/fiber + @react-three/drei** — the live Helio (WebGL/R3F).
- **next-intl** — English, French, Spanish, Arabic (RTL) and Portuguese, selected
  by cookie rather than a `[locale]` URL segment, so routes are unchanged.
- Design tokens are plain CSS custom properties (verbatim from the handoff);
  components reference them via `var(--token)`, so light/dark is a pure token swap. See the [Design Tokens & Brand Guide](src/styles/tokens/README.md) for details.

## Design Tokens Quick Reference

The app’s source of truth is the CSS token layer in `src/styles/tokens/`:

- Colors: `--ink`, `--canvas`, `--surface`, `--solar`, `--growth`, `--ember`, plus the semantic text / border aliases.
- Typography: `--font-display`, `--font-body`, `--font-data`, and the type ladder (`--type-display-xl`, `--type-h3`, `--type-body`, `--type-small`, etc.).
- Spacing and radii: `--space-1` through `--space-32`, plus `--radius-input`, `--radius-card`, `--radius-modal`, and `--radius-pill`.
- Breakpoints: the shared layout uses `680px` and `960px` responsive cuts, with a max content width of `90rem`.

For the full token table and rules, see [src/styles/tokens/README.md](src/styles/tokens/README.md).

## Preview gallery

<p align="center">
  <img src="/screenshots/landing-light.svg" alt="Landing page in light mode" width="420" height="280" />
  <img src="/screenshots/landing-dark.svg" alt="Landing page in dark mode" width="420" height="280" />
</p>

<p align="center">
  <img src="/screenshots/deposit-light.svg" alt="Deposit flow in light mode" width="420" height="280" />
  <img src="/screenshots/deposit-dark.svg" alt="Deposit flow in dark mode" width="420" height="280" />
</p>

<p align="center">
  <img src="/screenshots/portfolio-light.svg" alt="Portfolio dashboard in light mode" width="420" height="280" />
  <img src="/screenshots/portfolio-dark.svg" alt="Portfolio dashboard in dark mode" width="420" height="280" />
</p>

<p align="center">
  <img src="/screenshots/admin-light.svg" alt="Admin console in light mode" width="420" height="280" />
  <img src="/screenshots/admin-dark.svg" alt="Admin console in dark mode" width="420" height="280" />
</p>

## Run

Prerequisites: [**bun**](https://bun.sh) **1.2.4** (the package manager / runner) and Node 22+ (see `.nvmrc`).

```bash
bun install
bun run dev        # http://localhost:3000 (Turbopack)
bun run build      # next build
bun run start      # serve the production build
bun run typecheck  # tsc --noEmit
```

## Local environment

Copy `.env.example` to `.env.local` before running against a backend or Soroban
vault:

```bash
cp .env.example .env.local
```

The app runs without a `.env.local` file and falls back to bundled demo data. Set
only the values needed for the mode you are testing.

| Variable                           | Required? | Default / fallback                          | Purpose                                                                              |
| ---------------------------------- | --------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`              | No        | Demo fixture data                           | Backend API base URL, for example `http://localhost:3001`.                           |
| `NEXT_PUBLIC_STELLAR_NETWORK`      | No        | `public`                                    | Stellar network for wallet and Soroban helpers. Use `testnet` for local/dev testing. |
| `NEXT_PUBLIC_VAULT_CONTRACT_ID`    | No        | Demo vault mode                             | Soroban vault contract ID for live vault reads and transactions.                     |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID` | No        | Fixtures for the project list               | Soroban `ProjectRegistry` ID, for live project and score-history reads.              |
| `NEXT_PUBLIC_ADMIN_ADDRESS`        | No        | Deployer address of the configured contract | Address allowed to use the admin / oracle console.                                   |
| `NEXT_PUBLIC_SOROBAN_RPC_URL`      | No        | Network-specific Stellar RPC URL            | Override the Soroban RPC endpoint.                                                   |
| `NEXT_PUBLIC_HORIZON_URL`          | No        | Network-specific Horizon URL                | Override the Horizon endpoint used for transaction account loading.                  |

`NEXT_PUBLIC_DEMO_MODE=true` forces fixtures even when `NEXT_PUBLIC_API_URL` is
set. The remaining variables (CSP mode, telemetry sink, auth URL, release tag,
source maps, dev routes) are documented inline in `.env.example` and
[SECURITY.md](SECURITY.md). For backend configuration, see the backend
repository's `.env.example`.

## What runs where

New contributors get this wrong most often, so it is worth being explicit. Every
data path in the app falls back rather than failing, and the fallback is visible
in the UI as a "Demo data" badge.

- **On-chain, no env var needed:** wallet connection and message signing
  (Stellar Wallets Kit), network and Horizon health checks.
- **On-chain when the contract ID is set:** vault reads
  (`share_price`, `total_assets`, `get_portfolio`) and signed writes (`deposit`,
  `withdraw`, `claim`, `claim_yield`) in `src/wallet/vault.ts`; project and
  score-history reads in `src/wallet/registry.ts`; oracle writes (`fund_project`,
  `update_impact_score`, `set_whitelist`, `pause`) in `src/wallet/admin.ts`.
  Unset, those return deterministic fixture data instead.
- **Backend, when `NEXT_PUBLIC_API_URL` is set:** project reads, investment
  writes, biometric login, price history.
- **Fixture / demo data:** everything in `src/data.ts` and `src/data/` — the pool
  totals, the project list, creator records, and the admin registry table. The
  creator application form and the oracle forms keep their own state client-side
  rather than persisting.
- **Frontend-only:** i18n, tax reports, watchlist (localStorage), the WebGL
  Helio, the session-timeout warning, and the CSP / security headers.

## Error codes

Frontend-friendly error messages are mapped in `src/lib/errorMessages.ts`.
Developers can find the supported codes, API response shape, and guidance for
opaque provider codes such as `ERR_008` in [ERROR_CODES.md](ERROR_CODES.md).

## Routes

| Route                                                       | What it is                                                | Indexable? |
| ----------------------------------------------------------- | --------------------------------------------------------- | ---------- |
| `/`                                                         | Landing hero and the "how it works" walkthrough           | yes        |
| `/explore`                                                  | Bond list with filters and search                         | yes        |
| `/project/[id]`                                             | Per-bond detail, scores and funding timeline              | yes        |
| `/creator`                                                  | Whitelist application, project builder, creator dashboard | yes        |
| `/learn`, `/verify`, `/risk`                                | Explainer and trust / disclosure pages                    | yes        |
| `/connect`                                                  | Wallet connection (or a demo session)                     | no         |
| `/portfolio`, `/portfolio/tax-reports`                      | Position, returns, tax reports                            | no         |
| `/deposit`, `/withdraw`                                     | Invest and redeem                                         | no         |
| `/watchlist`                                                | Per-user saved bonds                                      | no         |
| `/admin`                                                    | Internal vault / oracle console                           | no         |
| `/(dev)/contrast-test`, `/(dev)/learn/password-reset-email` | Internal tooling, 404 in production builds                | no         |

Metadata for all of them lives in one table, `src/lib/routeMetadata.ts`, which
also drives `robots.ts` and `sitemap.ts` — so a route can't be `noindex` in its
`<head>` while still being crawlable. See [ARCHITECTURE.md](ARCHITECTURE.md) for
what each surface reads and writes.

## Features

- **Wallet wiring** — `src/wallet/WalletProvider.tsx` connects a real Stellar
  wallet via the kit's modal and shows the live address; `connectDemo()` provides
  a placeholder session so the click-through works without an extension installed.
  Deposit, withdraw, claim and claim-yield flow through `src/wallet/vault.ts`,
  which builds, signs and submits real Soroban transactions when
  `NEXT_PUBLIC_VAULT_CONTRACT_ID` is set, and returns simulated results
  otherwise. See [What runs where](#what-runs-where).
- **Dark theme ("After Sunset")** — `src/theme/` provides a no-flash toggle
  (render-blocking bootstrap script + `data-theme` swap), persisted, defaulting to
  the OS preference. Toggle in the top bar.
- **i18n (5 locales)** — `src/i18n/` + `messages/{ar,en,es,fr,pt}.json`, kept in
  leaf-key parity by `src/__tests__/catalog-parity.test.ts`. The shell, the
  investor screens, the creator space and the route metadata are translated;
  the language switcher sets a cookie and refreshes. Design-system primitives and
  the tax-report screen still ship English (i18n-ready).
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
- **Watchlist, tax reports and yield alerts** — per-user surfaces backed by
  `localStorage` (`src/watchlist/`, `src/lib/tax-report.ts`, `src/alerts/`), so
  they work with no backend.
- **Wallet-signature sign-in** — SEP-53 / SEP-10 sessions with a short-lived JWT
  held in memory and an HttpOnly refresh cookie, plus a preemptive inactivity
  warning. See [docs/AUTH.md](docs/AUTH.md).
- **Telemetry you control** — client error reports and web-vitals are opt-in from
  a consent banner, with a privacy control in the footer and no addresses, hashes
  or emails in any payload. See [SECURITY.md](SECURITY.md).

## Structure

```
src/
  app/                     App Router: root layout (i18n + theme + shell +
                           providers), per-route metadata, sitemap.ts, robots.ts,
                           and the route segments themselves
  brand/                   Mark (analemma), Helio (static), HelioWebGL, LiveHelio
  components/              design-system primitives (+ Sparkline, charts, modals)
  screens/                 Landing/Connect/Explore/Deposit/Portfolio/Withdraw,
                           ProjectDetail, TaxReports, Watchlist, creator/*, admin/*
  shell/                   TopBar (nav, theme, language, wallet), Footer
  theme/                   ThemeProvider + no-flash script
  wallet/                  WalletProvider (Stellar Wallets Kit), vault service,
                           project registry client, admin / oracle client
  i18n/                    next-intl request config + LocaleProvider
  lib/                     api client, contracts, error reporting, formatting,
                           tax reports, watchlist/yield storage, security headers
  session/                 wallet-signature session (provider, client, sync)
  watchlist/, alerts/      localStorage-backed user state + alerts
  config/, state/          network config, flat read-only selectors
  data.ts, data/           typed fixture pool / project / creator / admin data
  styles/                  tokens (verbatim) + responsive app-shell layer
  test/, __tests__/        shared render helper + cross-cutting tests
messages/                  ar.json, en.json, es.json, fr.json, pt.json
e2e/                       Playwright journeys (deposit, watchlist, headers)
e2e/chain/                 local-network investor journey against real contracts
scripts/                   bundle-size and type-coverage checks used in CI
public/assets/             analemma marks, wordmark, favicon
```

Run the suites with `bun run test` (unit + jsdom), `bun run test:e2e` and
`bun run test:e2e:chain`.

## Not in scope (yet)

- **Persisting creator and oracle mutations.** The application, project-builder
  and score-editing forms keep their state client-side; only the contract calls
  in `src/wallet/admin.ts` and the registry writes are wired to chain.
- **Full i18n coverage.** Design-system primitives and the tax-report screen are
  still English; the pattern and catalogs are in place to extend.
- **Backend-owned data.** Funded totals, score history and investment records
  come from fixtures unless a registry contract or backend is configured.
- **Mainnet hardening.** See [docs/MAINNET_CHECKLIST.md](docs/MAINNET_CHECKLIST.md)
  for what has to be true before a production build points at the public network.

---

Implemented from the _Heliobond Design System_ handoff bundle exported from
Claude Design. The reference bundle lives under `.design-handoff/` (gitignored).


## Contributing

Please check [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and development workflow.
