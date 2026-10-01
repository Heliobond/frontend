/**
 * The server-side API proxy (#588).
 *
 * This route is what keeps the backend API key out of the browser: the client
 * calls it same-origin and the key is attached here. The tests below cover the
 * two properties that matter — the key is added on the server, and the route
 * cannot be used to reach arbitrary backend endpoints.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Route = typeof import('./route')

const BACKEND = 'https://backend.example.test'
const KEY = 'sk-live-secret-value'

/** Loads the route with a configured backend, resetting the module cache first. */
async function loadRoute(options: { backend?: string | null } = {}): Promise<Route> {
  vi.resetModules()
  if (options.backend === null) {
    vi.stubEnv('HELIOBOND_API_URL', '')
    vi.stubEnv('NEXT_PUBLIC_API_URL', '')
  } else {
    vi.stubEnv('HELIOBOND_API_URL', options.backend ?? BACKEND)
  }
  vi.stubEnv('HELIOBOND_API_KEY', KEY)
  return import('./route')
}

/** Invokes the handler the way Next.js does, with decoded catch-all segments. */
function invoke(
  route: Route,
  /** Path the browser requests, e.g. "/v1/projects". */
  path: string,
  init: { search?: string } = {},
): Promise<Response> {
  const segments = path.split('/').filter(Boolean)
  return route.GET(
    new Request(`http://localhost:3000/api/backend/${segments.join('/')}${init.search ?? ''}`),
    { params: Promise.resolve({ path: segments }) },
  )
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('proxy auth', () => {
  it('attaches the API key server-side', async () => {
    const route = await loadRoute()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ projects: [] }))
    await invoke(route, '/v1/projects')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe(`${BACKEND}/v1/projects`)
    expect((init?.headers as Record<string, string>)['X-API-Key']).toBe(KEY)
  })

  it('returns the backend body and status', async () => {
    const route = await loadRoute()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ projects: [{ id: 1 }] }))
    const response = await invoke(route, '/v1/projects')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ projects: [{ id: 1 }] })
  })

  it('passes a backend error status through to the client', async () => {
    const route = await loadRoute()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ error: 'nope' }, 401))
    const response = await invoke(route, '/v1/projects')
    expect(response.status).toBe(401)
  })

  it('reports 503 when no backend is configured', async () => {
    const route = await loadRoute({ backend: null })
    const response = await invoke(route, '/v1/projects')
    expect(response.status).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('proxy request shaping', () => {
  it('forwards the caller query string', async () => {
    const route = await loadRoute()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ projects: [] }))
    await invoke(route, '/v1/projects', { search: '?cursor=10&limit=5' })
    expect(fetch).toHaveBeenCalledWith(
      `${BACKEND}/v1/projects?cursor=10&limit=5`,
      expect.anything(),
    )
  })

  it('prefixes the versioned path exactly once', async () => {
    const route = await loadRoute()
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}))
    await invoke(route, '/v1/projects/7/history')
    expect(fetch).toHaveBeenCalledWith(`${BACKEND}/v1/projects/7/history`, expect.anything())
  })

  it('does not let a caller choose its own upstream path', async () => {
    const route = await loadRoute()
    const response = await invoke(route, '/v1/../../admin/secret')
    // Traversal cannot escape the /v1 prefix, so the allowlist rejects it and
    // the backend is never contacted.
    expect(response.status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports 502 when the backend is unreachable', async () => {
    const route = await loadRoute()
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'))
    const response = await invoke(route, '/v1/projects')
    expect(response.status).toBe(502)
  })

  it('reports 504 when the backend times out', async () => {
    const route = await loadRoute()
    vi.useFakeTimers()
    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    const pending = invoke(route, '/v1/projects')
    await vi.advanceTimersByTimeAsync(8001)
    expect((await pending).status).toBe(504)
    vi.useRealTimers()
  })
})

describe('proxy allowlist', () => {
  it('allows the read-only endpoints the frontend uses', async () => {
    const route = await loadRoute()
    vi.mocked(fetch).mockImplementation(async () => jsonResponse({ ok: true }))
    for (const path of [
      '/v1/projects',
      '/v1/projects/3',
      '/v1/projects/3/history',
      '/v1/portfolio/GABC',
      '/v1/forecast/3',
    ]) {
      const response = await invoke(route, path)
      expect(response.status, `expected ${path} to be forwarded`).toBe(200)
      expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toBe(`${BACKEND}${path}`)
    }
  })

  it('rejects an endpoint outside the allowlist without calling the backend', async () => {
    const route = await loadRoute()
    const response = await invoke(route, '/v1/admin/users')
    expect(response.status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not forward a prefix-lookalike path', async () => {
    const route = await loadRoute()
    const response = await invoke(route, '/v1/projects-admin')
    expect(response.status).toBe(404)
    expect(fetch).not.toHaveBeenCalled()
  })
})
