import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { selectProjectById, selectProjects } from '../state/selectors'
import { PROXY_BASE } from './apiClient'

// Error and fallback branches of every exported api.ts function (#608).
// API_URL is read at module load, so each test stubs the env and re-imports.

vi.mock('../wallet/registry', () => ({
  isRegistryConfigured: () => false,
  fetchProjectsPage: vi.fn(),
  fetchProjectWithDetails: vi.fn(),
}))

const API = 'https://api.example.test'

type Api = typeof import('./api')

/**
 * Re-import api.ts with the backend configured (or unset when null).
 * `HELIOBOND_API_URL` is read at module load, so the env is stubbed first.
 */
async function loadApi(apiUrl: string | null = API): Promise<Api> {
  vi.resetModules()
  vi.stubEnv('HELIOBOND_API_URL', apiUrl ?? '')
  vi.stubEnv('NEXT_PUBLIC_API_URL', apiUrl ?? '')
  return import('./api')
}

/**
 * Loads api.ts as if running on the server (no `window`), where the client calls
 * the backend directly instead of going through the same-origin proxy.
 */
async function loadServerApi(apiUrl: string = API): Promise<Api> {
  const api = await loadApi(apiUrl)
  vi.stubGlobal('window', undefined)
  return api
}

/** The URL the browser actually requests: the same-origin proxy, no secrets. */
const proxyUrl = (path: string) => `${PROXY_BASE}${path}`

/** A `GET /v1/projects` body, as the backend returns it. */
function projectList(
  rows: Array<{ id: number; credit_quality: number; green_impact: number }>,
  extra: Record<string, unknown> = {},
) {
  return {
    projects: rows.map((row) => ({
      id: row.id,
      credit_quality: row.credit_quality,
      green_impact: row.green_impact,
      power_output_kw: 1000,
      efficiency_pct: 22,
      forest_density_pct: 80,
      ndvi_score: 0.7,
      timestamp: 1_700_000_000_000,
    })),
    total: rows.length,
    filtered_total: rows.length,
    ...extra,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function malformedResponse(): Response {
  return new Response('<html>502 Bad Gateway</html>', { status: 200 })
}

/** A fetch that never settles until the request's AbortSignal fires. */
function hangingFetch(_url: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('The operation was aborted.', 'AbortError')),
    )
  })
}

type Failure = { name: string; mock: () => void; reason: RegExp; status?: number }

const failures: Failure[] = [
  {
    name: '4xx',
    mock: () => vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'nope' }, 404)),
    reason: /\(HTTP 404\)/,
    status: 404,
  },
  {
    name: '5xx',
    mock: () => vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'boom' }, 503)),
    reason: /\(HTTP 503\)/,
  },
  {
    name: 'network error',
    mock: () => vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed')),
    reason: /\(fetch failed\)/,
  },
  {
    name: 'malformed JSON',
    mock: () => vi.mocked(fetch).mockResolvedValue(malformedResponse()),
    reason: /\(.*JSON.*\)/,
  },
]

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** Run `call` against a fetch that hangs, advancing fake timers past the timeout. */
async function withTimeout<T>(api: Api, call: () => Promise<T>): Promise<T> {
  vi.useFakeTimers()
  vi.mocked(fetch).mockImplementation(hangingFetch)
  const pending = call().then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  )
  await vi.advanceTimersByTimeAsync(api.API_TIMEOUT_MS + 1)
  const outcome = await pending
  if ('error' in outcome) throw outcome.error
  return outcome.value
}

function lastWarning(): string {
  return String(warn.mock.calls.at(-1)?.[0] ?? '')
}

