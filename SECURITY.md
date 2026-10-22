# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report privately through GitHub: go to the repository's **Security** tab → **Report a vulnerability** (this opens a private advisory). If you can't use that, email **daveproxy80@gmail.com**.

Include what you can: affected component, steps to reproduce, and impact. We aim to acknowledge within a few days and will coordinate a fix and disclosure with you.

## Scope

This is testnet, pre-production software. The smart contracts have not yet been audited. Treat anything on-chain as experimental until a release notes otherwise.

## Security headers and Content-Security-Policy

The app signs transactions in the browser, so it ships a strict policy (#601):

- `Content-Security-Policy` is set per request in `src/proxy.ts` with a nonce.
  Scripts run only from `'self'` plus that nonce (`'strict-dynamic'`); the inline
  theme bootstrap in `src/app/layout.tsx` carries the nonce. `connect-src` is
  limited to the configured Horizon, Soroban RPC, backend and error-report
  origins plus WalletConnect. `frame-ancestors 'none'` protects the signing flow
  from clickjacking. Styles keep `'unsafe-inline'` because React inline `style`
  attributes are used throughout.
- `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` and
  `X-Frame-Options: DENY` are set for every route in `next.config.ts`.
- **Enforcement and rollout:** production sends `Content-Security-Policy` by
  default. `CSP_MODE=report-only` is an explicit temporary opt-out for monitoring
  a policy change; set `NEXT_PUBLIC_CSP_REPORT_URI` to collect violations and
  watch them through a full connect → deposit → withdraw session with each
  supported wallet (Freighter, xBull, Lobstr, WalletConnect) before returning to
  enforcement. A production build warns if report-only is enabled without a
  reporting URI. Development defaults to report-only.
- If you add a third-party origin (RPC, API, analytics), it must be configured
  through the env vars in `.env.example` or added to `src/lib/securityHeaders.ts`.

## Deployment secrets

Vercel builds `main` through its git integration, so every merged build script
runs with whatever the Vercel project exposes at build time (#920). The project
holds no server secrets today, and it must stay that way until production
builds move to `.github/workflows/deploy.yml`, which builds without secrets and
deploys the prebuilt output. Until then, do not add `HELIOBOND_API_KEY` or any
other server-only secret to the Vercel project.

## Telemetry and privacy

Client error reporting and web-vitals (#609) go to `NEXT_PUBLIC_ERROR_REPORT_URL`
when it is set; nothing is sent otherwise.

- **Collected:** error kind (render, route, transaction, RPC timeout, unhandled),
  the scrubbed message and stack, the Soroban contract error code, the operation
  name (deposit/withdraw), page path, release tag, and LCP/INP/CLS/FCP/TTFB.
- **Never collected:** wallet addresses, transaction hashes, emails or XDR — these
  are redacted from messages, stacks and caller-supplied `context` values before
  sending (`scrub()` in `src/lib/errorReporting.ts`) — and no cookies or
  persistent identifiers.
- **Opt-in (#658):** telemetry is **off until the visitor agrees**. A first visit
  shows a consent banner (`src/components/TelemetryConsent.tsx`); the choice is
  stored as `hb-telemetry-consent` = `granted` | `denied` and can be changed at
  any time from the privacy control in the footer. With no recorded choice —
  including a visitor who never sees the banner — **nothing is sent**
  (`isTelemetryAllowed()` requires `granted`).
- **Browser signals override consent:** nothing is sent when the browser sends
  Do-Not-Track or Global Privacy Control, even if consent was granted.
- **Source maps:** build with `SOURCE_MAPS=true` to publish browser source maps
  so the sink can symbolicate stacks.

## Wallet sign-in

Backend-authenticated features use a wallet signature (SEP-53 message signing, or
a SEP-10 challenge transaction) exchanged for a short-lived JWT bound to the
G-address (#603). The token is kept in memory only; the session is restored
through an HttpOnly refresh cookie. See [docs/AUTH.md](docs/AUTH.md).

## Supply chain

Code runs on developer machines and in the production build whenever a
dependency, lifecycle script, git hook or tool config runs, so those are
reviewed as code:

- **Package manager:** bun only, with `bun install --frozen-lockfile` in CI.
  `bun.lock` is the only lockfile that counts; do not add `pnpm-lock.yaml` or
  `yarn.lock` (the stale `package-lock.json` is being removed in #918).
- **Scripts and hooks:** changes to `package.json` scripts, `.husky/*`,
  `.github/workflows/*`, `scripts/*` and tool configs (ESLint, Next, Vitest,
  Playwright, PostCSS, Tailwind, `bunfig.toml`, `.npmrc`) need a maintainer's
  review. The `supply-chain review gate` check blocks such a PR until a
  maintainer applies the `supply-chain-reviewed` label, and prints the exact
  changes in the job summary. A new push ignores the label, so remove and
  re-add it after reviewing the new commits.
- **Hidden content:** the `hidden-content check` CI job fails on tab-padded lines,
  zero-width or bidi characters, obfuscated code and new root-level scripts
  (`scripts/check-hidden-content.mjs`).
- **Dependencies:** a new dependency needs a justification in the PR, its
  publish date and its install-script status. Do not add a package to
  `trustedDependencies` without review.
- **Actions:** workflows that run fork code use the `pull_request` event,
  which gets no secrets and a read-only token. The one `pull_request_target`
  workflow (`auto-review.yml`) checks out the base branch and only reads the
  PR diff through the API; it must never check out or run fork code.

## Incident response

If a malicious change reaches a branch:

1. Revert the merge commit on `main` and block the deploy pipeline.
2. Rotate every secret the build or runtime could read, including deploy tokens,
   API keys and error-sink tokens, starting with anything that was present in
   the environment of the affected build.
3. Check the affected developer machines and CI runs that installed or built the
   change, then rebuild them from a clean checkout.
4. Report it privately (see above) and record the incident in the changelog.
