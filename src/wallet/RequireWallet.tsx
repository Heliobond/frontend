'use client'

import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useWallet } from './WalletProvider'

/**
 * RequireWallet — the gate in front of the money routes.
 *
 * `/portfolio`, `/deposit` and `/withdraw` all assume a connection: they show
 * balances, or move value. Rendering them for an unconnected visitor produces a
 * screen that is either empty or misleading, and any action on it fails. Only
 * `/connect` redirected; these did not.
 *
 * Two details make this correct rather than merely present:
 *
 *  1. **It waits for rehydration.** The wallet session is restored from
 *     localStorage inside an effect, so on the first render `connected` is
 *     false even for a user who is connected. Redirecting on that first render
 *     would throw a connected user out to Connect on every page refresh. The
 *     guard holds while `restoring` is true and only then decides.
 *
 *  2. **It preserves intent.** Where the visitor was going is carried to
 *     Connect as `?next=`, so finishing the connection returns them to the page
 *     they asked for instead of the default landing spot.
 *
 * `router.replace` — not `push` — so Back does not bounce the user between the
 * gated route and Connect.
 */
export interface RequireWalletProps {
  children: ReactNode
  /** Where to send an unconnected visitor. */
  redirectTo?: string
  /** Rendered while the session rehydrates or the redirect is in flight. */
  fallback?: ReactNode
}

export function RequireWallet({
  children,
  redirectTo = '/connect',
  fallback = null,
}: RequireWalletProps) {
  const { connected, restoring } = useWallet()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // The full path the visitor asked for, query string included, so intent
  // survives the detour through Connect.
  const query = searchParams.toString()
  const intent = query ? `${pathname}?${query}` : pathname

  const shouldRedirect = !restoring && !connected

  useEffect(() => {
    if (!shouldRedirect) return
    router.replace(`${redirectTo}?next=${encodeURIComponent(intent)}`)
  }, [shouldRedirect, router, redirectTo, intent])

  // Hold the gated content while we do not yet know, and while the redirect is
  // in flight, so it never flashes to someone who is not entitled to it.
  if (restoring || !connected) return <>{fallback}</>

  return <>{children}</>
}
