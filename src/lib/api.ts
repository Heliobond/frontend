// Heliobond — project data API client with lazy-loading and pagination support.
//
// Requests go to the versioned `/v1` backend. The browser reaches it through the
// same-origin `/api/backend` proxy, which attaches the API key server-side, so no
// secret ships in the bundle (#588). With no backend configured the app falls
// back to bundled demo data and shows a "Demo data" badge.

import { type Project } from '../data'
import { type ProjectDetail } from '../data/projectDetails'
import { selectProjectById, selectProjectDetail, selectProjects } from '../state/selectors'
import {
  isRegistryConfigured,
  fetchProjectsPage,
  fetchProjectWithDetails,
  type MetadataVerificationStatus,
} from '../wallet/registry'
import { ApiError } from './error'
import { loginBiometric } from './webauthn'
export { ApiError } from './error'
export type { MetadataVerificationStatus } from '../wallet/registry'
import {
  API_TIMEOUT_MS,
  apiGet,
  fetchBackendHistory,
  fetchBackendPortfolio,
  fetchBackendProject,
  fetchBackendProjects,
  historyToPricePoints,
  isBackendConfigured,
  type BackendProject,
} from './apiClient'

export { API_TIMEOUT_MS }

const DEMO_MODE = !isBackendConfigured()

function isDemoMode(): boolean {
  return DEMO_MODE
}

/** Returns true if the UI should show a "Demo data" badge. */
export function shouldShowDemoBadge(): boolean {
  return isDemoMode()
}

/**
 * GET a `/v1/...` path and parse the JSON body. Rejects with an `ApiError` on a
 * non-2xx status, a timeout, a network error or a malformed body. Demo
 * fallbacks are selected before calling this helper; production errors bubble up.
 */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return apiGet<T>(path, init)
}

/** Alias for request helper (#587) */
export const apiFetch = request

/**
 * Maps a backend project row onto the app's `Project` shape.
 *
 * The backend reports scores and telemetry; presentation fields that only exist
 * on-chain or in the bundled fixtures come from the local project, so a live
 * backend fills in the scores without losing names and funding copy.
 */
export function mapBackendProject(raw: BackendProject, fallback?: Project): Project {
  const credit = Number(raw.credit_quality)
  const green = Number(raw.green_impact)
  if (!fallback) {
    return {
      id: raw.id,
      name: `Bond Project #${raw.id}`,
      location: 'Stellar Network',
      type: 'Solar',
      credit,
      green,
      funded: '$0',
      fundedAmount: 0,
      fundingGoal: 0,
      status: 'open',
      priceHistory: [],
    }
  }
  return {
    ...fallback,
    id: raw.id,
    credit: Number.isFinite(credit) ? credit : fallback.credit,
    green: Number.isFinite(green) ? green : fallback.green,
  }
}

export interface ProjectWithDetail {
  project: Project
  detail: ProjectDetail
  verifiedMetadata?: MetadataVerificationStatus
}

