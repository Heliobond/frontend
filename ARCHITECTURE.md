# Heliobond Frontend Architecture & Contract Integration Map

This document defines the architecture of the Heliobond investor application and maps each user surface to its corresponding Stellar / Soroban smart contract dependencies, data models, and client functions.

> **Implementation Note & Scope:**
> Heliobond is architected to operate in two modes:
>
> 1. **Live On-Chain Mode (Soroban Testnet):** When `NEXT_PUBLIC_VAULT_CONTRACT_ID` / `NEXT_PUBLIC_REGISTRY_CONTRACT_ID` and wallet connections are active, vault reads (`total_assets`, `convert_to_assets`, `get_portfolio`, `claimable_yield`, the vault limits), registry reads (`get_projects_page`, `get_project`, `get_score_history`, `total_projects`) and transactional flows (`deposit`, `withdraw`, `claim`, `claim_yield`) execute directly against the deployed Soroban smart contracts.
> 2. **Simulated / Fixture Mode:** When contract IDs are unset or in demo wallet mode, the application falls back gracefully to deterministic typed fixtures (`src/data.ts`, `src/data/*`) and synchronous client simulations ([`src/wallet/vault.ts`](src/wallet/vault.ts)).
>
> The contract methods named in sections 1–3 are taken from the actual `contract.call(...)` sites in [`src/wallet/vault.ts`](src/wallet/vault.ts), [`src/wallet/registry.ts`](src/wallet/registry.ts) and [`src/wallet/admin.ts`](src/wallet/admin.ts), together with the screens and hooks that consume them. Keep this map in sync with those call sites — they are the frontend's source of truth for the ABI. The Rust definitions live in the separate `Heliobond/contracts` repository.

---

## 1. Core Contract Mappings

The investment pool is governed by Soroban smart contract logic mirroring ERC-4626 tokenized vault standards on Stellar (denominated in USDC with HBS pool share tokens). The frontend client layer is implemented in [`src/wallet/vault.ts`](src/wallet/vault.ts) and consumed by [`src/wallet/useVault.ts`](src/wallet/useVault.ts), [`src/wallet/useVaultLimits.ts`](src/wallet/useVaultLimits.ts), [`src/hooks/usePortfolio.ts`](src/hooks/usePortfolio.ts) and the deposit / withdraw / portfolio screens.

### 1.1 InvestmentVault — [`src/wallet/vault.ts`](src/wallet/vault.ts)

| Contract Method (signature)                                           | Client Function / Binding                                           | Type      | Description                                                                                                                                                                                |
| :-------------------------------------------------------------------- | :------------------------------------------------------------------ | :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `total_assets() -> i128`                                              | `fetchTotalAssets(sourceAddress)`                                   | View Read | Reads total USDC controlled by the vault via Soroban RPC simulation. Fallback: `HB_DATA.pool.totalAssets`.                                                                                 |
| `convert_to_assets(shares: i128) -> i128`                             | `fetchSharePrice(sourceAddress)`<br>`vault.convertToAssets(shares)` | View Read | The vault exposes no dedicated share-price view, so `fetchSharePrice` simulates `convert_to_assets(1 share)`; `vault.convertToAssets` is the matching client preview.                      |
| `get_portfolio(account: Address) -> PortfolioInfo`                    | `fetchPortfolio(account)`                                           | View Read | Returns `shares`, `usdc_value`, `claimable_yield`, `share_of_pool_bps` and `total_deposited` for the connected wallet.                                                                     |
| `claimable_yield(account: Address) -> i128`                           | `fetchClaimableYield(account)`                                      | View Read | Unclaimed yield in USDC for an account; `0` when no contract is configured.                                                                                                                |
| `get_utilization_bps() -> u32`                                        | `fetchUtilizationBps(sourceAddress)`                                | View Read | Deployed / total ratio in basis points (10 000 = 100 %); surfaced in the Withdraw error state and the Admin console.                                                                       |
| `is_paused() -> bool`                                                 | `fetchVaultLimits(sourceAddress)`<br>`useVaultLimits()`             | View Read | Vault pause flag. When true the deposit and withdraw CTAs are disabled.                                                                                                                    |
| `max_transaction_amount() -> i128`                                    | `fetchVaultLimits(sourceAddress)`<br>`useVaultLimits()`             | View Read | Graduated per-transaction ceiling applied to deposits and withdrawals.                                                                                                                     |
| `get_deposit_lock_expiry(account: Address) -> u64`                    | `fetchVaultLimits(sourceAddress)`<br>`useVaultLimits()`             | View Read | Unix seconds before which the account cannot withdraw; drives the "withdrawals unlock in …" reason.                                                                                        |
| `deposit(from: Address, usdc_amount: i128)`                           | `submitDeposit(amount, address, sign, signal, slippageTolerance)`   | Signed Tx | Builds the transaction, simulates via RPC, requests wallet signature, submits and polls confirmation.                                                                                      |
| `withdraw(from: Address, shares_amount: i128, min_usdc_return: i128)` | `submitWithdraw(amount, address, sign, signal, slippageTolerance)`  | Signed Tx | Burns HBS shares and transfers USDC. If liquid reserves are insufficient the vault queues the request and emits a `withdraw_queued` event, which the client decodes to flag a FIFO payout. |
| `claim()`                                                             | `submitClaim(address, sign)`                                        | Signed Tx | Permissionless; settles queued withdrawals in FIFO order to their owners.                                                                                                                  |
| `claim_yield(from: Address)`                                          | `submitClaimYield(address, sign)`                                   | Signed Tx | Pays the connected wallet its claimable USDC yield.                                                                                                                                        |

