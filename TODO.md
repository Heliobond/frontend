# Issue TODO

- [x] **Security: password-reset email URLs** — reject `http:` reset links and invalid URLs instead of silently emitting a dead `#` link.
- [x] **Tests: wallet and session logic** — add direct tests for `transactions.ts`, `useRemoteSync`, `RecurringInvestmentSync`, `useTransactionFee`, and `vaultEvents`; `contractErrors.test.ts` already covers `contractErrorCodes` directly.
- [x] **Tests: `useVault` decoding and fallback** — exercise decoded read values and selector fallbacks without wholesale module mocks.
- [x] **Watchlist: fetch failures and loading** — distinguish confirmed missing projects from failed fetches, preserve failed items, and render a loading state.
