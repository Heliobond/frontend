# API Reference — Heliobond Backend Client

This document is the developer reference for the HTTP client that connects the
frontend to the Heliobond backend REST API:

- [`src/lib/apiClient.ts`](src/lib/apiClient.ts) — the typed `/v1` client.
- [`src/lib/api.ts`](src/lib/api.ts) — app-facing functions with demo fallbacks.
- [`src/app/api/backend/[...path]/route.ts`](src/app/api/backend/[...path]/route.ts) —
  the server-side proxy that keeps the API key out of the browser.

Every function falls back to bundled fixture data when no backend is configured,
so the app works out of the box without a running backend.

---

## Table of Contents

1. [Environment configuration](#environment-configuration)
2. [Authentication](#authentication)
3. [Response types](#response-types)
4. [Endpoints](#endpoints)
   - [getProjects](#getprojects)
   - [getProjectsPaginated](#getprojectspaginated)
   - [getProject](#getproject)
   - [getPriceHistory](#getpricehistory)
   - [fetchBackendPortfolio](#fetchbackendportfolio)
   - [biometricLogin](#biometriclogin)
5. [Error handling](#error-handling)
6. [Demo / fixture fallback](#demo--fixture-fallback)
7. [Usage examples](#usage-examples)

---

## Environment configuration

| Variable                | Required | Example                 | Purpose                                                                                                 |
| ----------------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| `HELIOBOND_API_URL`     | No       | `http://localhost:3001` | Backend base URL, read **server-side only**. Falls back to `NEXT_PUBLIC_API_URL` when unset.            |
| `HELIOBOND_API_KEY`     | No       | `hb_live_…`             | API key sent as `X-API-Key`. **Server-side only** — never expose it through a `NEXT_PUBLIC_*` variable. |
| `NEXT_PUBLIC_API_URL`   | No       | `http://localhost:3001` | Public base URL, used for the auth endpoints and as a fallback for `HELIOBOND_API_URL`.                 |
| `NEXT_PUBLIC_DEMO_MODE` | No       | `true`                  | Force demo mode even when a backend is configured.                                                      |

Copy `.env.example` to `.env.local`, then set `HELIOBOND_API_URL` and
`HELIOBOND_API_KEY` to point at your local or staging backend before running
`bun run dev`.

---

## Authentication

Every `/v1` backend route requires an API key on the `X-API-Key` header. A
secret cannot live in a `NEXT_PUBLIC_*` variable — Next.js inlines those into
the client bundle, so anyone using the app could read the key and exhaust the
rate limit.

The browser therefore never talks to the backend directly. It calls the
same-origin route handler, which attaches the key on the server:

```
browser  ──▶  /api/backend/v1/projects   (Next.js route handler)
                     │  adds X-API-Key server-side
                     ▼
               HELIOBOND_API_URL/v1/projects   (backend)
```

Server components skip the proxy and call the backend directly, still with the
key attached server-side.

The proxy forwards a fixed allowlist of read-only endpoints and rejects anything
else without contacting the backend:

| Allowed upstream path      | Used by                 |
| -------------------------- | ----------------------- |
| `/v1/projects`             | `getProjects`, Explore  |
| `/v1/projects/:id`         | `getProject`            |
| `/v1/projects/:id/history` | `getPriceHistory`       |
| `/v1/portfolio/:address`   | `fetchBackendPortfolio` |
| `/v1/forecast/:id`         | forecasts               |

---

## Response types

All types are exported from `src/lib/api.ts` and can be imported directly.

### `Project`

Defined in `src/data.ts`. Core bond project record: id, name, yield, term,
rating, funded status, and pool-related fields.

### `ProjectDetail`

Defined in `src/data/projectDetails.ts`. Extended record with oracle score
history, funding timeline, price/yield history, and creator attribution.

### `ProjectWithDetail`

```ts
interface ProjectWithDetail {
  project: Project
  detail: ProjectDetail
}
```

Returned by [`getProject`](#getproject).

### `BackendProject`

```ts
interface BackendProject {
  id: number
  credit_quality: number // Credit Quality score, 0–100
  green_impact: number // Green Impact score, 0–100
  power_output_kw: number
  efficiency_pct: number
  forest_density_pct: number
  ndvi_score: number
  timestamp: number // Unix milliseconds
}
```

The shape the backend returns. [`mapBackendProject`](#mapping-backend-projects)
converts it into the app's `Project`, keeping names and funding copy from the
local project so a live backend only replaces the scores.

### `PaginatedProjectsResponse`

```ts
interface PaginatedProjectsResponse {
  projects: Project[]
  total: number // Total matching records (not just this page)
  page: number // 1-indexed current page
  pageSize: number // Items per page
  hasMore: boolean // Whether another page exists
}
```

Returned by [`getProjectsPaginated`](#getprojectspaginated).

### `PricePoint`

```ts
interface PricePoint {
  date: string // ISO 8601 date, e.g. "2025-03-14"
  price: number // Bond price in USDC
  yield?: number // Yield at that date (percentage)
}
```

Returned (as an array) by [`getPriceHistory`](#getpricehistory).

---

## Endpoints

### `getProjects`

```ts
async function getProjects(): Promise<Project[]>
```

Fetches all bond projects.

**Backend endpoint:** `GET /v1/projects?cursor=0&limit=100`

**Returns:** Array of `Project` objects.

**Throws:** `ApiError` on network failures, HTTP errors, or timeouts (after 8 seconds).

**Demo fallback:** Returns all projects from `src/data.ts` via
`selectProjects()`. **On-chain priority:** If a project registry contract is
configured, data is read from the Stellar blockchain first.

**Example:**

```ts
import { getProjects } from '@/lib/api'

const projects = await getProjects()
// [{ id: 1, name: 'Solaris Alpha', yield: 6.5, ... }, ...]
```

---

### `getProjectsPaginated`

```ts
async function getProjectsPaginated(
  page?: number, // default: 1
  pageSize?: number, // default: 12
): Promise<PaginatedProjectsResponse>
```

Fetches a paginated slice of bond projects. Use this for the Explore screen
initial load — it reduces time-to-interactive from 3–5 s down to sub-second
by deferring off-screen projects.

**Backend endpoint:** `GET /v1/projects?cursor={(page-1)*pageSize}&limit={pageSize}`

The backend paginates with a cursor, so the 1-indexed page number is translated
into an offset. `hasMore` is derived from whether the response carried a `cursor`
for the next page.

**Parameters:**

| Param      | Type     | Default | Description           |
| ---------- | -------- | ------- | --------------------- |
| `page`     | `number` | `1`     | 1-indexed page number |
| `pageSize` | `number` | `12`    | Items per page        |

**Returns:** `PaginatedProjectsResponse`

**Throws:** `ApiError` on network failures, HTTP errors, or timeouts (after 8 seconds).

**Demo fallback:** Slices `selectProjects()` with the same pagination math.
**On-chain priority:** If a project registry contract is configured, data is
read from the Stellar blockchain first.

**Example:**

```ts
import { getProjectsPaginated } from '@/lib/api'

// First page
const page1 = await getProjectsPaginated(1, 12)
// { projects: [...], total: 34, page: 1, pageSize: 12, hasMore: true }

// Next page
const page2 = await getProjectsPaginated(2, 12)
// { projects: [...], total: 34, page: 2, pageSize: 12, hasMore: true }
```

---

### `getProject`

```ts
async function getProject(id: number): Promise<ProjectWithDetail | null>
```

Fetches a single project with its full detail record.

**Backend endpoint:** `GET /v1/projects/:id`

**Parameters:**

| Param | Type     | Description                                                                                                                         |
| ----- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`  | `number` | Must be a positive integer (`id >= 1`). Non-integer, negative, zero, or `NaN` ids return `null` immediately without a network call. |

**Returns:** `ProjectWithDetail`, or `null` when the backend has no such project
(a `404` resolves to `null` rather than raising).

**Throws:** `ApiError` on network failures, HTTP errors, or timeouts (after 8 seconds).

**Demo fallback:** Looks up `selectProjectById(id)` and `selectProjectDetail(id)`
from fixture data. Returns `null` if either is missing. **On-chain priority:**
If a project registry contract is configured, project and detail data are read
from the Stellar blockchain first, with a `verifiedMetadata` flag indicating
on-chain verification.

**Example:**

```ts
import { getProject } from '@/lib/api'

const result = await getProject(1)
if (result) {
  const { project, detail } = result
  console.log(project.name, detail.scoreHistory.credit)
}

// Invalid ids return null immediately — no request fired:
await getProject(-1) // null
await getProject(NaN) // null
await getProject(1.5) // null
```

---

### Creating an investment

There is no client method for this, and that is deliberate. The backend never
implemented `POST /investments`, and a Stellar deposit transaction is the source
of truth for an investment — recording one server-side as well would create a
second, reconcilable copy that can disagree with the chain. Use the vault
helpers in [`src/wallet/vault.ts`](src/wallet/vault.ts) to submit the deposit.

---

### `mapBackendProjects`

```ts
function mapBackendProject(raw: BackendProject, fallback?: Project): Project
```

Converts a backend row into the app's `Project`. The backend reports scores and
telemetry; names, locations and funding copy stay from the local project, so
turning on a live backend replaces the scores without blanking out the screen.
`verifiedMetadata` is `false` for backend data, since it is not verified
on-chain.

---

### `getPriceHistory`

```ts
async function getPriceHistory(projectId: number): Promise<PricePoint[]>
```

Fetches a project's history as chart points.

**Backend endpoint:** `GET /v1/projects/:projectId/history`

The backend reports impact-score snapshots, not share prices, so
[`historyToPricePoints`](src/lib/apiClient.ts) derives both the price and the
yield from the green-impact score. This replaces the mocked
`/price-history` endpoint the backend never implemented. Combine it with
on-chain share-price snapshots when exact pricing is needed.

**Parameters:**

| Param       | Type     | Description |
| ----------- | -------- | ----------- |
| `projectId` | `number` | Project ID  |

**Returns:** Array of `PricePoint` objects sorted in ascending chronological
order (oldest first).

**Throws:** `ApiError` on network failures, HTTP errors, or timeouts (after 8 seconds).

**Demo fallback:** Generates a deterministic 30-day mock series using
`projectId` as a seed so the sparkline shape is consistent per project across
renders.

**Example:**

```ts
import { getPriceHistory } from '@/lib/api'

const history = await getPriceHistory(2)
// [
//   { date: '2025-08-06', price: 103.42, yield: 5.12 },
//   { date: '2025-08-07', price: 103.61, yield: 5.09 },
//   ...
// ]

// Feed directly into PriceHistoryChart:
<PriceHistoryChart data={history} />
```

---

### `fetchBackendPortfolio`

```ts
async function fetchBackendPortfolio(address: string): Promise<BackendPortfolio>
```

Fetches the on-chain vault position and indexed event history for an address.

**Backend endpoint:** `GET /v1/portfolio/{address}`

**Returns:** `BackendPortfolio` — shares, USDC value, claimable yield, share of
pool, total deposited, and the address's vault events.

The Soroban vault remains the source of truth for balances; this endpoint is the
backend's indexed view of the same data and is only used when a backend is
configured.

---

### `biometricLogin`

```ts
async function biometricLogin(username?: string): Promise<boolean>
```

Triggers a WebAuthn biometric prompt (Face ID / Touch ID) and delegates to the canonical challenge-response flow in `webauthn.ts`.

**Client contract:** Requests options from `/webauthn/login/begin`, presents them to `navigator.credentials.get`, and posts the assertion to `/webauthn/login/complete`. Completion must return HTTP success with `{ "verified": true }`; HTTP success alone is insufficient. Requests use same-origin cookies and disable caching.

**Backend dependency:** This repository does not implement these endpoints. A backend must issue expiring, single-use challenges, verify assertions against stored public keys and the expected origin/RP ID, and establish an authenticated session before returning verification success. The client boolean is UI feedback, not server authorization.

**Returns:** `true` if the biometric assertion was successfully verified by the server, `false` if:

- The username is missing or blank (there is no shared default identity)
- WebAuthn is not supported (`window.PublicKeyCredential` is absent)
- The user cancelled or failed the prompt
- Server challenge issuance or assertion verification failed (logged as a warning)

**Environment:** Only works in a browser context with a registered authenticator. Always returns `false` in SSR (`window === undefined`).

**Example:**

```ts
import { biometricLogin } from '@/lib/api'

const ok = await biometricLogin('user@example.com')
if (ok) {
  // proceed with authenticated session
} else {
  // show fallback (password, wallet sign-in, etc.)
}
```

---

## Error handling

### Data sources and fallback priority

The API client reads project data from three sources in the following priority order:

1. **On-chain registry** — If `isRegistryConfigured()` returns `true` (when a
   Stellar ProjectRegistry contract is deployed and configured), project data
   is read directly from the blockchain via Stellar RPC. This is the highest-
   trust path and bypasses HTTP entirely.
2. **Demo fixtures** — If no backend is configured (or
   `NEXT_PUBLIC_DEMO_MODE=true` is explicitly enabled), all functions return
   deterministic mock data from `src/data.ts` and `src/data/projectDetails.ts`.
   No HTTP requests are made. A "Demo data" badge appears in the UI when
   `shouldShowDemoBadge()` returns `true`.
3. **HTTP backend** — If `HELIOBOND_API_URL` is set and demo mode is off,
   the client calls the configured backend. **Failures throw `ApiError`** —
   they are not silently swallowed.

### ApiError

Network failures, HTTP errors (non-2xx status), and timeouts all throw `ApiError`:

```ts
import { ApiError } from '@/lib/api'

try {
  const projects = await getProjects()
} catch (err) {
  if (err instanceof ApiError) {
    console.error('API failed:', err.status, err.code, err.message)
    // err.status: HTTP status (404, 503, etc.) if applicable
    // err.code: Machine-readable code (e.g., "HTTP_503", "rpc-timeout")
    // err.message: Human-readable message
  }
}
```

`ApiError` is defined in `src/lib/error.ts` and includes optional `status`,
`code`, and `cause` fields for debugging and error reporting.

### Timeout behavior

All HTTP calls are wrapped in an 8-second timeout (`API_TIMEOUT_MS`). If a
request does not complete within 8 seconds, it is aborted and an error is
reported to telemetry with `{ kind: 'rpc-timeout', context: { target: 'api' } }`.
The timeout error is then thrown to the caller.

```ts
// After 8 seconds, throws:
// Error: "timed out after 8000ms"
const projects = await getProjects()
```

### NEXT_PUBLIC_DEMO_MODE

To force demo mode even when a backend is configured (useful for testing
or staging previews without a live backend), set:

```bash
NEXT_PUBLIC_DEMO_MODE=true
```

When enabled, `shouldShowDemoBadge()` returns `true` and a visual indicator
appears in the UI so users know the data is not real.

### Usage example with error handling

```ts
import { getProjects, ApiError } from '@/lib/api'

async function loadExploreScreen() {
  try {
    const projects = await getProjects()
    // success — render projects
  } catch (err) {
    if (err instanceof ApiError) {
      // show user-facing error: "Could not load projects. Please try again."
      // log to error reporting: err.status, err.code, err.message
    } else {
      // unexpected error — rethrow or log
      throw err
    }
  }
}
```

For mapping backend error codes to user-facing strings, see
[`src/lib/errorMessages.ts`](src/lib/errorMessages.ts) and
[`ERROR_CODES.md`](ERROR_CODES.md).

---

## Demo / fixture fallback

When `HELIOBOND_API_URL` is **not set** (or is empty), the app runs in **demo
mode**. In this mode:

- **No HTTP requests are made** — every API function returns deterministic
  fixture data immediately.
- Fixture data comes from:
  - `src/data.ts` — pool summary, projects list, investor position, activity feed
  - `src/data/projectDetails.ts` — per-project oracle history, creator info,
    funding timeline, price history
  - `src/state/selectors.ts` — flat accessor functions over the above
- `shouldShowDemoBadge()` returns `true`, and the UI displays a "Demo data"
  badge so users know the data is not live.

This means the full click-through works without a backend, including the Explore,
Project Detail, and Deposit screens.

### Demo mode vs. HTTP failures

**When a backend is configured**, demo mode is **off**. HTTP failures
(timeouts, 5xx errors, network errors) **throw `ApiError`** and do not fall
back to fixtures. The caller must handle the error and show appropriate UI
(loading state, retry button, error message).

To force demo mode even when a backend is configured, use:

```bash
NEXT_PUBLIC_DEMO_MODE=true
```

This is useful for testing, staging previews, or demos where you want to use
the production-like URL structure but don't have a live backend.

---

## Usage examples

### Loading the Explore screen lazily

```ts
import { getProjectsPaginated } from '@/lib/api'

// Initial load — first 12 projects only
const { projects, hasMore, total } = await getProjectsPaginated(1, 12)

// Infinite scroll — fetch the next page when the sentinel enters the viewport
if (hasMore) {
  const next = await getProjectsPaginated(2, 12)
}
```

### Project detail page

```ts
// src/app/project/[id]/page.tsx
import { getProject } from '@/lib/api'

export default async function Page({ params }: { params: { id: string } }) {
  const id = Number(params.id)
  const data = await getProject(id)
  if (!data) notFound()
  return <ProjectDetail project={data.project} detail={data.detail} />
}
```

### Creating an investment

Investments happen on-chain. Build and sign the deposit transaction with the
vault helpers; the backend has no investment endpoint to call.

```ts
import { buildDepositTransaction, submitTransaction } from '@/wallet/vault'

async function handleDeposit(amount: number) {
  try {
    const xdr = await buildDepositTransaction({ address, amount })
    const signed = await sign(xdr)
    const { hash } = await submitTransaction(signed)
    router.push(`/portfolio?tx=${hash}`)
  } catch (err) {
    if (err instanceof ApiError) {
      setFormError('Network error. Please check your connection and try again.')
      console.error('Deposit failed:', err.status, err.message)
    } else {
      throw err
    }
  }
}
```

### Price history sparkline

```ts
import { getPriceHistory } from '@/lib/api'
import { PriceHistoryChart } from '@/components'

const history = await getPriceHistory(projectId)
return <PriceHistoryChart data={history} />
```