describe('getProjects', () => {
  it.each(failures)('surfaces production errors on $name', async ({ mock }) => {
    const api = await loadApi()
    mock()
    await expect(api.getProjects()).rejects.toThrow()
    expect(fetch).toHaveBeenCalledWith(
      proxyUrl('/v1/projects?cursor=0&limit=100'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(warn).not.toHaveBeenCalled()
  })

  it('surfaces request timeouts', async () => {
    const api = await loadApi()
    await expect(withTimeout(api, () => api.getProjects())).rejects.toThrow()
  })

  it('never reports the literal "HTTP {res.status}" placeholder', async () => {
    const api = await loadApi()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500))
    await expect(api.getProjects()).rejects.toThrow('HTTP 500')
  })

  it('request helper throws typed ApiError with status, code, and message', async () => {
    const api = await loadApi()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'server error' }, 503))
    try {
      await api.request('/test-endpoint')
      expect.fail('should have thrown')
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(api.ApiError)
      const apiErr = err as InstanceType<typeof api.ApiError>
      expect(apiErr.status).toBe(503)
      expect(apiErr.code).toBe('HTTP_503')
      expect(apiErr.message).toBe('HTTP 503')
    }
  })

  it('returns the mapped payload on success', async () => {
    const api = await loadApi()
    const id = selectProjects()[0].id
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(projectList([{ id, credit_quality: 64, green_impact: 71 }])),
    )
    const projects = await api.getProjects()
    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({
      id,
      credit: 64,
      green: 71,
      name: selectProjectById(id)?.name,
    })
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('getProjectsPaginated', () => {
  it.each(failures)('surfaces paginated production errors on $name', async ({ mock }) => {
    const api = await loadApi()
    mock()
    await expect(api.getProjectsPaginated(1, 2)).rejects.toThrow()
    expect(fetch).toHaveBeenCalledWith(proxyUrl('/v1/projects?cursor=0&limit=2'), expect.anything())
    expect(warn).not.toHaveBeenCalled()
  })

  it('surfaces request timeouts', async () => {
    const api = await loadApi()
    await expect(withTimeout(api, () => api.getProjectsPaginated(2, 3))).rejects.toThrow()
  })

  it('maps backend rows onto the app project shape', async () => {
    const api = await loadApi()
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(projectList([{ id: 1, credit_quality: 77, green_impact: 88 }])),
    )
    const res = await api.getProjectsPaginated()
    expect(res.projects).toHaveLength(1)
    expect(res.projects[0]).toMatchObject({ id: 1, credit: 77, green: 88 })
    expect(res.total).toBe(1)
    expect(res.hasMore).toBe(false)
  })

  it('translates the page number into a cursor and honours the next cursor', async () => {
    const api = await loadApi()
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(projectList([{ id: 1, credit_quality: 10, green_impact: 20 }], { cursor: 2 })),
    )
    const res = await api.getProjectsPaginated(2, 2)
    expect(fetch).toHaveBeenCalledWith(proxyUrl('/v1/projects?cursor=2&limit=2'), expect.anything())
    expect(res.hasMore).toBe(true)
  })

  it('slices the local dataset when no API is configured', async () => {
    const api = await loadApi(null)
    const res = await api.getProjectsPaginated(1, 1)
    expect(res.projects).toEqual(selectProjects().slice(0, 1))
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('getProject', () => {
  const id = selectProjects()[0].id

  // A 404 is a legitimate "no such project" answer for a single project, so it
  // resolves to null rather than raising (#588).
  it.each(failures.filter((f) => f.status !== 404))(
    'surfaces production errors on $name',
    async ({ mock }) => {
      const api = await loadApi()
      mock()
      await expect(api.getProject(id)).rejects.toThrow()
      expect(fetch).toHaveBeenCalledWith(proxyUrl(`/v1/projects/${id}`), expect.anything())
      expect(warn).not.toHaveBeenCalled()
    },
  )

  it('surfaces request timeouts', async () => {
    const api = await loadApi()
    await expect(withTimeout(api, () => api.getProject(id))).rejects.toThrow()
  })

  it('maps a backend project row onto the app shape', async () => {
    const api = await loadApi()
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ ...projectList([{ id, credit_quality: 77, green_impact: 88 }]).projects[0] }),
    )
    const result = await api.getProject(id)
    expect(result?.project).toMatchObject({
      id,
      credit: 77,
      green: 88,
      // Presentation fields still come from the local project.
      name: selectProjectById(id)?.name,
    })
    expect(result?.verifiedMetadata).toBe(false)
  })

  it('returns null when the backend has no such project', async () => {
    const api = await loadApi()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 404))
    await expect(api.getProject(99999)).resolves.toBeNull()
  })
})

describe('investment creation', () => {
  // The backend never implemented POST /investments; the Stellar deposit
  // transaction is the source of truth, so the endpoint is gone (#588).
  it('does not expose a createInvestment client', async () => {
    const api = await loadApi()
    expect('createInvestment' in api).toBe(false)
  })

  it('never posts to /investments', async () => {
    const api = await loadApi()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}))
    await api.getProjects().catch(() => undefined)
    const posted = vi
      .mocked(fetch)
      .mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
    expect(posted).toHaveLength(0)
  })
})

