# Contributing to Heliobond

Thanks for helping build Heliobond — a green-bond investment app on Stellar that
opens green investing to everyone, from one dollar. The same values we promise
users (transparency, plain language, no dark patterns, accessibility) apply to
how we build: in the open, kindly, and to a high bar.

- **Live demo:** https://heliobond.vercel.app
- **Architecture & layout:** see [`README.md`](./README.md)
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

Prerequisites: [**bun**](https://bun.sh) **1.2.4** (the package manager / runner) and Node 18.18+.

```bash
git clone https://github.com/Heliobond/frontend.git
cd frontend
bun install
bun run dev        # http://localhost:3000
```

Useful scripts:

```bash
bun run build         # production build — also runs the TypeScript type-checker
bun run typecheck     # tsc --noEmit
bun run lint          # ESLint (next/core-web-vitals + TypeScript rules)
bun run format        # Prettier — rewrite files in place
bun run format:check  # Prettier — check only (used in CI)
bun run start         # serve the production build
bun run test          # run the Vitest unit + component test suite
bun run test:e2e      # run Playwright end-to-end tests (starts dev server automatically)
```

## Running tests

### Unit and component tests (Vitest)

The project uses [Vitest](https://vitest.dev) with a jsdom environment and
[@testing-library/react](https://testing-library.com/docs/react-testing-library/intro/)
for component rendering.

```bash
bun run test        # run all tests once and exit
bun run test:ui     # open the Vitest browser UI
```

A shared render helper lives in `src/test/render.tsx`. It wraps components in
the i18n and theme providers the app uses, so component tests get a realistic
context. Import from there instead of `@testing-library/react` directly:

```ts
import { render, screen, fireEvent } from '@/test/render'
```

### End-to-end tests (Playwright)

[Playwright](https://playwright.dev) drives a real Chromium browser against the
running Next.js dev server.

```bash
bun run test:e2e    # headless Chromium (starts dev server automatically)
```

E2E tests live in `e2e/`. The deposit smoke test seeds a demo wallet via
`localStorage` so no real Stellar wallet extension is required.

## Development workflow

1. Branch off `main`: `git checkout -b <type>/<short-description>` (e.g. `feat/withdraw-max-chip`, `fix/helio-glow`, `i18n/creator-screens`).
2. Make focused changes — one issue per PR.
3. Run the checks locally: **`bun run build`** (must pass), **`bun run typecheck`**, **`bun run lint`**, and **`bun run format:check`**.
4. Open a PR using the template; link the issue with `Closes #123`.
5. CI runs build, typecheck, lint, and format check on every PR; **`main` is protected** and requires green CI plus a maintainer review before merge.

`CODEOWNERS` requires maintainer review for sensitive areas — the wallet integration, design tokens, i18n catalogs, and CI.

## Quality bar

- **Builds and type-checks clean.** `bun run build` is the gate; no `any` to paper over types, no `@ts-ignore` without a comment.
- **Follow the design system.** Use the CSS custom properties (`var(--ink)`, `var(--solar)`, …) — never hardcode colours. Honour the brand rules: sentence case (no all-caps headlines), mono tabular numerals for figures, every delta carries a +/− sign and arrow (colour is never the sole carrier), solar is never text on a light background and never the only carrier of meaning, no emoji in the product, no exclamation marks on financial copy. See `README.md` and `src/styles/tokens/`.
- **User-facing strings are translated.** If you add or change copy in the shell or the six investor screens, add the key to **both** `messages/en.json` and `messages/fr.json` (they must stay in parity).
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

## Pre-commit hooks (optional)

The project ships a pre-commit hook via **Husky** + **lint-staged** that runs the TypeScript
type-checker on staged files before each commit. Install it:

```bash
bun run prepare
```

To opt out, skip the `prepare` step — the hook is **not** installed unless you run it.
Contributors who opt out are still expected to run `bun run build` before opening a PR.

By contributing, you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).
