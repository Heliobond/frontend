# API Reference — Heliobond Backend Client

This document is the developer reference for [`src/lib/api.ts`](src/lib/api.ts),
the HTTP client that connects the frontend to the Heliobond backend REST API.

Every function falls back to bundled fixture data when `NEXT_PUBLIC_API_URL` is
not set, so the app works out of the box without a running backend.

---

## Table of Contents

1. [Environment configuration](#environment-configuration)
2. [Response types](#response-types)
3. [Endpoints](#endpoints)
   - [getProjects](#getprojects)
   - [getProjectsPaginated](#getprojectspaginated)
   - [getProject](#getproject)
   - [createInvestment](#createinvestment)
   - [getPriceHistory](#getpricehistory)
   - [biometricLogin](#biometriclogin)
4. [Error handling](#error-handling)
5. [Demo / fixture fallback](#demo--fixture-fallback)
6. [Usage examples](#usage-examples)

---

## Environment configuration

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | `http://localhost:3001` | Backend base URL. When absent every call uses local fixture data and no HTTP request is made. |

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL` to point at
your local or staging backend before running `bun run dev`.

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

### `Investment`

```ts
interface Investment {
  id: number          // Server-assigned investment ID
  projectId: number   // The project invested in
  amount: number      // USDC amount
  projectUrl: string  // Canonical URL, e.g. "/projects/42"
}
```

Returned by [`createInvestment`](#createinvestment).

### `PaginatedProjectsResponse`

```ts
interface PaginatedProjectsResponse {
  projects: Project[]
  total: number     // Total matching records (not just this page)
  page: number      // 1-indexed current page
  pageSize: number  // Items per page
  hasMore: boolean  // Whether another page exists
}
```

Returned by [`getProjectsPaginated`](#getprojectspaginated).

### `PricePoint`

```ts
interface PricePoint {
  date: string   // ISO 8601 date, e.g. "2025-03-14"
  price: number  // Bond price in USDC
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

**Backend endpoint:** `GET /projects`

**Returns:** Array of `Project` objects. Empty array on network error (falls back
to fixture data instead, see [fallback behavior](#demo--fixture-fallback)).

**Demo fallback:** Returns all projects from `src/data.ts` via
`selectProjects()`.

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
  page?: number,     // default: 1
  pageSize?: number, // default: 12
): Promise<PaginatedProjectsResponse>
```

Fetches a paginated slice of bond projects. Use this for the Explore screen
initial load — it reduces time-to-interactive from 3–5 s down to sub-second
by deferring off-screen projects.

**Backend endpoint:** `GET /projects?page={page}&limit={pageSize}`

**Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | `number` | `1` | 1-indexed page number |
| `pageSize` | `number` | `12` | Items per page |

**Returns:** `PaginatedProjectsResponse`

**Demo fallback:** Slices `selectProjects()` with the same pagination math.
Handles both paginated API responses (`{ projects, total, page, ... }`) and
legacy flat-array responses from older backend versions.

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

**Backend endpoint:** `GET /projects/:id`

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `id` | `number` | Must be a positive integer (`id >= 1`). Non-integer, negative, zero, or `NaN` ids return `null` immediately without a network call. |

**Returns:** `ProjectWithDetail` or `null` when the project is not found.

**Demo fallback:** Looks up `selectProjectById(id)` and `selectProjectDetail(id)`
from fixture data. Returns `null` if either is missing.

**Example:**

```ts
import { getProject } from '@/lib/api'

const result = await getProject(1)
if (result) {
  const { project, detail } = result
  console.log(project.name, detail.scoreHistory.credit)
}

// Invalid ids return null immediately — no request fired:
await getProject(-1)  // null
await getProject(NaN) // null
await getProject(1.5) // null
```

---

### `createInvestment`

```ts
async function createInvestment(input: {
  projectId: number
  amount: number
}): Promise<Investment>
```

Creates a new investment record on the backend.

**Backend endpoint:** `POST /investments`

**Request body:**

```json
{
  "projectId": 1,
  "amount": 100
}
```

**Parameters:**

| Field | Type | Constraints |
|---|---|---|
| `projectId` | `number` | Must be a positive integer (`>= 1`). Throws on invalid input. |
| `amount` | `number` | Must be a positive finite number (`> 0`). Throws on invalid input. |

**Returns:** `Investment`

**Throws:** `Error('Invalid investment input')` for any of:
- Non-integer `projectId`
- `projectId < 1`
- Non-finite `amount`
- `amount <= 0`

Input is validated _before_ any network call, so invalid inputs never reach
the backend.

**Demo fallback:** Returns a mock `Investment` with a random `id`, preserving
`projectId` and `amount`. The `projectUrl` field is always `/projects/:id`.

**Example:**

```ts
import { createInvestment } from '@/lib/api'

// Valid investment
const investment = await createInvestment({ projectId: 3, amount: 250 })
// { id: 84712, projectId: 3, amount: 250, projectUrl: '/projects/3' }

// Invalid — throws before any HTTP call
await createInvestment({ projectId: 0, amount: 100 })  // throws
await createInvestment({ projectId: 1, amount: -50 })  // throws
await createInvestment({ projectId: 1.5, amount: 100 }) // throws
```

---

### `getPriceHistory`

```ts
async function getPriceHistory(projectId: number): Promise<PricePoint[]>
```

Fetches 30-day bond price and yield history for a project.

**Backend endpoint:** `GET /projects/:projectId/price-history`

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `projectId` | `number` | Project ID |

**Returns:** Array of `PricePoint` objects sorted in ascending chronological
order (oldest first). The backend response is re-sorted if necessary.

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

### `biometricLogin`

```ts
async function biometricLogin(): Promise<boolean>
```

Triggers a WebAuthn biometric prompt (Face ID / Touch ID) and returns whether
the user authenticated successfully.

**No backend endpoint** — this is a pure client-side WebAuthn call. The
challenge is generated locally (random 32-byte array). In production, replace
the local challenge with a server-issued one before verifying the assertion.

**Returns:** `true` if the biometric credential was successfully retrieved,
`false` if:
- WebAuthn is not supported (`window.PublicKeyCredential` is absent)
- The user cancelled
- An error occurred (logged as a warning)

**Environment:** Only works in a browser context with a registered
authenticator. Always returns `false` in SSR (`window === undefined`).

**Example:**

```ts
import { biometricLogin } from '@/lib/api'

const ok = await biometricLogin()
if (ok) {
  // proceed with authenticated session
} else {
  // show fallback (password, wallet sign-in, etc.)
}
```

---

## Error handling

All network functions follow the same pattern:

1. **Optimistic attempt** — call the backend, parse the response.
2. **On failure** — log a `console.warn` with the endpoint name and fall back to
   local fixture data without surfacing an error to the user.
3. **Never throw** for network errors — only `createInvestment` throws, and only
   for _invalid input_, never for network failures.

The one input-validation exception is `createInvestment`, which throws
`Error('Invalid investment input')` synchronously for bad `projectId` or
`amount`. Callers should catch this and show a validation message.

For mapping backend error codes to user-facing strings, see
[`src/lib/errorMessages.ts`](src/lib/errorMessages.ts) and
[`ERROR_CODES.md`](ERROR_CODES.md).

---

## Demo / fixture fallback

When `NEXT_PUBLIC_API_URL` is not set (or is empty), **no HTTP requests are
made**. Every function returns deterministic fixture data from:

- `src/data.ts` — pool summary, projects list, investor position, activity feed
- `src/data/projectDetails.ts` — per-project oracle history, creator info,
  funding timeline, price history
- `src/state/selectors.ts` — flat accessor functions over the above

This means the full click-through works without a backend, including the Explore,
Project Detail, and Deposit screens.

When `NEXT_PUBLIC_API_URL` _is_ set and a request fails, the same fixture
fallback kicks in silently. The app never shows a blank screen due to a missing
or slow backend.

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

```ts
import { createInvestment } from '@/lib/api'

async function handleDeposit(projectId: number, amount: number) {
  try {
    const investment = await createInvestment({ projectId, amount })
    router.push(investment.projectUrl)
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid investment input') {
      setFormError('Please enter a valid amount.')
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
