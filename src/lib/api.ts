// Heliobond — project data API client with lazy-loading and pagination support.
// Reads from NEXT_PUBLIC_API_URL when set. In production (API_URL configured),
// errors are surfaced through the error pipeline. In demo mode (no API_URL or
// NEXT_PUBLIC_DEMO_MODE=true), mock data is used with a visible "Demo data" indicator.

import { type Project } from '../data'
import { type ProjectDetail } from '../data/projectDetails'
import { selectProjectById, selectProjectDetail, selectProjects } from '../state/selectors'
import {
  isRegistryConfigured,
  fetchProjectsPage,
  fetchProjectWithDetails,
} from '../wallet/registry'
import { ApiError } from './error'
import { reportError } from './errorReporting'

const API_URL = process.env.NEXT_PUBLIC_API_URL
const DEMO_MODE = !API_URL || process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

function isDemoMode(): boolean {
  return DEMO_MODE
}

/** Returns true if the UI should show a "Demo data" badge. */
export function shouldShowDemoBadge(): boolean {
  return isDemoMode()
}

/** Requests slower than this are aborted and the call falls back (#608). */
export const API_TIMEOUT_MS = 8000

/**
 * GET/POST `path` on the API and parse the JSON body. Rejects on a non-2xx
 * status ("HTTP 503"), a timeout, a network error or a malformed body. Demo
 * fallbacks are selected before calling this helper; production errors bubble up.
 */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    const isServer = typeof window === 'undefined'
    const fetchInit: RequestInit = {
      ...init,
      signal: controller.signal,
      ...(isServer ? { next: { revalidate: 60 } } : {}),
    }
    const res = await fetch(`${API_URL}${path}`, fetchInit)
    if (!res.ok) throw new ApiError({ status: res.status, message: `HTTP ${res.status}` })
    return (await res.json()) as T
  } catch (error) {
    if (controller.signal.aborted) {
      const timeout = new Error(`timed out after ${API_TIMEOUT_MS}ms`)
      reportError(timeout, { kind: 'rpc-timeout', context: { target: 'api' } })
      throw timeout
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export interface ProjectWithDetail {
	project: Project
	detail: ProjectDetail
	verifiedMetadata?: boolean
}

export interface Investment {
	id: number
	projectId: number
	amount: number
	projectUrl: string
	// Add other fields as needed
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
export async function getProjectsPaginated(page = 1, pageSize = 12): Promise<PaginatedProjectsResponse> {
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
		const data = await apiFetch<unknown>(`/projects?page=${page}&limit=${pageSize}`)
		if (Array.isArray(data)) {
			const start = (page - 1) * pageSize
			return {
				projects: data.slice(start, start + pageSize),
				total: data.length,
				page,
				pageSize,
				hasMore: start + pageSize < data.length,
			}
		}
		return data as PaginatedProjectsResponse
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
    return await apiFetch<Project[]>('/projects')
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
		return { project: mockProject, detail: mockDetail, verifiedMetadata: true }
	}

  try {
    return await apiFetch<ProjectWithDetail>(`/projects/${id}`)
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError({ cause: error, message: `Failed to fetch project ${id}` })
  }
}

export async function createInvestment(input: { projectId: number; amount: number }): Promise<Investment> {
  // Reject invalid input up front (#432) — projectId must be a positive
  // integer and amount a positive finite number.
  if (
    !Number.isInteger(input.projectId) ||
    input.projectId < 1 ||
    !Number.isFinite(input.amount) ||
    input.amount <= 0
  ) {
    throw new Error('Invalid investment input')
  }
  const mockInvestment = (): Investment => ({
      id: Math.floor(Math.random() * 100000) + 1,
      projectId: input.projectId,
      amount: input.amount,
      projectUrl: `/projects/${input.projectId}`,
    })

  if (isDemoMode()) {
    return mockInvestment()
  }

  try {
    const data = await apiFetch<Investment>('/investments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return {
      ...data,
      projectUrl: `/projects/${encodeURIComponent(input.projectId)}`,
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError({ cause: error, message: 'Failed to create investment' })
  }
}

/**
 * Performs biometric login (Face ID / Touch ID) using the WebAuthn API.
 * Returns true if the user successfully authenticates, false otherwise.
 * This is a client-side implementation; the actual verification should happen
 * with a backend challenge, but for now we generate a random challenge locally.
 */
export async function biometricLogin(): Promise<boolean> {
	if (typeof window === 'undefined' || !window.PublicKeyCredential) {
		console.warn('[api] Biometric login not supported on this device/browser')
		return false
	}

  try {
    // Generate a random challenge (in production, this would come from the server)
    const challenge = new Uint8Array(32)
    crypto.getRandomValues(challenge)

    // Request a credential from the authenticator
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [],
        userVerification: 'required',
      },
    })

    return Boolean(credential)
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
    const data = await apiFetch<PricePoint[]>(`/projects/${projectId}/price-history`)
    // Sort ascending by date to ensure chronological order for charting
    return data.sort((a, b) => a.date.localeCompare(b.date))
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError({ cause: error, message: `Failed to fetch price history for project ${projectId}` })
  }
}
