# Heliobond Frontend Architecture & Contract Integration Map

This document defines the architecture of the Heliobond investor application and maps each user surface to its corresponding Stellar / Soroban smart contract dependencies, data models, and client functions.

> **Implementation Note & Scope:**
> Heliobond is architected to operate in two modes:
>
> 1. **Live On-Chain Mode (Soroban Testnet):** When `NEXT_PUBLIC_VAULT_CONTRACT_ID` and wallet connections are active, core vault accounting (`share_price`, `total_assets`) and transactional flows (`deposit`, `withdraw`) execute directly against deployed Soroban smart contracts.
> 2. **Simulated / Fixture Mode:** When contract IDs are unset or in demo wallet mode, the application falls back gracefully to deterministic typed fixtures (`src/data.ts`, `src/data/*`) and synchronous client simulations (`src/wallet/vault.ts`).
>
> Several contract surfaces (notably `ProjectRegistry`, `WhitelistController`, and oracle administrative mutations) represent **future/planned on-chain counterparts** and are currently backed by local fixtures or internal in-memory state. They must not be presented as fully deployed on-chain contracts.

---

## 1. Core Vault Contract Mappings

The investment pool is governed by Soroban smart contract logic mirroring ERC-4626 tokenized vault standards on Stellar (denominated in USDC with HBS pool share tokens). The frontend client layer is implemented in [`src/wallet/vault.ts`](src/wallet/vault.ts) and consumed by [`src/wallet/useVault.ts`](src/wallet/useVault.ts).

| Contract Method / Concept | Client Function / Binding                                        | Type              | Description                                                                                                                                                   |
| :------------------------ | :--------------------------------------------------------------- | :---------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `share_price`             | `fetchSharePrice(sourceAddress)`                                 | View Read         | Reads total assets / total supply ratio via Soroban RPC simulation. Fallback: `vault.sharePrice()`.                                                           |
| `total_assets`            | `fetchTotalAssets(sourceAddress)`                                | View Read         | Reads total USDC controlled by the vault via Soroban RPC simulation. Fallback: `HB_DATA.pool.totalAssets`.                                                    |
| `convert_to_shares`       | `vault.convertToShares(usdc)`<br>`vault.previewDeposit(usdc)`    | Client Math / Sim | Converts USDC amount to equivalent HBS shares based on current `share_price` for immediate input preview.                                                     |
| `convert_to_assets`       | `vault.convertToAssets(shares)`<br>`vault.previewWithdraw(usdc)` | Client Math / Sim | Converts HBS shares to equivalent USDC asset value based on `share_price`.                                                                                    |
| `deposit`                 | `submitDeposit(amount, address, sign, signal)`                   | Signed Tx         | Builds transaction invoking contract `deposit(amount, min_shares)`, simulates via RPC, requests wallet signature, submits to network, and polls confirmation. |
| `withdraw`                | `submitWithdraw(amount, address, sign, signal)`                  | Signed Tx         | Builds transaction invoking contract `withdraw(shares, min_assets)`, simulates, requests wallet signature, submits, and polls confirmation.                   |

---

## 2. Surface-by-Surface Contract Integration Map

### 2.1 Landing

- **Route:** `/` (`src/screens/Landing.tsx`)
- **Current Data Source:** Mock / fixture data (`HB_DATA.pool` in `src/data.ts`).
- **Expected Soroban Read Dependency:**
  - `InvestmentVault.total_assets`: Total pool value ($ TVL).
  - `InvestmentVault.share_price`: Price per HBS share (for return rate projections).
  - `ProjectRegistry.get_projects` / `get_project_count`: Number of active funded projects (determines particle/mote density on the WebGL `LiveHelio` orb).
- **Expected Soroban Write Dependency:** None (public informational surface).
- **Relevant Vault / Client Function:** `fetchTotalAssets`, `useVault()`, `LiveHelio`.

### 2.2 Connect

- **Route:** `/connect` (`src/screens/Connect.tsx`)
- **Current Data Source:** Live wallet integration via `@creit.tech/stellar-wallets-kit` (`src/wallet/WalletProvider.tsx`) with fallback demo session (`connectDemo`).
- **Expected Soroban Read Dependency:**
  - Stellar Horizon / RPC account check: Validates account existence, sequence number, native XLM balance (for transaction fees), and SAC USDC trustline / balance.
- **Expected Soroban Write Dependency:** None during initial connection (wallet session handshake).
- **Relevant Vault / Client Function:** `useWallet().connect()`, `useWallet().connectDemo()`, `useWallet().sign()`.

### 2.3 Explore