export interface PaginatedProjectsResponse {
  projects: Project[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

/**
 * Fetches a paginated/lazy chunk of bonds to optimize initial load time from 3-5s down to sub-second.
 */
export async function getProjectsPaginated(
  page = 1,
  pageSize = 12,
): Promise<PaginatedProjectsResponse> {
  if (isRegistryConfigured()) {
    const offset = (page - 1) * pageSize
    const pageResult = await fetchProjectsPage(offset, pageSize)
    return {
      projects: pageResult.projects,
      total: pageResult.total,
      page,
      pageSize,
      hasMore: pageResult.hasMore,
    }
  }

  if (isDemoMode()) {
    const all = selectProjects()
    const start = (page - 1) * pageSize
    const projects = all.slice(start, start + pageSize)
    return {
      projects,
      total: all.length,
      page,
      pageSize,
      hasMore: start + pageSize < all.length,
    }
  }

  try {
    // The backend paginates with a cursor; the page number maps to an offset.
    const offset = (page - 1) * pageSize
    const data = await fetchBackendProjects(offset, pageSize)
    const projects = data.projects.map((row) => mapBackendProject(row, selectProjectById(row.id)))
    return {
      projects,
      total: data.filtered_total ?? data.projects.length,
      page,
      pageSize,
      hasMore: data.cursor !== undefined,
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError({ cause: error, message: 'Failed to fetch projects' })
  }
}

export async function getProjects(): Promise<Project[]> {
  if (isRegistryConfigured()) {
    const pageResult = await fetchProjectsPage(0, 100)
    return pageResult.projects
  }
  if (isDemoMode()) return selectProjects()
  try {
    const data = await fetchBackendProjects(0, 100)
    return data.projects.map((row) => mapBackendProject(row, selectProjectById(row.id)))
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError({ cause: error, message: 'Failed to fetch projects' })
  }
}

export async function getProject(id: number): Promise<ProjectWithDetail | null> {
  if (isRegistryConfigured()) {
    const res = await fetchProjectWithDetails(id)
    if (res) {
      return {
        project: res.project,
        detail: res.detail,
        verifiedMetadata: res.verifiedMetadata,
      }
    }
  }

  const mockProject = selectProjectById(id)
  const mockDetail = selectProjectDetail(id)

  if (isDemoMode()) {
    if (!mockProject || !mockDetail) return null
    return { project: mockProject, detail: mockDetail, verifiedMetadata: 'unverified' }
  }

  try {
    const raw = await fetchBackendProject(id)
    if (!raw) return null
    return {
      project: mapBackendProject(raw, mockProject),
      detail: mockDetail ?? ({ id } as unknown as ProjectDetail),
      verifiedMetadata: 'unverified',
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError({ cause: error, message: `Failed to fetch project ${id}` })
  }
}

/**
 * Performs biometric login (Face ID / Touch ID) using the WebAuthn API.
 * Delegates to the canonical WebAuthn challenge-response implementation in webauthn.ts.
 * Returns true if the user successfully authenticates via server verification, false otherwise.
 */
export async function biometricLogin(username: string = ''): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    console.warn('[api] Biometric login not supported on this device/browser')
    return false
  }

  try {
    await loginBiometric(username)
    return true
  } catch (error) {
    console.warn('[api] biometric login failed:', error)
    return false
  }
}

export interface PricePoint {
  date: string
  price: number
  yield?: number
}

/**
 * Chart points for a project.
 *
 * Sourced from `GET /v1/projects/:id/history`, which reports impact-score
 * snapshots. This replaces the mocked `/price-history` endpoint the backend
 * never implemented (#588). Demo mode still synthesises points so the chart has
 * something to draw without a backend.
 */
export async function getPriceHistory(projectId: number): Promise<PricePoint[]> {
  const makeMock = (): PricePoint[] => {
    const basePrice = 95 + projectId * 5
    const today = new Date()
    const points = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const date = d.toISOString().split('T')[0]
      const price = basePrice + Math.sin((30 - i) / 3 + projectId) * 3 + (30 - i) * 0.1
      const yieldValue = 5 + Math.cos((30 - i) / 2 + projectId) * 0.5
      return { date, price: Number(price.toFixed(2)), yield: Number(yieldValue.toFixed(2)) }
    })
    return points.reverse() // ascending chronological order
  }

  if (isDemoMode()) return makeMock()
  try {
    const history = await fetchBackendHistory(projectId)
    return historyToPricePoints(history.entries)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError({
      cause: error,
      message: `Failed to fetch price history for project ${projectId}`,
    })
  }
}

/**
 * On-chain vault position for an address, from `GET /v1/portfolio/:address`.
 * Exposed so screens can reach the backend portfolio when one is configured;
 * the Soroban vault remains the source of truth for balances (#588).
 */
export { fetchBackendPortfolio }
