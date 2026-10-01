import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/render'
import userEvent from '@testing-library/user-event'
import { Watchlist } from './Watchlist'
import { WATCHLIST_STORAGE_KEY } from '@/lib/watchlist'
import * as api from '@/lib/api'

describe('Watchlist screen', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('shows the empty state when nothing is saved', async () => {
    render(<Watchlist onOpen={vi.fn()} />)
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument()
  })

  it('lists saved bonds with a status marker and flags available ones', async () => {
    // id 1 (Sokoto) is status:'open', id 2 (Ría de Vigo) is status:'upcoming'
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([1, 2]))
    render(<Watchlist onOpen={vi.fn()} />)

    expect(await screen.findByText('Sokoto community solar')).toBeInTheDocument()
    expect(screen.getByText('Ría de Vigo tidal array')).toBeInTheDocument()

    expect(screen.getByText('Open for funding')).toBeInTheDocument()
    expect(screen.getByText('Not yet available')).toBeInTheDocument()
    expect(screen.getByText(/saved bond is open for funding right now/i)).toBeInTheDocument()
  })

  it('displays a watchlisted project with id > 100', async () => {
    vi.spyOn(api, 'getProject').mockImplementation(async (id: number) => {
      if (id === 150) {
        return {
          project: {
            id: 150,
            name: 'Kalahari Solar 150',
            location: 'Namibia',
            type: 'Solar',
            credit: 85,
            green: 90,
            funded: '$100k',
            fundingGoal: 200000,
            fundedAmount: 100000,
            status: 'open',
            priceHistory: [],
          },
          detail: {} as unknown as import('../data/projectDetails').ProjectDetail,
          verifiedMetadata: 'verified',
        }
      }
      return null
    })

    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([150]))
    render(<Watchlist onOpen={vi.fn()} />)
    expect(await screen.findByText('Kalahari Solar 150')).toBeInTheDocument()
  })

  it('shows unresolvable watchlist ids with a remove action', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'getProject').mockResolvedValue(null)
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([9999]))

    render(<Watchlist onOpen={vi.fn()} />)
    expect(await screen.findByText(/Project #9999 is no longer available/i)).toBeInTheDocument()

    const removeBtn = screen.getByRole('button', { name: /Remove/i })
    await user.click(removeBtn)

    expect(screen.queryByText(/Project #9999 is no longer available/i)).not.toBeInTheDocument()
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument()
  })
})
