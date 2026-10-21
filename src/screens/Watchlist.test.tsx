import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/render'
import { Watchlist } from './Watchlist'
import { WATCHLIST_STORAGE_KEY } from '@/lib/watchlist'
import type { ProjectDetail } from '@/data/projectDetails'

describe('Watchlist screen', () => {
  beforeEach(() => localStorage.clear())

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

  it('renders a watchlisted project with id > 100', async () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([105]))
    const spy = vi
      .spyOn(await import('@/lib/api'), 'getProject')
      .mockImplementation((id: number) => {
        if (id === 105) {
          return Promise.resolve({
            project: {
              id: 105,
              name: 'Kalahari High-Yield Solar',
              location: 'Kalahari',
              type: 'Solar',
              credit: 92,
              green: 88,
              funded: '80%',
              fundedAmount: 8000,
              fundingGoal: 10000,
              priceHistory: [],
            },
            detail: {} as unknown as ProjectDetail,
          })
        }
        return Promise.resolve(null)
      })

    render(<Watchlist onOpen={vi.fn()} />)
    expect(await screen.findByText('Kalahari High-Yield Solar')).toBeInTheDocument()
    spy.mockRestore()
  })

  it('shows unresolvable ids as no longer available and allows removing them', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([999]))

    render(<Watchlist onOpen={vi.fn()} />)

    expect(await screen.findByText('Project #999 is no longer available')).toBeInTheDocument()
    const removeBtn = screen.getByRole('button', { name: /remove/i })
    expect(removeBtn).toBeInTheDocument()

    await user.click(removeBtn)

    expect(screen.queryByText('Project #999 is no longer available')).not.toBeInTheDocument()
    expect(await screen.findByText('Nothing saved yet')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(WATCHLIST_STORAGE_KEY) || '[]')).not.toContain(999)
  })

  it('shows a loading status until saved projects resolve', async () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([1]))
    const spy = vi
      .spyOn(await import('@/lib/api'), 'getProject')
      .mockReturnValue(new Promise(() => {}))

    render(<Watchlist onOpen={vi.fn()} />)

    expect(await screen.findByRole('status')).toHaveTextContent('Loading saved projects')
    spy.mockRestore()
  })

  it('keeps failed fetches on the watchlist and offers retry rather than removal', async () => {
    const user = (await import('@testing-library/user-event')).default.setup()
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([999]))
    const spy = vi
      .spyOn(await import('@/lib/api'), 'getProject')
      .mockRejectedValueOnce(new Error('Server unavailable'))
      .mockResolvedValueOnce(null)

    render(<Watchlist onOpen={vi.fn()} />)

    expect(await screen.findByText('Could not load project #999')).toBeInTheDocument()
    expect(screen.queryByText('Project #999 is no longer available')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry loading project #999' }))
    expect(await screen.findByText('Project #999 is no longer available')).toBeInTheDocument()
    spy.mockRestore()
  })
})