- **Route:** `/explore` (`src/screens/Explore.tsx`)
- **Current Data Source:** Mock / fixture data (`HB_DATA.projects`) with optional REST API fallback (`src/lib/api.ts` `getProjects()`).
- **Expected Soroban Read Dependency:**
  - `ProjectRegistry.list_projects()`: Listing of all registered green energy projects, project metadata (location, type, funding goal, capital deployed).
  - `Oracle / ProjectRegistry`: Current oracle-verified `credit` (Credit Quality, 0–100) and `green` (Green Impact, 0–100) scores.
- **Expected Soroban Write Dependency:** None (filtering and browsing).
- **Relevant Vault / Client Function:** `getProjects()` (currently REST/fixture client; future on-chain registry reader).

### 2.4 Project Detail

- **Route:** `/project/[id]` (`src/screens/ProjectDetail.tsx`)
- **Current Data Source:** Fixture data (`PROJECT_DETAILS` in `src/data/projectDetails.ts`, `HB_DATA.projects`) or API client (`src/lib/api.ts` `getProject(id)`).
- **Expected Soroban Read Dependency:**
  - `ProjectRegistry.get_project(id)`: Detailed project profile, verified creator attribution, stated funding goal, and pool capital allocated.
  - `ProjectRegistry.get_score_history(id)` / `Oracle` events: Historical credit & green score data points and associated Stellar transaction hashes.
  - `InvestmentVault` milestone events: Drawdown history and capital releases from the pool to the project.
- **Expected Soroban Write Dependency:** None directly on page view (primary CTA navigates to `/deposit`).
- **Relevant Vault / Client Function:** `getProject(id)` (future Soroban project & oracle history query).

### 2.5 Deposit

- **Route:** `/deposit` (`src/screens/Deposit.tsx`)
- **Current Data Source:** Active Soroban contract integration when `NEXT_PUBLIC_VAULT_CONTRACT_ID` is set; synchronous simulation in demo mode or without env configuration.
- **Expected Soroban Read Dependency:**
  - `InvestmentVault.share_price`: Live share price to calculate expected HBS output.
  - `InvestmentVault.total_assets`: Vault TVL for pool-level metrics.
  - `InvestmentVault.convert_to_shares`: Real-time conversion preview calculation.
- **Expected Soroban Write Dependency:**
  - `InvestmentVault.deposit(amount, min_shares)`: Transfers USDC from investor account into the vault, mints corresponding HBS shares to the investor.
- **Relevant Vault / Client Function:**
  - Read / Preview: `fetchSharePrice`, `fetchTotalAssets`, `vault.convertToShares`, `vault.previewDeposit`, `useVault()`.
  - Transaction: `submitDeposit(amount, address, sign, signal)`.

### 2.6 Portfolio

- **Route:** `/portfolio` (`src/screens/Portfolio.tsx`)
- **Current Data Source:** Mock / fixture data (`HB_DATA.you`, `HB_DATA.activity`, `HB_DATA.pool` in `src/data.ts`) when connected.
- **Expected Soroban Read Dependency:**
  - `InvestmentVault.balance(user_address)`: User HBS share token balance.
  - `InvestmentVault.convert_to_assets(shares)`: Current USDC valuation of user holdings.
  - `InvestmentVault.total_assets` & `share_price`: Calculation of user's percentage share of the pool.
  - `InvestmentVault.get_liquid_assets()`: Pool-wide liquid reserves vs. deployed assets (displayed via `LiquidityMeter`).
  - Indexer / Horizon Event stream: User deposit/withdrawal history and oracle score updates.
- **Expected Soroban Write Dependency:** None on portfolio view (action buttons route to `/deposit` and `/withdraw`).
- **Relevant Vault / Client Function:** `vault.convertToAssets`, `useVault()`, future user account position reader.

### 2.7 Withdraw

- **Route:** `/withdraw` (`src/screens/Withdraw.tsx`)
- **Current Data Source:** Active Soroban contract integration when `NEXT_PUBLIC_VAULT_CONTRACT_ID` is set; simulated 2-second delay in demo mode. Liquid cap is currently fixture-backed (`liquid = 236`).
- **Expected Soroban Read Dependency:**
  - `InvestmentVault.share_price`: Live exchange rate for asset conversion.
  - `InvestmentVault.convert_to_assets`: Share redemption preview.
  - `InvestmentVault.max_withdraw` / available liquid reserve: Enforces the immediate withdrawal ceiling to respect pool liquidity constraints.
- **Expected Soroban Write Dependency:**
  - `InvestmentVault.withdraw(shares, min_assets)`: Burns HBS shares from the caller and transfers equivalent USDC assets to the caller's wallet.
- **Relevant Vault / Client Function:**
  - Read / Preview: `vault.convertToAssets`, `vault.previewWithdraw`.
  - Transaction: `submitWithdraw(amount, address, sign, signal)`.

### 2.8 Creator

