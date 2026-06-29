'use client'

import { useRouter } from 'next/navigation'
import { Withdraw } from '../../screens/Withdraw'

export default function WithdrawPage() {
  const router = useRouter()
  return (
    <Withdraw onDone={() => router.push('/portfolio')} onBack={() => router.push('/portfolio')} />
  )
}
