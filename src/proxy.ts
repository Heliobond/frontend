import { NextResponse, type NextRequest } from 'next/server'
import { buildCsp, cspHeaderName, generateNonce, resolveCspMode } from './lib/securityHeaders'

// Sets a per-request nonce'd Content-Security-Policy (#601). The nonce goes on the
// request too, so Next.js stamps it on its own scripts and layout.tsx can stamp the
// theme bootstrap. Static security headers live in next.config.ts.
export function proxy(request: NextRequest) {
  const nonce = generateNonce()
  const csp = buildCsp({ nonce, isDev: process.env.NODE_ENV !== 'production' })
  const headerName = cspHeaderName(resolveCspMode())

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set(headerName, csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set(headerName, csp)
  return response
}

export const config = {
  matcher: [
    {
      // Skip static assets and prefetches: they don't render documents.
      source: '/((?!_next/static|_next/image|favicon.ico|assets/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
