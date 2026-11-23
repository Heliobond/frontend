import { beforeEach, describe, expect, it } from '@/test/bun'
import { render, screen, fireEvent } from '@/test/render'
import { WatchlistButton } from './WatchlistButton'
import { WATCHLIST_STORAGE_KEY } from '@/lib/watchlist'

describe('WatchlistButton', () => {
  beforeEach(() => localStorage.clear())

  it('starts unpressed with a "save" label', () => {
    render(<WatchlistButton bondId={1} bondName="Sokoto community solar" />)
    const btn = screen.getByRole('button', { name: /add sokoto community solar to watchlist/i })
    expect(btn).toHaveAttribute('aria-pressed', 'false')
  })

  it('toggles saved state and persists the bond id', () => {
    render(<WatchlistButton bondId={1} bondName="Sokoto community solar" />)

    fireEvent.click(screen.getByRole('button', { name: /add .* to watchlist/i }))

    const btn = screen.getByRole('button', {
      name: /remove sokoto community solar from watchlist/i,
    })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
    expect(JSON.parse(localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? '[]')).toEqual([1])

    fireEvent.click(btn)
    expect(screen.getByRole('button', { name: /add .* to watchlist/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(JSON.parse(localStorage.getItem(WATCHLIST_STORAGE_KEY) ?? '[]')).toEqual([])
  })

  it('shows a confirmation toast on add', () => {
    render(<WatchlistButton bondId={2} bondName="Kerala micro-hydro" />)
    fireEvent.click(screen.getByRole('button', { name: /add .* to watchlist/i }))
    expect(screen.getByText('Added to watchlist')).toBeInTheDocument()
    expect(screen.getByText('Kerala micro-hydro')).toBeInTheDocument()
  })
})