- **Route:** `/creator` (`src/screens/creator/*`)
- **Current Data Source:** Mock / fixture data (`CREATOR_APPLICATION`, `DRAFT_PROJECT`, `CREATOR_DASHBOARD` in `src/data/creator.ts`). Form submission updates local state.
- **Expected Soroban Read Dependency:**
  - `WhitelistController.get_status(creator_address)`: Creator whitelist stage (`submitted`, `in_review`, `approved`).
  - `ProjectRegistry.get_creator_projects(creator_address)`: Existing projects owned by the creator.
  - `Oracle / ProjectRegistry`: Creator project oracle scores (`creditScore`, `greenScore`), score history sparklines, evaluation factors, and recent verified updates.
  - `InvestmentVault`: Funding deployed to the creator's project vs. stated funding goal.
- **Expected Soroban Write Dependency (Future Counterparts):**
  - `WhitelistController.apply_whitelist(org_name, project_type, location, links)`: Submit creator onboarding application.
  - `ProjectRegistry.create_project(name, location, project_type, story_uri, funding_goal)`: Register a new project draft.
- **Relevant Vault / Client Function:** Future `CreatorClient` / `WhitelistClient` (currently typed fixture models in `src/data/creator.ts`).

### 2.9 Admin / Oracle

- **Route:** `/admin` (`src/screens/admin/*`)
- **Current Data Source:** Internal console using fixture data (`VAULT_STATS`, `REGISTRY`, `WHITELIST` in `src/data/admin.ts`) with interactive in-memory state mutations.
- **Expected Soroban Read Dependency:**
  - `InvestmentVault`: Privileged accounting views (`total_assets`, `share_price`, `hbs_supply`, `liquid`, `deployed`, `projects_funded`).
  - `ProjectRegistry.list_all_projects()`: Complete project registry with last-verified timestamps.
  - `WhitelistController.list_creators()`: Registered creators and approval statuses.
- **Expected Soroban Write Dependency (Future Counterparts):**
  - `Oracle.push_scores(project_id, credit, green)`: Oracle score updates written to the registry.
  - `InvestmentVault.fund_project(project_id, amount)`: Privileged contract call deploying idle liquid vault USDC to a project.
  - `WhitelistController.set_creator_status(address, status)`: Approving or revoking creator whitelist permissions.
- **Relevant Vault / Client Function:** Future privileged `AdminClient` / `OracleClient` (currently simulated via local state in `src/screens/admin/AdminConsole.tsx`).

---

## 3. Summary Architecture Matrix

| Surface            | Route           | Current Data Source          | Soroban Read Dependency                             | Soroban Write Dependency                                   | Vault / Client Function                                      |
| :----------------- | :-------------- | :--------------------------- | :-------------------------------------------------- | :--------------------------------------------------------- | :----------------------------------------------------------- |
| **Landing**        | `/`             | Fixtures (`HB_DATA.pool`)    | `total_assets`, `share_price`, `get_projects`       | None                                                       | `fetchTotalAssets`, `useVault`                               |
| **Connect**        | `/connect`      | Stellar Wallets Kit + Demo   | Horizon / RPC Account Check                         | None                                                       | `WalletProvider` (`connect`, `sign`)                         |
| **Explore**        | `/explore`      | Fixtures / REST API          | `list_projects`, oracle scores                      | None                                                       | `getProjects()`                                              |
| **Project Detail** | `/project/[id]` | Fixtures / REST API          | `get_project`, `get_score_history`, milestone draws | None                                                       | `getProject(id)`                                             |
| **Deposit**        | `/deposit`      | Live Soroban / Mock fallback | `share_price`, `total_assets`, `convert_to_shares`  | `deposit(amount, min_shares)`                              | `fetchSharePrice`, `submitDeposit`, `previewDeposit`         |
| **Portfolio**      | `/portfolio`    | Fixtures (`HB_DATA.you`)     | `balance`, `convert_to_assets`, `get_liquid_assets` | None                                                       | `vault.convertToAssets`, `useVault`                          |
| **Withdraw**       | `/withdraw`     | Live Soroban / Mock fallback | `share_price`, `convert_to_assets`, `max_withdraw`  | `withdraw(shares, min_assets)`                             | `vault.convertToAssets`, `submitWithdraw`, `previewWithdraw` |
| **Creator**        | `/creator`      | Fixtures (`data/creator.ts`) | `get_status`, `get_creator_projects`, oracle scores | _Future:_ `apply_whitelist`, `create_project`              | Future `CreatorClient`                                       |
| **Admin / Oracle** | `/admin`        | Fixtures + In-Memory State   | Vault stats, registry entries, creator whitelist    | _Future:_ `push_scores`, `fund_project`, whitelist updates | Future `OracleClient` / `AdminClient`                        |

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
