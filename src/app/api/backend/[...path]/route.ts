/**
 * Server-side proxy for the Heliobond API.
 *
 * The backend's `/v1` routes require an API key. Shipping that key to the
 * browser would expose it to anyone using the app, so the browser calls this
 * same-origin route instead and the key is attached here, on the server (#588).
 *
 * Only the read-only endpoints the frontend actually uses are forwarded; the
 * path is matched against an allowlist rather than passed through, so this
 * cannot be used to reach arbitrary backend routes.
 */

import { NextResponse } from 'next/server'

/** Upstream backend. Falls back to the public base URL when set. */
const API_URL = process.env.HELIOBOND_API_URL ?? process.env.NEXT_PUBLIC_API_URL

const API_VERSION = '/v1'

/** Requests slower than this are aborted server-side. */
const TIMEOUT_MS = 8000

/**
 * Path prefixes forwarded upstream, e.g. `/projects/1/history`.
 * Everything else gets a 404 without touching the network.
 */
const ALLOWED_PREFIXES = ['/projects', '/portfolio', '/forecast'] as const

/** Query parameters the read-only endpoints accept; everything else is dropped. */
const ALLOWED_QUERY_PARAMS = ['cursor', 'limit', 'from', 'to'] as const

function isAllowed(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

/**
 * A path segment is safe when it names a real segment after decoding. `%2e` is
 * decoded by Next.js before we see it, so reject `.`/`..` and any decoded
 * slash or backslash — otherwise `../` collapses the upstream URL past `/v1`.
 */
function isSafeSegment(raw: string): boolean {
  if (raw === '' || raw === '.' || raw === '..') return false
  if (raw.includes('/') || raw.includes('\\')) return false
  let decoded: string
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    return false
  }
  if (decoded === '' || decoded === '.' || decoded === '..') return false
  if (decoded.includes('/') || decoded.includes('\\')) return false
  return true
}

/** Keeps only the query parameters the endpoints are allowed to receive. */
function allowedSearch(requestUrl: string): string {
  const source = new URL(requestUrl).searchParams
  const filtered = new URLSearchParams()
  for (const key of ALLOWED_QUERY_PARAMS) {
    for (const value of source.getAll(key)) filtered.append(key, value)
  }
  const search = filtered.toString()
  return search ? `?${search}` : ''
}

/**
 * Builds the upstream URL, then re-checks the normalized pathname still sits
 * under this API's `/v1` prefix — a second line of defense against traversal.
 */
function safeTarget(apiUrl: string, encodedPath: string, search: string): URL | null {
  let target: URL
  try {
    target = new URL(`${apiUrl}${API_VERSION}${encodedPath}${search}`)
  } catch {
    return null
  }
  const basePath = new URL(apiUrl).pathname.replace(/\/+$/, '')
  if (!target.pathname.startsWith(basePath)) return null
  const suffix = target.pathname.slice(basePath.length)
  if (!(suffix === API_VERSION || suffix.startsWith(`${API_VERSION}/`))) return null
  const versionless = suffix.slice(API_VERSION.length) || '/'
  if (!isAllowed(versionless)) return null
  return target
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

/**
 * @param params.path the catch-all segments, already URL-decoded by Next.js.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const apiUrl = API_URL?.replace(/\/+$/, '')
  if (!apiUrl) {
    return jsonError('Backend is not configured', 503)
  }

  const { path: segments } = await context.params

  // Validate every segment before it reaches the upstream URL. This runs before
  // the allowlist so a traversal can never be smuggled through a prefix match.
  if (!segments.every(isSafeSegment)) {
    return jsonError('Unknown endpoint', 404)
  }

  const decodedPath = `/${segments.join('/')}`

  // The browser targets /api/backend/v1/..., so Next.js hands over the version
  // segment too. Strip it here and re-add it when building the upstream URL, so
  // a caller cannot request a different version or double it up.
  if (decodedPath === API_VERSION || decodedPath.startsWith(`${API_VERSION}/`)) {
    const versionless = decodedPath.slice(API_VERSION.length) || '/'
    if (isAllowed(versionless)) {
      return forward(apiUrl, versionless, request)
    }
  }

  return jsonError(`Unknown endpoint: ${decodedPath}`, 404)
}

/** Issues the upstream GET and mirrors its status and body back to the caller. */
async function forward(
  apiUrl: string,
  versionlessPath: string,
  request: Request,
): Promise<NextResponse> {
  const encodedPath = versionlessPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  const target = safeTarget(apiUrl, encodedPath, allowedSearch(request.url))
  if (!target) {
    return jsonError('Unknown endpoint', 404)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(target.toString(), {
      headers: { Accept: 'application/json', 'X-API-Key': process.env.HELIOBOND_API_KEY ?? '' },
      signal: controller.signal,
      cache: 'no-store',
    })

    const body = await response.text()
    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
      },
    })
  } catch (error) {
    if (controller.signal.aborted) {
      return jsonError(`Backend timed out after ${TIMEOUT_MS}ms`, 504)
    }
    const message = error instanceof Error ? error.message : 'Backend request failed'
    return jsonError(message, 502)
  } finally {
    clearTimeout(timer)
  }
}
