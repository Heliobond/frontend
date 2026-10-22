# Mainnet checklist

Go through this list before pointing a production build at the Stellar public network
(`NEXT_PUBLIC_STELLAR_NETWORK=public`). Every item must be checked off in the release
PR. If an item doesn't apply, write down why.

## Network and wallet

- [ ] `NEXT_PUBLIC_STELLAR_NETWORK=public` is set for the production environment, and
      `NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE` is **unset**. The passphrase override exists
      only for local quickstart e2e runs.
- [ ] `NEXT_PUBLIC_SOROBAN_RPC_URL` and `NEXT_PUBLIC_HORIZON_URL` point at mainnet
      providers you control or have an SLA with, not the public testnet defaults.
- [ ] The top bar shows **no** network pill. The `TESTNET` pill appears only on
      non-mainnet builds.
- [ ] Connect a wallet that is set to testnet. The red "network mismatch" banner
      appears, and a deposit is blocked before the wallet prompt opens.
- [ ] `NEXT_PUBLIC_E2E_TEST_WALLET` is **unset**. The keypair test wallet can't load on
      mainnet builds anyway, but it must not be configured.

## Contracts

- [ ] `NEXT_PUBLIC_VAULT_CONTRACT_ID` (and the registry ID) are pinned to the audited
      mainnet deployment. Record the IDs and WASM hashes in the release notes.
- [ ] The deployed WASM hash matches the tagged release in
      [Heliobond/contracts](https://github.com/Heliobond/contracts)
      (`stellar contract info hash --id <id> --network mainnet`).
- [ ] The vault's admin, multisig signers and emergency admin are the production keys,
      not a deployer or test account.

## Assets

- [ ] The USDC issuer is verified: the vault's `accepted_asset()` is the Circle USDC
      SAC, and its issuer is `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`.
      Check it against Circle's published address, not a copy of it.
- [ ] Any hard-coded asset codes, issuers or explorer links in the UI point at
      mainnet (`EXPLORER_BASE_URL` comes from `src/config/network.ts`).

## Data and fallbacks

- [ ] Demo fallbacks are disabled. Nothing that affects user funds (balances, share
      price, portfolio, investments) may silently fall back to `src/data.ts` fixtures
      or mock responses. If a live read fails, show an error.
- [ ] "Demo wallet" / `connectDemo` is hidden or clearly labelled on the production
      build.
- [ ] `NEXT_PUBLIC_API_URL` points at the production backend.
- [ ] Before adding `HELIOBOND_API_KEY` or any server secret to Vercel, production
      builds run through `.github/workflows/deploy.yml` (switched from
      `workflow_dispatch` to `workflow_run`) and Vercel's git deploys for `main`
      are off, so no merged build script runs next to a secret (#920).
- [ ] Dev-only routes (`/contrast-test`, `/learn/password-reset-email`) return 404, and
      `NEXT_PUBLIC_ENABLE_DEV_ROUTES` is unset.

## Security and operations

- [ ] A Content-Security-Policy and the standard security headers are enabled in
      `next.config.ts`, and the CSP allows only the RPC/Horizon hosts in use.
- [ ] Error tracking is on (client error reporting and web-vitals), and alerts
      route to someone on call.
- [ ] CI is green on the release commit: typecheck, lint, unit tests with coverage
      thresholds, build, and the e2e investor journey.
- [ ] Rollback plan: the previous build can be redeployed, and there is a documented
      way to pause the vault (`emergency_pause`) if something goes wrong on-chain.
- [ ] Production builds do not hold server-only secrets (#920). In the Vercel
      project, `NEXT_PUBLIC_*` values are the only variables exposed to the build
      step; server secrets such as `HELIOBOND_API_KEY` are available at runtime
      only. Verify in the dashboard, since this is not configured in the repo.
- [ ] Production deploys wait for CI. Auto-promotion of `main` is gated on the
      `build`, `unit tests + coverage`, `hidden-content check` and
      `supply-chain review gate` checks, so a merge never builds with production secrets before CI is green.
- [ ] After any reverted merge to `main`, deploy secrets are rotated (see the
      incident response steps in [SECURITY.md](../SECURITY.md#incident-response)).
