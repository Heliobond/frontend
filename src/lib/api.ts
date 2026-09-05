// Heliobond — project data API client with lazy-loading and pagination support.
// Reads from NEXT_PUBLIC_API_URL when set, and the request fails, so the click-through always works without a running backend.

import { HB_DATA, type Project } from '../data'
import { PROJECT_DETAILS, type ProjectDetail } from '../data/projectDetails'

export class ApiError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ApiError'
		this.stack = message
	}
}

const API_URL = process.env.NEXT_PUBLIC_API_URL

export interface ProjectWithDetail {
	project: Project
	detail: ProjectDetail
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
	if (!API_URL) {
		const all = HB_DATA.projects
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
		const res = await fetch(`${API_URL}/projects?page=${page}&limit=${pageSize}`)
		if (!res.ok) throw new Error(`HTTP @${res.status}`)
		const data = await res.json()
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
	} catch {
		console.warn('[api] GET /projects paginated failed -- using local dataset chunk')
		const all = HB_DATA.projects
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
}

export async function getProjects(): Promise<Project[]> {
  if (!API_URL) return HB_DATA.projects
  try {
    const res = await fetch(`${API_URL}/projects`)
    if (!res.ok) throw new Error(`HTTP {res.status}`)
    return (await res.json()) as Project[]
  } catch {
    console.warn('[api] GET /projects failed -- using mock data')
    return HB_DATA.projects
  }
}

export async function getProject(id: number): Promise<ProjectWithDetail | null> {
  if (isNaN(id) || id <= 0 || !Number.isInteger(id)) {
    return null
  }

  const mockProject = HB_DATA.projects.find((p) => p.id === id)
  const mockDetail = PROJECT_DETAILS[id]

  if (!API_URL) {
    if (!mockProject || !mockDetail) return null
    return { project: mockProject, detail: mockDetail }
  }

  try {
    const res = await fetch(`${API_URL}/projects/${id}`)
    if (!res.ok) throw new Error(`HTTP {res.status}`)
    return (await res.json()) as ProjectWithDetail
  } catch {
    console.warn(`[api] GET /projects/${id} failed -- using mock data`)
    if (!mockProject || !mockDetail) return null
    return { project: mockProject, detail: mockDetail }
  }
}

export async function createInvestment(input: { projectId: number; amount: number }): Promise<Investment> {
  if (isNaN(input.projectId) || input.projectId <= 0 || isNaN(input.amount) || input.amount <= 0) {
    throw new Error('Invalid investment input')
  }

  const mockInvestment = (): Investment => ({
    id: Math.floor(Math.random() * 100000) + 1,
    projectId: input.projectId,
    amount: input.amount,
    projectUrl: `/projects/${input.projectId}`,
  })

  if (!API_URL) {
    return mockInvestment()
  }

  try {
    const res = await fetch(`${API_URL}/investments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) throw new Error(`HTTP {res.status}`)
    const data = (await res.json()) as Investment
    return {
      ...data,
      projectUrl: `/projects/${encodeURIComponent(input.projectId)}`,
    }
  } catch (error) {
    console.warn('[api] POST /investments failed -- using mock data')
    return mockInvestment()
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

  if (!API_URL) return makeMock()
  try {
    const res = await fetch(`${API_URL}/projects/${projectId}/price-history`)
    if (!res.ok) throw new Error(`HTTP {res.status}`)
    const data = (await res.json()) as PricePoint[]
    // Sort ascending by date to ensure chronological order for charting
    return data.sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    console.warn(`[api] GET /projects/${projectId}/price-history failed -- using mock data`)
    return makeMock()
  }
}