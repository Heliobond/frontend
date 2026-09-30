/**
 * The typed `/v1` client (#588).
 *
 * Two things matter here and are easy to regress: the browser must never be
 * asked for the API key (it goes through the same-origin proxy instead), and the
 * server must call the backend with the key attached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Client = typeof import('./apiClient')

const API = 'https://backend.example.test'
const KEY = 'sk-live-secret-value'

/** Loads the client as the browser would see it (a `window` is present). */
async function loadClient(): Promise<Client> {
  vi.resetModules()
  vi.stubEnv('HELIOBOND_API_URL', API)
  vi.stubEnv('HELIOBOND_API_KEY', KEY)
  return import('./apiClient')
}

/** Loads the client with no `window`, i.e. a server component. */
async function loadServerClient(): Promise<Client> {
  const client = await loadClient()
  vi.stubGlobal('window', undefined)
  return client
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function headersOf(call: unknown[]): Record<string, string> {
  return ((call[1] as RequestInit | undefined)?.headers ?? {}) as Record<string, string>
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('apiClient URL building', () => {
  it('sends browser requests to the same-origin proxy', async () => {
    const client = await loadClient()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ projects: [], total: 0, filtered_total: 0 }))
    await client.fetchBackendProjects()
    expect(fetch).toHaveBeenCalledWith(
      '/api/backend/v1/projects?cursor=0&limit=50',
      expect.anything(),
    )
  })

  it('never puts the key in a browser request', async () => {
    const client = await loadClient()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ projects: [], total: 0, filtered_total: 0 }))
    await client.fetchBackendProjects()
    const headers = headersOf(vi.mocked(fetch).mock.calls[0])
    expect(headers['X-API-Key']).toBeUndefined()
    expect(JSON.stringify(headers)).not.toContain(KEY)
  })

  it('calls the backend directly on the server and sends the key', async () => {
    const client = await loadServerClient()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ projects: [], total: 0, filtered_total: 0 }))
    await client.fetchBackendProjects()
    expect(fetch).toHaveBeenCalledWith(`${API}/v1/projects?cursor=0&limit=50`, expect.anything())
    expect(headersOf(vi.mocked(fetch).mock.calls[0])['X-API-Key']).toBe(KEY)
  })

  it('strips a trailing slash from the configured origin', async () => {
    vi.resetModules()
    vi.stubEnv('HELIOBOND_API_URL', `${API}/`)
    const client = await import('./apiClient')
    vi.stubGlobal('window', undefined)
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ projects: [], total: 0, filtered_total: 0 }))
    await client.fetchBackendProjects()
    expect(fetch).toHaveBeenCalledWith(`${API}/v1/projects?cursor=0&limit=50`, expect.anything())
  })

  it('reports no backend when nothing is configured', async () => {
    vi.resetModules()
    vi.stubEnv('HELIOBOND_API_URL', '')
    vi.stubEnv('NEXT_PUBLIC_API_URL', '')
    vi.stubEnv('HELIOBOND_API_KEY', '')
    const client = await import('./apiClient')
    expect(client.isBackendConfigured()).toBe(false)
  })

  it('reports a backend when an origin or a key is configured', async () => {
    expect((await loadClient()).isBackendConfigured()).toBe(true)
  })
})

describe('apiGet errors', () => {
  it('rejects with a typed ApiError carrying the status', async () => {
    const client = await loadClient()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'boom' }, 503))
    await expect(client.apiGet('/projects')).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
      code: 'HTTP_503',
      message: 'HTTP 503',
    })
  })

  it('reports timeouts', async () => {
    const client = await loadClient()
    vi.useFakeTimers()
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    const pending = client.apiGet('/projects').catch((error: Error) => error)
    await vi.advanceTimersByTimeAsync(client.API_TIMEOUT_MS + 1)
    await expect(pending).resolves.toMatchObject({ message: expect.stringContaining('timed out') })
    vi.useRealTimers()
  })

  it('propagates a network error untouched', async () => {
    const client = await loadClient()
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'))
    await expect(client.apiGet('/projects')).rejects.toThrow('fetch failed')
  })
})

describe('typed endpoint helpers', () => {
  it('passes cursor and limit to the projects endpoint', async () => {
    const client = await loadClient()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ projects: [], total: 0, filtered_total: 0 }))
    await client.fetchBackendProjects(25, 25)
    expect(fetch).toHaveBeenCalledWith(
      '/api/backend/v1/projects?cursor=25&limit=25',
      expect.anything(),
    )
  })

  it('returns null for a missing project instead of throwing', async () => {
    const client = await loadClient()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'not found' }, 404))
    await expect(client.fetchBackendProject(7)).resolves.toBeNull()
  })

  it('propagates a non-404 failure for a single project', async () => {
    const client = await loadClient()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'boom' }, 500))
    await expect(client.fetchBackendProject(7)).rejects.toMatchObject({ status: 500 })
  })

  it('sorts history entries oldest first', async () => {
    const client = await loadClient()
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        project_id: 1,
        count: 2,
        entries: [{ timestamp: 200 }, { timestamp: 100 }],
      }),
    )
    const history = await client.fetchBackendHistory(1)
    expect(history.entries.map((e) => e.timestamp)).toEqual([100, 200])
  })

  it('forwards the history range as a query string', async () => {
    const client = await loadClient()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ project_id: 1, count: 0, entries: [] }))
    await client.fetchBackendHistory(1, { from: 10, to: 20 })
    expect(fetch).toHaveBeenCalledWith(
      '/api/backend/v1/projects/1/history?from=10&to=20',
      expect.anything(),
    )
  })

  it('omits the query string when no range is given', async () => {
    const client = await loadClient()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ project_id: 1, count: 0, entries: [] }))
    await client.fetchBackendHistory(1)
    expect(fetch).toHaveBeenCalledWith('/api/backend/v1/projects/1/history', expect.anything())
  })

  it('escapes the address in the portfolio path', async () => {
    const client = await loadClient()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ address: 'x' }))
    await client.fetchBackendPortfolio('GABC/../admin')
    expect(fetch).toHaveBeenCalledWith(
      '/api/backend/v1/portfolio/GABC%2F..%2Fadmin',
      expect.anything(),
    )
  })
})

describe('historyToPricePoints', () => {
  it('renders entries as dated, ascending price and yield points', async () => {
    const client = await loadClient()
    const points = client.historyToPricePoints([
      { timestamp: Date.parse('2026-02-01T00:00:00Z'), credit_quality: 50, green_impact: 60 },
      { timestamp: Date.parse('2026-01-01T00:00:00Z'), credit_quality: 40, green_impact: 40 },
    ])
    expect(points.map((p) => p.date)).toEqual(['2026-01-01', '2026-02-01'])
    expect(points[1].price).toBeGreaterThan(points[0].price)
    expect(points[1].yield).toBeGreaterThan(points[0].yield ?? 0)
  })

  it('returns an empty list for no entries', async () => {
    expect((await loadClient()).historyToPricePoints([])).toEqual([])
  })
})
