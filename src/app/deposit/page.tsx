'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Deposit } from '../../screens/Deposit'
import { RequireWallet } from '../../wallet/RequireWallet'

function DepositRoute() {
  const router = useRouter()
  return <Deposit onDone={() => router.push('/portfolio')} />
}

export default function DepositPage() {
  return (
    <Suspense fallback={null}>
      <RequireWallet>
        <DepositRoute />
      </RequireWallet>
    </Suspense>
  )
}
