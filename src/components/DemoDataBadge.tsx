'use client'

import { type ReactNode } from 'react'
import { Badge } from './Badge'
import { shouldShowDemoBadge, type ProjectSource } from '../lib/api'

/**
 * DemoDataBadge — shows a "Demo data" indicator when the app is running in demo mode,
 * or when the displayed item's source is explicitly 'demo'.
 * Renders nothing when not in demo mode or when data comes from live source.
 */
export function DemoDataBadge({
  children,
  source,
  show,
  ...props
}: {
  children?: ReactNode
  source?: ProjectSource
  show?: boolean
} & Record<string, unknown>) {
  if (show === false || (show === undefined && !shouldShowDemoBadge(source))) return null
  return (
    <Badge tone="testnet" {...props}>
      {children ?? 'Demo data'}
    </Badge>
  )
}
