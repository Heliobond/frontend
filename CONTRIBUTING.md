# Contributing to Heliobond

Thanks for helping build Heliobond — a green-bond investment app on Stellar that
opens green investing to everyone, from one dollar. The same values we promise
users (transparency, plain language, no dark patterns, accessibility) apply to
how we build: in the open, kindly, and to a high bar.

- **Live demo:** https://heliobond.vercel.app
- **Architecture:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) maps every surface
  to its Soroban contract calls, data sources and client functions.
- **Repository layout:** the `## Structure` section of
  [`README.md`](./README.md#structure).
- **Code of conduct:** [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)

## Ways to contribute

There's a lane for most skill sets — pick by what you enjoy:

| Lane                                   | Examples                                                   |
| -------------------------------------- | ---------------------------------------------------------- |
| **Frontend** (React / TypeScript)      | screens, components, the WebGL Helio, tests                |
| **Smart contracts** (Rust / Soroban)   | the registry + vault, wiring live reads/writes             |
| **Localization** (no deep code needed) | translate the creator/admin/project surfaces, add a locale |
| **Accessibility**                      | WCAG audit passes, keyboard / screen-reader fixes          |
| **Design**                             | extend the token system, motion, specimen cards            |
| **Docs**                               | improve guides, examples, this file                        |

## Find something to work on

1. Browse **[good first issues](https://github.com/Heliobond/frontend/labels/good%20first%20issue)** and **[help wanted](https://github.com/Heliobond/frontend/labels/help%20wanted)**, or this project on **GrantFox**.
2. **Claim it before you start** — comment on the issue (or apply via GrantFox) so it's assigned to you and we avoid duplicate work. Every issue states its scope and acceptance criteria.
3. No issue for your idea? Open a **Feature request** first so we can agree on scope before you build.

We don't merge unsolicited PRs that aren't tied to an accepted issue — it keeps the queue clean and your time well spent.

## Local setup

Prerequisites: [**bun**](https://bun.sh) **1.2.4** (the package manager / runner) and Node 22+.

```bash
git clone https://github.com/Heliobond/frontend.git
cd frontend
bun install
bun run dev        # http://localhost:3000
```

Useful scripts — run these before opening a PR:

```bash
bun run build               # production build (must pass)
bun run typecheck           # tsc --noEmit
bun run lint                # ESLint
bun run format:check        # Prettier — check only
bun run format              # Prettier — rewrite files in place
bun run test                # Vitest unit + component test suite
bun run test:coverage       # Vitest with the coverage thresholds CI enforces
bun run test:e2e            # Playwright end-to-end tests (dev server)
bun run test:e2e:production # Playwright against a production build with CSP enforced
bun run test:e2e:chain      # Playwright against a local Stellar network (see below)
bun run typecheck:coverage  # fails on any `any` in src/ (local only, not in CI)
bun run bundle:check        # bundle budgets against .next/ (run after build)
bun run start               # serve the production build
```

Only `build`, `test:coverage` and `start` are used by CI; the rest are the
checks you run locally before you open a PR.

## Testing

### Unit and component tests (Vitest)

The project uses [Vitest](https://vitest.dev) with a jsdom environment and
[@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/)
for component rendering (config: `vitest.config.mts`, `vitest.setup.ts`).

```bash
bun run test        # run all tests once and exit
bun run test:ui     # open the Vitest browser UI
```

**Structure.** Unit and component tests are co-located with the code they
cover, as `<Name>.test.ts` / `<Name>.test.tsx` next to `<Name>.ts(x)` — e.g.
`src/components/Button.test.tsx`, `src/wallet/vault.test.ts`,
`src/hooks/useSessionTimeout.test.ts`. Tests that cover cross-cutting behaviour
rather than a single module (i18n catalog parity, shared bond math, contrast
ratios) live in `src/__tests__/` instead. Vitest picks up anything matching
`**/*.test.{ts,tsx}`, so a new test file just needs the right name and location
to be included automatically.

**Helpers.** A shared render helper lives in `src/test/render.tsx`. It wraps
components in the `LocaleProvider` (i18n) and `ThemeProvider` the app uses at
runtime, so component tests get a realistic context instead of a bare tree.
Import `render` (and re-exported `@testing-library/react` utilities like
`screen`, `fireEvent`) from there instead of from `@testing-library/react`
directly:

```ts
import { render, screen, fireEvent } from '@/test/render'

test('renders the primary label', () => {
  render(<Button variant="primary">Continue</Button>)
  expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible()
})
```

If a test needs `next-intl` strings, they come from `messages/en.json` via the
helper's `LocaleProvider` — no extra setup required. Add new unit tests next to
the code under test using this pattern; there's no separate mocking layer to
configure beyond what `vitest.setup.ts` already provides.

### Coverage thresholds

```bash
bun run test:coverage   # vitest run --coverage, then enforce the thresholds
```

`bun run test` reports nothing about coverage; **this is the command CI runs**
(`.github/workflows/ci.yml`), so an unmet threshold fails your PR even when the
tests themselves pass.

Only `src/lib/**` and `src/wallet/**` are instrumented (`vitest.config.mts`), and
the thresholds there are:

- **80% lines / statements / functions** for the money- and signing-critical
  modules: `src/lib/api.ts`, `src/wallet/vault.ts`, `src/lib/webauthn.ts`,
  `src/lib/yieldAlerts.ts`, `src/lib/recurringInvestments.ts`,
  `src/lib/scrollToError.ts`.
- **55% lines** for `src/lib/**` and `src/wallet/**` as a whole — a floor that
  only exists to stop regressions, so raise it as `admin.ts`, `registry.ts` or
  `useVault.ts` gain tests.

New code under those two directories counts against the thresholds, so run
`bun run test:coverage` (not just `bun run test`) before pushing. The report
lands in `coverage/` (text summary in the terminal, HTML in
`coverage/index.html`). Add tests alongside the change rather than lowering a
threshold.

### End-to-end tests (Playwright)

[Playwright](https://playwright.dev) drives a real Chromium browser against the
running Next.js dev server (config: `playwright.config.ts` — single Chromium
project, dev server started automatically unless one is already running).

```bash
bun run test:e2e    # headless Chromium (starts dev server automatically)
```

**Structure.** E2E specs live in `e2e/` as `<flow>.spec.ts` (e.g.
`e2e/deposit.spec.ts`), one file per user-facing flow, grouped with
`test.describe`. There's no page-object layer yet — specs query the DOM
directly via Testing-Library-style locators (`page.getByRole(...)`,
`page.getByText(...)`).

**Helpers.** Because the wallet integration needs a real browser extension,
specs seed a demo session via `page.addInitScript` before navigating, so the
flow under test never depends on an actual Stellar wallet:

```ts
async function seedDemoWallet(page: Page) {
  await page.addInitScript(
    ({ address }) => {
      localStorage.setItem('hb-address', address)
      localStorage.setItem('hb-wallet', 'demo')
    },
    { address: DEMO_ADDRESS },
  )
}
```

Follow `e2e/deposit.spec.ts` as the template for a new flow: seed whatever
session state the flow needs, `page.goto()` the route, then assert each step
of the flow in order with `expect(locator).toBeVisible()` /
`toBeDisabled()`.

#### Accessibility audits (axe-core)

Automated WCAG 2.1 AA accessibility checks run via `@axe-core/playwright` (#722):

```bash
bun run test:e2e e2e/a11y.spec.ts
```

The audit walks every public route and demo-authenticated route in both `light` and `dark` themes, excluding `<canvas>` elements. It fails on any unlisted `serious` or `critical` violations and attaches full axe diagnostics JSONs to the Playwright test report. Known pre-existing issues are tracked in `KNOWN_VIOLATIONS` in `e2e/a11y.spec.ts` with direct issue links.

#### Production CSP enforcement

```bash
bun run test:e2e:production
```

The run above sets `E2E_PRODUCTION=true` and targets only
`e2e/security-headers.spec.ts`. That flag makes `playwright.config.ts` build the
app and serve it on **port 3001** with `CSP_MODE=enforce`, so the extra
assertions run against the enforcing `Content-Security-Policy` header instead of
the `Content-Security-Policy-Report-Only` variant the app ships by default
(`src/lib/securityHeaders.ts`): no `'unsafe-eval'`, no `ws:` and no
`http://localhost` anywhere in the policy, `upgrade-insecure-requests` present,
and no CSP violations recorded on `/` or `/explore`.

Run it whenever you touch `src/proxy.ts`, `src/lib/securityHeaders.ts` or
anything inlined into `<head>`. It needs a full build, so it is slower than
`bun run test:e2e`, port 3001 must be free, and it is **not** part of CI — the
nightly workflow doesn't run it either.

#### On-chain journey (local Stellar network)

`e2e/chain/investor-journey.spec.ts` builds, signs and submits real Soroban
transactions, so it runs against **deployed contracts on a local network** and
needs a different config: `playwright.chain.config.ts` (`testDir: ./e2e/chain`,
base URL `http://localhost:3100`, override with `E2E_CHAIN_PORT`).

Prerequisites, none of which this repo installs for you:

- **Docker**, running quickstart with RPC and Horizon on port 8000:

  ```bash
  docker run -d --rm -p 8000:8000 --name stellar stellar/quickstart:latest \
    --local --enable core,rpc,horizon --limits unlimited
  ```

- **The `stellar` CLI** on `PATH` (CI pins 26.1.0).
- **Rust with the `wasm32v1-none` target** (`rustup target add wasm32v1-none`),
  because the setup script builds the contracts unless you point it at
  prebuilt WASM via `CONTRACTS_WASM_DIR`.
- **Access to `Heliobond/contracts`**, which the script clones into `.e2e/`
  (gitignored) at `CONTRACTS_REF`.
- **Playwright Chromium**: `bunx playwright install --with-deps chromium`.

Then, from the repo root:

```bash
scripts/e2e/setup-local-network.sh   # fund accounts, deploy contracts, write env
bun run test:e2e:chain               # build + serve on :3100, then run the journey
```

The setup script writes `e2e/chain/.env.chain.local` (gitignored, throwaway keys
only) and `playwright.chain.config.ts` loads it automatically; override the path
with `E2E_CHAIN_ENV`. `RPC_URL`, `HORIZON_URL`, `FRIENDBOT_URL`,
`CONTRACTS_DIR`, `CONTRACTS_REF`, `CONTRACTS_WASM_DIR` and `OUT_ENV` are the
script's env knobs. It provisions `e2e-admin`, `e2e-issuer` and `e2e-investor`
via friendbot, issues and deploys USDC, then deploys `ProjectRegistry` and
`InvestmentVault`.

The journey itself is one long test (connect → explore → project → deposit →
portfolio → withdraw → claim yield) with a 5-minute timeout and 30s expect
timeouts, single worker, traces and video retained on failure under
`test-results/chain` and `playwright-report/chain`. Tear the network down with
`docker rm -f stellar` when you're done.

CI runs this same command nightly and on demand via
`.github/workflows/e2e-chain.yml` (45-minute budget), not on pull requests.

## Development workflow

1. Branch off `main`: `git checkout -b <type>/<short-description>` (e.g. `feat/withdraw-max-chip`, `fix/helio-glow`, `i18n/creator-screens`).
2. Make focused changes — one issue per PR.
3. Run the checks locally: **`bun run build`** (must pass), **`bun run typecheck`**, **`bun run lint`**, **`bun run format:check`**, and **`bun run test`**. Add **`bun run test:coverage`** whenever you touch `src/lib/` or `src/wallet/` — CI enforces those thresholds, and `bun run test` doesn't.
4. If your change is user-facing or otherwise notable (a feature, a fix, a
   breaking change), add an entry under `[Unreleased]` in
   [`CHANGELOG.md`](./CHANGELOG.md) — see that file's "How entries are added"
   section for the format. Purely internal changes (refactors, tooling,
   formatting) don't need one.
5. Open a PR using the template; link the issue with `Closes #123`.
6. **CI runs two jobs** on every pull request and on pushes to `main`
   (`.github/workflows/ci.yml`): **`build`** (`bun run build`) and
   **`unit tests + coverage`** (`bun run test:coverage`). There is no CI job for
   lint, `format:check` or the Playwright suites, so those are yours to run
   locally. **`main` is protected** and requires green CI plus human maintainer
   review before merge.

### Review & Security Policy

- **Human Approval Required:** No pull request can be merged automatically. At least one human approval from a repository maintainer (or CODEOWNER) is required before code lands on `main`.
- **Advisory Automated Review:** The DeepSeek AI review workflow (`auto-review.yml`) is strictly advisory. It provides helpful PR summary comments but has no permission to approve PRs or trigger merges.
- **Least-Privilege Workflows:** Workflows running on `pull_request_target` operate with least-privilege `GITHUB_TOKEN` credentials (read-only repository contents access). Administrative Personal Access Tokens (`OWNER_PAT`) are strictly prohibited in public workflow runs.
- **Enforced Status Checks:** Branch protection on `main` requires the two CI checks — `build` and `unit tests + coverage` — to pass prior to merging. Nothing else is a required check: the DeepSeek `auto-review.yml` run is advisory, and `e2e-chain.yml` is nightly/on-demand rather than per-PR.

`CODEOWNERS` requires maintainer review for sensitive areas — the wallet integration, design tokens, i18n catalogs, and CI.

## Internationalization

Heliobond uses [`next-intl`](https://next-intl.dev) with cookie-based locale
selection. **Five** message catalogs ship, one per locale: `messages/ar.json`,
`messages/en.json`, `messages/es.json`, `messages/fr.json` and
`messages/pt.json` (the list lives in `src/i18n/config.ts` and is wired up in
`src/i18n/LocaleProvider.tsx`; `ar` is right-to-left). The request config in
`src/i18n/request.ts` loads the matching catalog for the current locale.

When you add or change user-facing copy:

1. Pick the namespace that matches the surface using the copy, such as `Nav`,
   `Footer`, `Landing`, `Deposit`, or `ProjectDetail`.
2. Add the same key path to **all five** catalogs — `ar.json`, `en.json`,
   `es.json`, `fr.json`, `pt.json`. The catalogs must stay in parity:
   `src/__tests__/catalog-parity.test.ts` compares every catalog against `en`
   key-for-key in both directions and fails the build on a missing **or** extra
   key, and it runs as part of `bun run test` and CI.
3. Translate the value in every catalog. Do not leave English placeholder text
   in the non-English catalogs unless the issue explicitly calls for a
   temporary fallback.
4. Read the key from code with `useTranslations('<Namespace>')`, then call
   `t('<key>')`. For example:

```tsx
import { useTranslations } from 'next-intl'

export function Example() {
  const t = useTranslations('Creator')
  return <h1>{t('title')}</h1>
}
```

To add a new namespace for a new screen or surface:

1. Create the namespace object in **all five** catalogs with identical keys:

```json
{
  "Creator": {
    "title": "Build your project"
  }
}
```

2. Add the translated values under the same namespace and key names in `ar.json`,
   `es.json`, `fr.json` and `pt.json`.
3. Use that namespace from the component with `useTranslations('Creator')`.
4. Run `bun run test` (which includes the parity test) plus `bun run build` or
   `bun run typecheck` before opening the PR. Note what each one catches: the
   parity test catches keys missing from any catalog, while `typecheck` only
   catches missing or misspelled keys **in English** —
   `src/i18n/next-intl.d.ts` types `Messages` as `typeof en`, so `tsc` cannot
   see a key that exists only in `fr.json` (or the other three).

## Quality bar

- **Builds and type-checks clean.** `bun run build` is the gate; no `any` to paper over types, no `@ts-ignore` without a comment.
- **Follow the design system.** Use the CSS custom properties (`var(--ink)`, `var(--solar)`, …) — never hardcode colours. See `README.md` and `src/styles/tokens/`.
- **Brand rules checklist.** Every PR touching UI copy or design must meet all of the following:
  - Sentence case — no all-caps headlines.
  - Mono tabular numerals for figures.
  - Every delta carries a `+`/`−` sign and arrow; colour is never the sole carrier.
  - Solar is never the sole carrier of meaning (and never text on a light background).
  - No emoji in the product.
  - No exclamation marks on financial copy.
- **User-facing strings are translated.** If you add or change copy in the shell or translated screens, add the key to **all five** catalogs (`ar`, `en`, `es`, `fr`, `pt`) — the parity test in `src/__tests__/catalog-parity.test.ts` fails the build otherwise.
- **Accessibility is not optional.** Keyboard operable, visible focus, semantic landmarks, `prefers-reduced-motion` respected, touch targets ≥ 44px.
- **No secrets** in the repo or in client code.

## Definition of done

- The issue's acceptance criteria are met.
- CI is green; the PR is reviewed and approved.
- UI changes include before/after screenshots (or a short screencast).
- Docs/translations updated where relevant.

## Reporting bugs & security

- **Bugs:** open a **Bug report** issue with steps to reproduce.
- **Security:** please do **not** open a public issue. Use GitHub's **"Report a vulnerability"** (Security tab) for a private advisory.

## Pre-commit hooks

The project ships a [Husky](https://typicode.github.io/husky/) pre-commit hook
in `.husky/pre-commit`, and **it is already active on a fresh clone** — there is
nothing to opt in to. `bun install` runs the `prepare` script (`"prepare":
"husky"`) in `package.json`, which points `core.hooksPath` at `.husky/_`. Check
it with:

```bash
git config core.hooksPath   # -> .husky/_
```

**What it actually runs** — `.husky/pre-commit` is two commands:

1. `bunx lint-staged`, which per `.lintstagedrc.json` runs `eslint --fix` then
   `prettier --write` on staged `*.{ts,tsx,js,jsx}` files, and `prettier --write`
   on staged `*.{json,md,yml,yaml}` files. Only **staged** files are touched,
   and because these commands write, their fixes land **in your commit** — keep
   unrelated files unstaged so you don't sweep formatting changes into a
   focused PR.
2. `bun run typecheck` (`tsc --noEmit`) over the whole project.

**No tests run on commit.** Run `bun run test`, and `bun run test:coverage` when
you touched `src/lib/` or `src/wallet/`, yourself before pushing — CI runs the
unit suite with coverage thresholds but not the Playwright suites.

**Opting out**, if you need to:

```bash
HUSKY=0 bun install                   # skip installing the hook (per install)
git commit --no-verify                # skip the hook for one commit
git config core.hooksPath /dev/null   # disable it for this clone
```

`bun run prepare` re-installs it, and `git config --unset core.hooksPath` undoes
the clone-wide opt-out. Contributors who skip the hook are still expected to run
the checks in the [Development workflow](#development-workflow) section.

By contributing, you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).
