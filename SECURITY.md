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
- **Rollout:** the policy is sent as `Content-Security-Policy-Report-Only` until
  `CSP_MODE=enforce` is set. Set `NEXT_PUBLIC_CSP_REPORT_URI` to collect
  violations, watch them through a full connect → deposit → withdraw session with
  each supported wallet (Freighter, xBull, Lobstr, WalletConnect), then enforce.
- If you add a third-party origin (RPC, API, analytics), it must be configured
  through the env vars in `.env.example` or added to `src/lib/securityHeaders.ts`.

## Telemetry and privacy

Client error reporting and web-vitals (#609) go to `NEXT_PUBLIC_ERROR_REPORT_URL`
when it is set; nothing is sent otherwise.

- **Collected:** error kind (render, route, transaction, RPC timeout, unhandled),
  the scrubbed message and stack, the Soroban contract error code, the operation
  name (deposit/withdraw), page path, release tag, and LCP/INP/CLS/FCP/TTFB.
- **Never collected:** wallet addresses, transaction hashes, emails or XDR — these
  are redacted from messages and stacks before sending (`scrub()` in
  `src/lib/errorReporting.ts`) — and no cookies or persistent identifiers.
- **Opt-out:** nothing is sent when the browser sends Do-Not-Track or Global
  Privacy Control, or when the visitor's choice `hb-telemetry-consent` is
  `denied` (`setTelemetryConsent()`).
- **Source maps:** build with `SOURCE_MAPS=true` to publish browser source maps
  so the sink can symbolicate stacks.

## Wallet sign-in

Backend-authenticated features use a wallet signature (SEP-53 message signing, or
a SEP-10 challenge transaction) exchanged for a short-lived JWT bound to the
G-address (#603). The token is kept in memory only; the session is restored
through an HttpOnly refresh cookie. See [docs/AUTH.md](docs/AUTH.md).
