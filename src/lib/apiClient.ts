/**
 * Typed client for the Heliobond API (`Heliobond/backend`).
 *
 * The backend serves everything under `/v1` and requires an API key on the
 * `X-API-Key` header. That key is a server-side secret and must never reach the
 * browser bundle, so the browser calls the same-origin `/api/backend` route
 * handler instead (`src/app/api/backend/[...path]/route.ts`), which attaches the
 * key server-side. Server components call the backend directly.
 *
 * See `API_REFERENCE.md` for the endpoints and the auth model.
 */

import { ApiError } from './error'
import { reportError } from './errorReporting'

export const API_VERSION = '/v1'

/** Path the browser uses to reach the proxy. Same-origin, so no CORS. */
export const PROXY_BASE = '/api/backend'

/** Backend origin, read only on the server. */
const SERVER_BASE_URL = process.env.HELIOBOND_API_URL ?? process.env.NEXT_PUBLIC_API_URL

/** Requests slower than this are aborted (#608). */
export const API_TIMEOUT_MS = 8000

/**
 * True when the browser should go through the proxy. Without a configured
 * backend the app falls back to bundled demo data.
 */
export function isBackendConfigured(): boolean {
  return Boolean(SERVER_BASE_URL) || Boolean(process.env.HELIOBOND_API_KEY)
}

/**
 * Absolute URL for a `/v1/...` path, or null when the browser has to use the
 * proxy (no absolute origin is available there).
 */
function backendOrigin(): string | null {
  if (!SERVER_BASE_URL) return null
  return SERVER_BASE_URL.replace(/\/+$/, '')
}

/** Builds the URL a caller should hit for a versioned path. */
export function buildApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const versioned = `${API_VERSION}${normalized}`
  const origin = backendOrigin()
  if (typeof window === 'undefined' && origin) return `${origin}${versioned}`
  return `${PROXY_BASE}${versioned}`
}

/**
 * Attaches the API key, server-side only.
 *
 * In the browser the request goes to the same-origin proxy, which adds the key
 * itself — reading it here would put the secret in the client bundle (#588).
 */
function authHeaders(): Record<string, string> {
  if (typeof window !== 'undefined') return {}
  const key = process.env.HELIOBOND_API_KEY
  return key ? { 'X-API-Key': key } : {}
}

/**
 * Normalise a `HeadersInit` value into a plain `Record<string, string>`.
 *
 * `RequestInit.headers` is typed as `HeadersInit`, which is one of:
 *   - `Headers` instance — spread (`{ ...headersInstance }`) produces `{}` because
 *     `Headers` has no enumerable own properties.
 *   - `[string, string][]` — spread produces `{ 0: ['k','v'], 1: … }` (numeric indices),
 *     not the key/value pairs the caller intended.
 *   - `Record<string, string>` — spread works correctly.
 *
 * The `Headers` constructor accepts all three forms, so round-tripping through it
 * normalises every variant into an iterable that `Object.fromEntries` can consume.
 * Header names are lowercased by the `Headers` API, which also makes caller
 * overrides for `accept` / `Accept` / `ACCEPT` all shadow the same default key.
 */
function normalizeHeaders(init?: HeadersInit): Record<string, string> {
  if (!init) return {}
  return Object.fromEntries(new Headers(init).entries())
}

/**
 * Performs a `GET` against a versioned endpoint and parses the JSON body.
 *
 * Rejects with an `ApiError` on a non-2xx status, a timeout, a network error or
 * a malformed body, so callers can tell a backend problem from an empty result.
 */
