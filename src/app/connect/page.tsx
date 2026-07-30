'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Connect } from '../../screens/Connect'
import { useWallet } from '../../wallet/WalletProvider'

/**
 * Only same-origin, absolute in-app paths are honoured as a return target.
 * `next` arrives in the URL, so treating it as a bare redirect would let a
 * crafted link bounce a freshly-connected wallet holder off-site. A leading
 * `//` (or `/\`) is rejected because the browser reads it as protocol-relative.
 */
function safeNext(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/')) return null
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  return raw
}

function ConnectRoute() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { connected, connect, connectDemo } = useWallet()

  const next = safeNext(searchParams.get('next'))

  // Once a wallet is connected (real modal selection or the demo path), move on
  // — back to whatever the visitor was originally reaching for, if a guard sent
  // them here, otherwise the default first stop.
  useEffect(() => {
    if (connected) router.replace(next ?? '/deposit')
  }, [connected, router, next])

  return (
    <Connect
      onWallet={() => void connect()}
      onNew={() => connectDemo()}
      onCancel={() => router.push('/explore')}
    />
  )
}

export default function ConnectPage() {
  return (
    <Suspense fallback={null}>
      <ConnectRoute />
    </Suspense>
  )
}
