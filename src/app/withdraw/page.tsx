'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Withdraw } from '../../screens/Withdraw'
import { RequireWallet } from '../../wallet/RequireWallet'

function WithdrawRoute() {
  const router = useRouter()
  return (
    <Withdraw onDone={() => router.push('/portfolio')} onBack={() => router.push('/portfolio')} />
  )
}

export default function WithdrawPage() {
  return (
    <Suspense fallback={null}>
      <RequireWallet>
        <WithdrawRoute />
      </RequireWallet>
    </Suspense>
  )
}
