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
  // Suspense wraps the guard because it reads useSearchParams to preserve the
  // visitor's intent; without a boundary Next cannot prerender the shell.
  return (
    <Suspense fallback={null}>
      <RequireWallet>
        <PortfolioRoute />
      </RequireWallet>
    </Suspense>
  )
}
