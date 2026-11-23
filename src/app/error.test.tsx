/**
 * Regression tests for #710. The route boundary used to infer "offline" from a
 * regex over `error.message`; `sync` matched "async" and `network` matched
 * "network mismatch", so unrelated failures were shown as Stellar outages. It
 * now reads real connectivity (Horizon health + `navigator.onLine`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from '@/test/bun'
import type { ReactNode } from 'react'

let horizonState = { isOnline: true }

vi.mock('@/hooks/useHorizonHealth', () => ({
  useHorizonHealth: () => horizonState,
}))

vi.mock('@/lib/errorReporting', () => ({ reportError: vi.fn() }))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

const { render, screen } = await import('@/test/render')
const { default: RouteError } = await import('./error')
const { reportError } = await import('@/lib/errorReporting')

function setNavigatorOnline(online: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true })
}

const offlineCopy = () => screen.queryByText("You're offline")

describe('route error boundary offline detection (#710)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    horizonState = { isOnline: true }
    setNavigatorOnline(true)
  })

  afterEach(() => {
    setNavigatorOnline(true)
  })

  it('does not treat a non-network error as offline', () => {
    setNavigatorOnline(true)
    render(<RouteError error={new Error('Unexpected token < in JSON')} reset={vi.fn()} />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(offlineCopy()).not.toBeInTheDocument()
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ kind: 'route' }),
    )
  })

  it.each([
    ['sync in async', 'Failed to async sync the wallet'],
    ['network mismatch', 'Stellar network mismatch'],
  ])('does not classify a message mentioning %s as offline (#710)', (_label, message) => {
    render(<RouteError error={new Error(message)} reset={vi.fn()} />)
    expect(offlineCopy()).not.toBeInTheDocument()
  })

  it('shows the offline copy when the Horizon health check is offline', () => {
    horizonState = { isOnline: false }
    render(<RouteError error={new Error('boom')} reset={vi.fn()} />)
    expect(offlineCopy()).toBeInTheDocument()
  })

  it('shows the offline copy when navigator.onLine is false', () => {
    setNavigatorOnline(false)
    render(<RouteError error={new Error('boom')} reset={vi.fn()} />)
    expect(offlineCopy()).toBeInTheDocument()
  })

  it('offers a Go home link regardless of connectivity', () => {
    horizonState = { isOnline: false }
    render(<RouteError error={new Error('boom')} reset={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/')
  })

  it('renders a primary Button for Try again with primary tokens (#709)', () => {
    const reset = vi.fn()
    render(<RouteError error={new Error('boom')} reset={reset} />)
    const btn = screen.getByRole('button', { name: 'Try again' })
    expect(btn).toBeInTheDocument()
    expect(btn.style.background).toContain('var(--button-primary-bg)')
    expect(btn.style.color).toContain('var(--button-primary-fg)')
  })
})
