'use client'

import { type ReactNode } from 'react'
import { Badge } from './Badge'
import { shouldShowDemoBadge } from '../lib/api'

/**
 * DemoDataBadge — shows a "Demo data" indicator when the app is running in demo mode.
 * Renders nothing when not in demo mode.
 */
export function DemoDataBadge({
  children,
  ...props
}: { children?: ReactNode } & Record<string, unknown>) {
  if (!shouldShowDemoBadge()) return null
  return (
    <Badge tone="testnet" {...props}>
      {children ?? 'Demo data'}
    </Badge>
  )
}
