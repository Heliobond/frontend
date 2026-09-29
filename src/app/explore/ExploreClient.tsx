'use client'

import { useRouter } from 'next/navigation'
import { Explore } from '../../screens/Explore'
import { type Project } from '../../data'

export interface ExploreClientProps {
  initialProjects?: Project[]
  initialTotal?: number
}

export function ExploreClient({ initialProjects, initialTotal }: ExploreClientProps) {
  const router = useRouter()
  return (
    <Explore
      initialProjects={initialProjects}
      initialTotal={initialTotal}
      onOpen={(p) => router.push(`/project/${p.id}`)}
    />
  )
}
