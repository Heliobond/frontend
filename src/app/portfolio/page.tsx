'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { Portfolio } from '../../screens/Portfolio'
import { RequireWallet } from '../../wallet/RequireWallet'

function PortfolioRoute() {
  const router = useRouter()
  return (
    <Portfolio
      onWithdraw={() => router.push('/withdraw')}
      onDeposit={() => router.push('/deposit')}
    />
  )
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={null}>
      <RequireWallet>
        <PortfolioRoute />
      </RequireWallet>
    </Suspense>
  )
}
