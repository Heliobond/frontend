'use client'

import { useRouter } from 'next/navigation'
import { Portfolio } from '../../screens/Portfolio'

export default function PortfolioPage() {
  const router = useRouter()
  return (
    <Portfolio
      onWithdraw={() => router.push('/withdraw')}
      onDeposit={() => router.push('/deposit')}
    />
  )
}
