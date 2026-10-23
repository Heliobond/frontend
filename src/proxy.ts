import { NextResponse, type NextRequest } from 'next/server'
import { DEFAULT_LOCALE } from './i18n/config'
import { isSupportedLocale, negotiateLocale } from './i18n/negotiate'
import { buildCsp, cspHeaderName, generateNonce, resolveCspMode } from './lib/securityHeaders'

// Sets a per-request nonce'd Content-Security-Policy (#601). The nonce goes on the
// request too, so Next.js stamps it on its own scripts and layout.tsx can stamp the
// theme bootstrap. Static security headers live in next.config.ts.
// Also negotiates the first-visit locale (#895): when no valid NEXT_LOCALE
// cookie is present, pick the best Accept-Language match and persist it so
// `src/i18n/request.ts` serves that locale on the very first render.
export function proxy(request: NextRequest) {
  const nonce = generateNonce()
  const csp = buildCsp({ nonce, isDev: process.env.NODE_ENV !== 'production' })
  const headerName = cspHeaderName(resolveCspMode())

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set(headerName, csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set(headerName, csp)

  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value
  if (!isSupportedLocale(cookieLocale)) {
    const negotiated = negotiateLocale(request.headers.get('accept-language'))
    // Only persist a non-default match: an explicit default needs no cookie,
    // and the language switcher remains authoritative once it sets one.
    if (negotiated !== DEFAULT_LOCALE) {
      response.cookies.set('NEXT_LOCALE', negotiated, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      })
    }
  }

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
