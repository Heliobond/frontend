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

function isAllowed(path: string): boolean {
  return ALLOWED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
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
  const path = `/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`

  // The browser targets /api/backend/v1/..., so Next.js hands over the version
  // segment too. Strip it here and re-add it when building the upstream URL, so
  // a caller cannot request a different version or double it up.
  if (path === API_VERSION || path.startsWith(`${API_VERSION}/`)) {
    const versionless = path.slice(API_VERSION.length) || '/'
    if (isAllowed(versionless)) {
      return forward(apiUrl, versionless, request)
    }
  }

  return jsonError(`Unknown endpoint: ${path}`, 404)
}

/** Issues the upstream GET and mirrors its status and body back to the caller. */
async function forward(apiUrl: string, path: string, request: Request): Promise<NextResponse> {
  // Forward the caller's query string (cursor, limit, from, to, …).
  const search = new URL(request.url).search
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(`${apiUrl}${API_VERSION}${path}${search}`, {
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
