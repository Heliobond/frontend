'use client'

import { useRouter } from 'next/navigation'
import { Landing } from '../screens/Landing'

export default function HomePage() {
  const router = useRouter()
  return (
    <Landing onConnect={() => router.push('/connect')} onExplore={() => router.push('/explore')} />
  )
}
