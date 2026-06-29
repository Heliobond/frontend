'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Connect } from '../../screens/Connect'
import { useWallet } from '../../wallet/WalletProvider'

export default function ConnectPage() {
  const router = useRouter()
  const { connected, connect, connectDemo } = useWallet()

  // Once a wallet is connected (real modal selection or the demo path), move on.
  useEffect(() => {
    if (connected) router.push('/deposit')
  }, [connected, router])

  return (
    <Connect
      onWallet={() => void connect()}
      onNew={() => connectDemo()}
      onCancel={() => router.push('/explore')}
    />
  )
}