describe('getPriceHistory', () => {
  it.each(failures)('surfaces production errors on $name', async ({ mock }) => {
    const api = await loadApi()
    mock()
    await expect(api.getPriceHistory(1)).rejects.toThrow()
    expect(fetch).toHaveBeenCalledWith(proxyUrl('/v1/projects/1/history'), expect.anything())
    expect(warn).not.toHaveBeenCalled()
  })

  it('surfaces request timeouts', async () => {
    const api = await loadApi()
    await expect(withTimeout(api, () => api.getPriceHistory(1))).rejects.toThrow()
  })

  it('rejects when the payload has no entries array', async () => {
    const api = await loadApi()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ project_id: 1, count: 0 }))
    await expect(api.getPriceHistory(1)).rejects.toThrow()
  })

  it('maps history entries into chronologically ordered chart points', async () => {
    const api = await loadApi()
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({
        project_id: 1,
        count: 2,
        entries: [
          { timestamp: Date.parse('2026-03-02T00:00:00Z'), credit_quality: 80, green_impact: 90 },
          { timestamp: Date.parse('2026-03-01T00:00:00Z'), credit_quality: 70, green_impact: 60 },
        ],
      }),
    )
    const points = await api.getPriceHistory(1)
    expect(points.map((p) => p.date)).toEqual(['2026-03-01', '2026-03-02'])
    expect(points[1].yield).toBeGreaterThan(points[0].yield ?? 0)
  })

  it('generates ascending mock history without an API', async () => {
    const api = await loadApi(null)
    const points = await api.getPriceHistory(2)
    expect(points).toHaveLength(30)
    expect(points[0].date < points[29].date).toBe(true)
  })
})

describe('auth model (#588)', () => {
  it('calls the backend directly on the server', async () => {
    const api = await loadServerApi()
    vi.mocked(fetch).mockResolvedValue(jsonResponse(projectList([])))
    await api.getProjects()
    expect(fetch).toHaveBeenCalledWith(
      `${API}/v1/projects?cursor=0&limit=100`,
      expect.objectContaining({ headers: expect.any(Object) }),
    )
  })

  it('never asks the browser for the API key', async () => {
    const api = await loadApi()
    vi.mocked(fetch).mockResolvedValue(jsonResponse(projectList([])))
    await api.getProjects()
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(JSON.stringify((init as RequestInit).headers)).not.toContain('X-API-Key')
      expect(JSON.stringify((init as RequestInit).headers)).not.toContain(
        process.env.HELIOBOND_API_KEY ?? 'never-set',
      )
    }
  })

  it('uses the same-origin proxy in the browser, so no secret is needed', async () => {
    const api = await loadApi()
    vi.mocked(fetch).mockResolvedValue(jsonResponse(projectList([])))
    await api.getProjects()
    expect(fetch).toHaveBeenCalledWith(
      proxyUrl('/v1/projects?cursor=0&limit=100'),
      expect.anything(),
    )
  })

  it('does not read the key from a NEXT_PUBLIC_ variable', () => {
    // The key must live in a server-only variable; a NEXT_PUBLIC_ one would be
    // inlined into the client bundle.
    const source = readFileSync(path.join(process.cwd(), 'src/lib/apiClient.ts'), 'utf-8')
    expect(source).not.toMatch(/NEXT_PUBLIC_[A-Z_]*API_KEY/)
    expect(source).toContain('process.env.HELIOBOND_API_KEY')
  })
})

describe('biometricLogin', () => {
  it('returns false when WebAuthn is unavailable', async () => {
    const api = await loadApi()
    vi.stubGlobal('PublicKeyCredential', undefined)
    await expect(api.biometricLogin()).resolves.toBe(false)
    expect(lastWarning()).toContain('not supported')
  })

  it('returns true when server challenge-response succeeds', async () => {
    const api = await loadApi()
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/login/begin')) {
        return Promise.resolve(jsonResponse({ challenge: 'dGVzdA', allowCredentials: [] }))
      }
      if (url.includes('/login/complete')) {
        return Promise.resolve(jsonResponse({ verified: true }))
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`))
    })
    vi.stubGlobal('fetch', mockFetch)

    const get = vi.fn().mockResolvedValue({
      id: 'cred-123',
      rawId: new Uint8Array([1, 2, 3]).buffer,
      type: 'public-key',
      response: {
        authenticatorData: new Uint8Array([4, 5]).buffer,
        clientDataJSON: new Uint8Array([6, 7]).buffer,
        signature: new Uint8Array([8, 9]).buffer,
      },
    })
    vi.stubGlobal('navigator', { ...navigator, credentials: { get } })

    await expect(api.biometricLogin('user@example.com')).resolves.toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('/webauthn/login/begin', expect.anything())
    expect(get).toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledWith('/webauthn/login/complete', expect.anything())
  })

  it('returns false when the authenticator or server rejects', async () => {
    const api = await loadApi()
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    const get = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    vi.stubGlobal('navigator', { ...navigator, credentials: { get } })
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ challenge: 'dGVzdA', allowCredentials: [] }))
    await expect(api.biometricLogin('user@example.com')).resolves.toBe(false)
    expect(get).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