export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const isServer = typeof window === 'undefined'
    // Merge headers in priority order: defaults < auth < caller overrides.
    // normalizeHeaders converts any HeadersInit form (Headers instance,
    // [string,string][], or plain object) into a plain record so the spread
    // works correctly for all three.
    const mergedHeaders: Record<string, string> = {
      accept: 'application/json',
      ...normalizeHeaders(authHeaders()),
      ...normalizeHeaders(init?.headers),
    }
    const response = await fetch(buildApiUrl(path), {
      ...init,
      headers: mergedHeaders,
      signal: controller.signal,
      ...(isServer ? { next: { revalidate: 60 } } : {}),
    })
    if (!response.ok) {
      // Carry the status on the error so callers can branch on it (404 → null)
      // without re-parsing the message.
      throw new ApiError({
        status: response.status,
        code: `HTTP_${response.status}`,
        message: `HTTP ${response.status}`,
      })
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (controller.signal.aborted) {
      const timeout = new ApiError({
        code: 'rpc_timeout',
        message: `timed out after ${API_TIMEOUT_MS}ms`,
      })
      reportError(timeout, { kind: 'rpc-timeout', context: { target: 'api' } })
      throw timeout
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/* ------------------------------------------------------------------ *
 * Response shapes, mirroring `Heliobond/backend/src/routes/*`.
 * ------------------------------------------------------------------ */

/** Raw project row as returned by `GET /v1/projects`. */
export interface BackendProject {
  id: number
  credit_quality: number
  green_impact: number
  power_output_kw: number
  efficiency_pct: number
  forest_density_pct: number
  ndvi_score: number
  timestamp: number
}

export interface BackendProjectList {
  projects: BackendProject[]
  total: number
  filtered_total: number
  /** Present only when another page follows; the backend is cursor-paginated. */
  cursor?: number
}

/** One scored snapshot from `GET /v1/projects/:id/history`. */
export interface BackendHistoryEntry {
  timestamp: number
  credit_quality: number
  green_impact: number
  [key: string]: unknown
}

export interface BackendHistory {
  project_id: number
  count: number
  entries: BackendHistoryEntry[]
}

/** `GET /v1/portfolio/:address`. */
export interface BackendPortfolio {
  address: string
  shares: string
  shares_display: string
  usdc_value: string
  usdc_value_display: string
  claimable_yield: string
  claimable_yield_display: string
  share_of_pool_bps: number
  total_deposited: string
  total_deposited_display: string
  events: Array<{
    id: string
    type: string
    amount: number
    shares: number
    timestamp: number
    txHash: string
  }>
}

/**
 * Lists projects. The backend is cursor-paginated, so `offset` is translated
 * into the `cursor` query parameter the API expects.
 */
export async function fetchBackendProjects(offset = 0, limit = 50): Promise<BackendProjectList> {
  const query = new URLSearchParams({ cursor: String(offset), limit: String(limit) })
  return apiGet<BackendProjectList>(`/projects?${query.toString()}`)
}

/** A single project, or null when the backend has no such id. */
export async function fetchBackendProject(id: number): Promise<BackendProject | null> {
  try {
    return await apiGet<BackendProject>(`/projects/${id}`)
  } catch (error) {
    // A missing project is a normal outcome, not a failure.
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Impact-score history for a project, oldest first. */
export async function fetchBackendHistory(
  id: number,
  range?: { from?: number; to?: number },
): Promise<BackendHistory> {
  const query = new URLSearchParams()
  if (range?.from !== undefined) query.set('from', String(range.from))
  if (range?.to !== undefined) query.set('to', String(range.to))
  const suffix = query.size > 0 ? `?${query.toString()}` : ''
  const history = await apiGet<BackendHistory>(`/projects/${id}/history${suffix}`)
  return { ...history, entries: [...history.entries].sort((a, b) => a.timestamp - b.timestamp) }
}

/** On-chain vault position for an address. */
export async function fetchBackendPortfolio(address: string): Promise<BackendPortfolio> {
  return apiGet<BackendPortfolio>(`/portfolio/${encodeURIComponent(address)}`)
}

/** One dated impact-score observation from `GET /v1/projects/:id/history`. */
export interface ScoreObservation {
  /** ISO calendar date (YYYY-MM-DD) of the observation. */
  date: string
  /** Credit Quality score reported by the oracle (0–100). */
  credit: number
  /** Green Impact score reported by the oracle (0–100). */
  green: number
}

/**
 * Impact-score history rendered as chart points.
 *
 * The score endpoint reports dated credit-quality and green-impact snapshots,
 * not share prices or yield observations. No price or yield is synthesised:
 * those fields are reserved for data that actually measures them.
 *
 * Output is sorted oldest first so a chart never draws a time line backwards,
 * regardless of the order the caller supplies.
 */
export function historyToScorePoints(entries: BackendHistoryEntry[]): ScoreObservation[] {
  return [...entries]
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((entry) => ({
      date: new Date(entry.timestamp).toISOString().split('T')[0],
      credit: Number(entry.credit_quality),
      green: Number(entry.green_impact),
    }))
}

/**
 * @deprecated The history endpoint returns scores, not prices. This alias only
 * exists for older callers; it returns score observations with no price/yield.
 * Use `historyToScorePoints` instead.
 */
export const historyToPricePoints = historyToScorePoints