### 1.2 ProjectRegistry — [`src/wallet/registry.ts`](src/wallet/registry.ts)

| Contract Method                    | Client Function / Binding                         | Type      | Description                                                                                                                                     |
| :--------------------------------- | :------------------------------------------------ | :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_projects_page(offset, limit)` | `fetchProjectsPage(offset, limit, sourceAddress)` | View Read | Paginated registry rows mapped to UI projects; backed by `NEXT_PUBLIC_REGISTRY_CONTRACT_ID`.                                                    |
| `total_projects()`                 | `fetchTotalProjects(sourceAddress)`               | View Read | Total registered project count, used for pagination and the Landing orb density.                                                                |
| `get_project(id)`                  | `fetchProjectWithDetails(id, sourceAddress)`      | View Read | Single project record. Off-chain `metadata_uri` content is fetched and its SHA-256 hash compared to the on-chain `metadata_hash` in the client. |
| `get_score_history(id)`            | `fetchScoreHistory(id, sourceAddress)`            | View Read | Historic credit / green score points for the project detail sparklines.                                                                         |

### 1.3 Admin & Oracle Writes — [`src/wallet/admin.ts`](src/wallet/admin.ts)

| Contract / Method                                                               | Client Function / Binding | Type      | Description                                                                                                                      |
| :------------------------------------------------------------------------------ | :------------------------ | :-------- | :------------------------------------------------------------------------------------------------------------------------------- |
| `InvestmentVault.fund_project(project_id: u64, amount: i128)`                   | `submitFundProject(...)`  | Signed Tx | Deploys idle liquid vault USDC to a project. Multisig deployments invoke `fund_project_approved`.                                |
| `ProjectRegistry.update_impact_score(project_id: u64, credit: u32, green: u32)` | `submitUpdateScores(...)` | Signed Tx | Oracle score update written to the registry. Multisig: `update_impact_score_approved`.                                           |
| `ProjectRegistry.set_whitelist(creator: Address, approved: bool)`               | `submitSetWhitelist(...)` | Signed Tx | Creator whitelisting lives on the registry itself — there is no separate whitelist contract. Multisig: `set_whitelist_approved`. |
| `InvestmentVault.pause(paused: bool)`                                           | `submitPause(...)`        | Signed Tx | Privileged pause toggle. Multisig: `pause_approved`.                                                                             |

### 1.4 Client-side previews (no contract call)

`vault.convertToShares(usdc)` / `vault.previewDeposit(usdc)` and `vault.convertToAssets(shares)` / `vault.previewWithdraw(usdc)` in [`src/wallet/vault.ts`](src/wallet/vault.ts) are synchronous local math that mirrors the vault's conversion formulas for immediate input preview. Only `convert_to_assets` is additionally read on-chain (see 1.1).

---

## 2. Surface-by-Surface Contract Integration Map

### 2.1 Landing

- **Route:** `/` (`src/screens/Landing.tsx`)
- **Current Data Source:** Fixture data (`selectPoolSummary()` / `HB_DATA.pool` in `src/data.ts`).
- **Soroban Read Dependency:** None at present — the hero counters (pool value, projects funded, return rate) and the WebGL `LiveHelio` orb density are fixture-backed.
- **Soroban Write Dependency:** None (public informational surface).
- **Relevant Vault / Client Function:** `selectPoolSummary()`, `LiveHelio`.

### 2.2 Connect

- **Route:** `/connect` (`src/screens/Connect.tsx`)
- **Current Data Source:** Live wallet integration via `@creit.tech/stellar-wallets-kit` (`src/wallet/WalletProvider.tsx`) with fallback demo session (`connectDemo`).
- **Soroban Read Dependency:**
  - Stellar Horizon / RPC account check: Validates account existence, sequence number, native XLM balance (for transaction fees), and SAC USDC trustline / balance.
- **Soroban Write Dependency:** None during initial connection (wallet session handshake).
- **Relevant Vault / Client Function:** `useWallet().connect()`, `useWallet().connectDemo()`, `useWallet().sign()`.

### 2.3 Explore

- **Route:** `/explore` (`src/screens/Explore.tsx`)
- **Current Data Source:** On-chain ProjectRegistry when `NEXT_PUBLIC_REGISTRY_CONTRACT_ID` is set (via `getProjectsPaginated()` → `fetchProjectsPage()`), otherwise the REST backend, otherwise bundled fixtures.
- **Soroban Read Dependency:**
  - `ProjectRegistry.get_projects_page(offset, limit)`: Paginated listing of registered green energy projects, including metadata (location, type, funding goal, capital deployed).
  - `ProjectRegistry.total_projects()`: Total count for pagination.
  - Credit and green impact scores are returned on each project row; the registry has no separate score read for the list view.
- **Soroban Write Dependency:** None (filtering and browsing).
- **Relevant Vault / Client Function:** `getProjectsPaginated()` (→ `fetchProjectsPage` / `fetchTotalProjects`).

### 2.4 Project Detail

- **Route:** `/project/[id]` (`src/screens/ProjectDetail.tsx`, data loaded in `src/app/project/[id]/page.tsx`)
- **Current Data Source:** On-chain ProjectRegistry when configured (`getProject(id)` → `fetchProjectWithDetails`), otherwise the REST backend or bundled fixtures.
- **Soroban Read Dependency:**
  - `ProjectRegistry.get_project(id)`: Detailed project profile, verified creator attribution, stated funding goal, and pool capital allocated.
  - `ProjectRegistry.get_score_history(id)`: Historical credit & green score points for the on-chain sparklines.
  - Off-chain metadata: the project's `metadata_uri` JSON is fetched and its SHA-256 hash compared client-side against the on-chain `metadata_hash` (no contract verification call).
- **Soroban Write Dependency:** None directly on page view (primary CTA navigates to `/deposit`).
- **Relevant Vault / Client Function:** `getProject(id)` (→ `fetchProjectWithDetails` / `fetchScoreHistory`).

### 2.5 Deposit

- **Route:** `/deposit` (`src/screens/Deposit.tsx`)
- **Current Data Source:** Active Soroban contract integration when `NEXT_PUBLIC_VAULT_CONTRACT_ID` is set; synchronous simulation in demo mode or without env configuration.
- **Soroban Read Dependency:**
  - `InvestmentVault.total_assets`: Vault TVL for pool-level metrics.
  - `InvestmentVault.convert_to_assets(1 share)`: Live share price used to calculate expected HBS output.
  - Vault limits via `useVaultLimits()`: `is_paused`, `max_transaction_amount`, `get_deposit_lock_expiry`, `get_utilization_bps`.
- **Soroban Write Dependency:**
  - `InvestmentVault.deposit(from: Address, usdc_amount: i128)`: Transfers USDC from the investor account into the vault and mints corresponding HBS shares.
- **Relevant Vault / Client Function:**
  - Read / Preview: `fetchSharePrice`, `fetchTotalAssets`, `useVault()`, `useVaultLimits()`.
  - Transaction: `submitDeposit(amount, address, sign, signal, slippageTolerance)`.

### 2.6 Portfolio

- **Route:** `/portfolio` (`src/screens/Portfolio.tsx`)
- **Current Data Source:** On-chain position via `usePortfolio()` (`get_portfolio` + `claimable_yield`) and `OnChainPosition` when a contract is configured; otherwise demo fixtures (`HB_DATA.you`, `HB_DATA.activity`).
- **Soroban Read Dependency:**
  - `InvestmentVault.get_portfolio(account)`: HBS share balance, current USDC value, claimable yield, pool share in bps, and lifetime USDC deposited.
  - `InvestmentVault.claimable_yield(account)`: Unclaimed yield in USDC.
- **Soroban Write Dependency:**
  - `InvestmentVault.claim()`: Permissionless settlement of queued withdrawals, claimed from the pending-withdrawals card.
  - `InvestmentVault.claim_yield(from)`: Pays the wallet's claimable yield from the on-chain position card.
- **Relevant Vault / Client Function:** `usePortfolio()`, `OnChainPosition`, `submitClaim`, `submitClaimYield`. (The `LiquidityMeter` liquid figure remains fixture-backed at `$236`.)

### 2.7 Withdraw

- **Route:** `/withdraw` (`src/screens/Withdraw.tsx`)
- **Current Data Source:** Active Soroban contract integration when `NEXT_PUBLIC_VAULT_CONTRACT_ID` is set; simulated 2-second delay in demo mode. The immediate-liquid cap is currently fixture-backed (`liquid = 236`).
- **Soroban Read Dependency:**
  - `InvestmentVault.convert_to_assets(1 share)`: Live exchange rate for asset conversion.
  - Vault limits via `useVaultLimits()`: `is_paused`, `max_transaction_amount`, `get_deposit_lock_expiry`, `get_utilization_bps`.
  - `get_utilization_bps()` is also re-read to annotate liquidity-related contract errors.
- **Soroban Write Dependency:**
  - `InvestmentVault.withdraw(from: Address, shares_amount: i128, min_usdc_return: i128)`: Burns HBS shares and transfers equivalent USDC assets. Requests above available liquidity are queued (FIFO) and emit `withdraw_queued`; they are later settled by `claim()`.
- **Relevant Vault / Client Function:**
  - Read / Preview: `fetchSharePrice`, `useVault()`, `useVaultLimits()`, `fetchUtilizationBps`.
  - Transaction: `submitWithdraw(amount, address, sign, signal, slippageTolerance)`.

### 2.8 Creator

- **Route:** `/creator` (`src/screens/creator/*`, `src/app/creator/page.tsx`)
- **Current Data Source:** Fixture data (`CREATOR_APPLICATION`, `DRAFT_PROJECT`, `CREATOR_DASHBOARD` in `src/data/creator.ts`). Form submission updates local component state only.
- **Soroban Read Dependency:** None — the creator surface is fixture-only today and reads no registry or oracle data.
- **Soroban Write Dependency:** None. The creator application form has no contract call site; creator approval is performed by an admin through `ProjectRegistry.set_whitelist` (see 2.9).
- **Relevant Vault / Client Function:** None (typed fixture models in `src/data/creator.ts`).

### 2.9 Admin / Oracle

- **Route:** `/admin` (`src/screens/admin/*`)
- **Current Data Source:** Live on-chain reads when contracts are configured, with fixture data (`VAULT_STATS`, `REGISTRY`, `WHITELIST` in `src/data/admin.ts`) providing the initial render and demo fallback.
- **Soroban Read Dependency:**
  - `InvestmentVault.total_assets` and `get_utilization_bps`: Privileged accounting views used to derive liquid vs. deployed balances.
  - `ProjectRegistry.get_projects_page(0, 50)`: Complete project registry with last-verified timestamps.
- **Soroban Write Dependency:**
  - `ProjectRegistry.update_impact_score(project_id, credit, green)`: Oracle score updates written to the registry.
  - `InvestmentVault.fund_project(project_id, amount)`: Privileged call deploying idle liquid vault USDC to a project.
  - `ProjectRegistry.set_whitelist(creator, approved)`: Approving or revoking creator whitelist permissions.
  - `InvestmentVault.pause(paused)`: Privileged pause toggle.
- **Relevant Vault / Client Function:** [`src/wallet/admin.ts`](src/wallet/admin.ts) — `fetchTotalAssets`, `fetchUtilizationBps`, `fetchProjectsPage`, `submitFundProject`, `submitUpdateScores`, `submitSetWhitelist`, `submitPause`.

---

## 3. Summary Architecture Matrix

| Surface            | Route           | Current Data Source                            | Soroban Read Dependency                                                                                                      | Soroban Write Dependency                                        | Vault / Client Function                                               |
| :----------------- | :-------------- | :--------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- | :-------------------------------------------------------------------- |
| **Landing**        | `/`             | Fixtures (`selectPoolSummary`)                 | None                                                                                                                         | None                                                            | `selectPoolSummary`, `LiveHelio`                                      |
| **Connect**        | `/connect`      | Stellar Wallets Kit + Demo                     | Horizon / RPC Account Check                                                                                                  | None                                                            | `WalletProvider` (`connect`, `sign`)                                  |
| **Explore**        | `/explore`      | On-chain registry / REST API / fixtures        | `get_projects_page`, `total_projects`                                                                                        | None                                                            | `getProjectsPaginated()`                                              |
| **Project Detail** | `/project/[id]` | On-chain registry / REST API / fixtures        | `get_project`, `get_score_history`                                                                                           | None                                                            | `getProject(id)`                                                      |
| **Deposit**        | `/deposit`      | Live Soroban / fixture fallback                | `total_assets`, `convert_to_assets`, `is_paused`, `max_transaction_amount`, `get_deposit_lock_expiry`, `get_utilization_bps` | `deposit(from, usdc_amount)`                                    | `useVault`, `useVaultLimits`, `submitDeposit`                         |
| **Portfolio**      | `/portfolio`    | On-chain position (`get_portfolio`) / fixtures | `get_portfolio`, `claimable_yield`                                                                                           | `claim`, `claim_yield`                                          | `usePortfolio`, `OnChainPosition`, `submitClaim`, `submitClaimYield`  |
| **Withdraw**       | `/withdraw`     | Live Soroban / fixture fallback                | `total_assets`, `convert_to_assets`, `is_paused`, `max_transaction_amount`, `get_deposit_lock_expiry`, `get_utilization_bps` | `withdraw(from, shares_amount, min_usdc_return)`                | `useVault`, `useVaultLimits`, `submitWithdraw`, `fetchUtilizationBps` |
| **Creator**        | `/creator`      | Fixtures (`data/creator.ts`)                   | None                                                                                                                         | None                                                            | Local fixture models only                                             |
| **Admin / Oracle** | `/admin`        | On-chain reads + fixture fallback              | `total_assets`, `get_utilization_bps`, `get_projects_page`                                                                   | `fund_project`, `update_impact_score`, `set_whitelist`, `pause` | `src/wallet/admin.ts` submitters and vault / registry reads           |

---

## 4. Contract Interaction & Transaction Lifecycle

When interacting with Soroban contracts (e.g. `submitDeposit` / `submitWithdraw`), the application follows a 5-step lifecycle:

```
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│ 1. Parameter    │ ──> │ 2. RPC Simulation    │ ──> │ 3. Assemble & Sign   │
│    Validation   │     │    (sorobanServer.   │     │    (WalletProvider.  │
│    (parseAmount)│     │     simulateTx)      │     │     sign)            │
└─────────────────┘     └──────────────────────┘     └──────────────────────┘
                                                                │
                                                                ▼
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│ 5. UI Confirmed │ <── │ 4. Status Polling    │ <── │ 3b. RPC Submission   │
│    (Toast +     │     │    (getTransaction   │     │     (sendTransaction)│
│     Explorer)   │     │     until SUCCESS)   │     │                      │
└─────────────────┘     └──────────────────────┘     └──────────────────────┘
```

1. **Parameter Validation:** User inputs are parsed and validated against balance/liquidity limits using [`src/lib/format.ts`](src/lib/format.ts).
2. **Simulation:** The transaction is constructed with dummy fees (`100` stroops) and simulated via `@stellar/stellar-sdk` RPC Server to calculate accurate resource fees and footprint.
3. **Assembly & Signing:** `rpc.assembleTransaction` merges simulation results into the transaction; the user signs the XDR via their connected wallet (Freighter, xBull, etc.).
4. **Submission & Polling:** The signed transaction is submitted to Stellar testnet and polled via `server.getTransaction(hash)` until reaching `SUCCESS` or `FAILED` state (timeout: 30s).
5. **UI Update:** The client transitions to the success step, displays the transaction hash linking to StellarExpert (`https://stellar.expert/explorer/testnet/tx/...`), and invalidates cached vault stats.

---

## 5. Client-Side Stores (`useSyncExternalStore`)

State that mirrors something outside React — `localStorage`, `sessionStorage`, or
a background poller — lives in a plain module and is read through
`useSyncExternalStore` rather than copied into `useState` from an `useEffect`.
Copying state in an effect causes a cascading render, and the value is wrong for
the whole first paint.

| Module                      | Holds                                 | Consumer                  |
| --------------------------- | ------------------------------------- | ------------------------- |
| `wallet/session.ts`         | connected address, wallet id, network | `WalletProvider`          |
| `wallet/transactions.ts`    | pending transaction list              | `TransactionsProvider`    |
| `lib/yieldAlerts.ts`        | saved yield alerts                    | `YieldAlertProvider`      |
| `lib/bondUtils.ts`          | bond yield-range filter               | `useBondFilters`          |
| `hooks/useHorizonHealth.ts` | Horizon reachability                  | `OfflineBanner`, `TopBar` |

### The snapshot stability rule

`getSnapshot` **must return the same object reference until the stored value
actually changes.** React compares the result with `Object.is` after every
render; returning a fresh object each time makes it believe the store changed
and re-render forever ("getSnapshot should be cached").

So each store keeps a module-level snapshot and only replaces it inside an
explicit `refresh()`:

```ts
let snapshot = INITIAL // stable module-level value
const listeners = new Set<() => void>()

function refresh() {
  // the only place snapshot is reassigned
  snapshot = readFromStorage()
}

function publish() {
  refresh()
  listeners.forEach((listener) => listener())
}
```

`readFromStorage()` itself must **not** be called from `getSnapshot` — return the
cached `snapshot` and let the store's `publish()` update it. `getServerSession()`
returns a fixed object for SSR, which is what lets the first client render match
the server HTML.

### Tell "empty" apart from "not read yet"

The server cannot read `localStorage`, so its snapshot necessarily says "no
session". A component that acts on that immediately would, for example, redirect
a signed-in user to `/connect` on every page load. `wallet/session.ts` exports a
sentinel for this:

```ts
export const UNREAD_SESSION: StoredSession = { address: '', walletId: null, network: null }

export function readSession(): StoredSession {
  /* always returns a FRESH object, even when there is no session */
}

// in WalletProvider
const restoring = stored === UNREAD_SESSION // identity, not a field
```

Because `readSession()` always allocates, `stored === UNREAD_SESSION` is true only
before storage has been consulted. `RequireWallet` holds its gate while
`restoring`, which is what keeps a refresh on a gated route from logging the user
out. Test this with `wallet/RequireWallet.hydration.test.tsx`, which renders the
real provider rather than a mocked context.

### Cross-tab updates

`subscribe()` also listens for the `storage` event so another tab's write
re-renders this one, and removes the listener on unsubscribe.
