import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/render'
import userEvent from '@testing-library/user-event'

const mockReplace = vi.fn()
let mockSearch = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

vi.mock('@/lib/api', () => ({ getProjectsPaginated: vi.fn(), shouldShowDemoBadge: () => false }))

vi.mock('../components', async () => {
  const actual = await vi.importActual<typeof import('../components')>('../components')
  return {
    ...actual,
    ProjectCard: ({ name }: { name: string }) => <article data-testid="card">{name}</article>,
  }
})

import { getProjectsPaginated } from '@/lib/api'
import { Explore } from './Explore'
import type { Project, ProjectType } from '../data'

const mockGetProjectsPaginated = vi.mocked(getProjectsPaginated)

/** A registry large enough to span several pages. */
function makeProjects(count: number, type: ProjectType = 'Solar', offset = 0): Project[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1 + offset),
    name: `Project ${i + 1 + offset}`,
    location: 'Nowhere',
    type,
    credit: 80,
    green: 80,
    funded: 50,
    fundingGoal: 1000,
    fundedAmount: 500,
  })) as unknown as Project[]
}

const cards = () => screen.queryAllByTestId('card')

/** The "load more" control, labeled with the chunk size it will add. */
const loadMoreButton = (count: number) => screen.getByRole('button', { name: `Show ${count} more` })

describe('Explore — pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearch = ''
  })

  /** Serve `all` through the paginated API, as the real backend would. */
  function mockPaginated(all: Project[]) {
    mockGetProjectsPaginated.mockImplementation((page = 1, pageSize = 12) => {
      const start = (page - 1) * pageSize
      return Promise.resolve({
        projects: all.slice(start, start + pageSize),
        total: all.length,
        page,
        pageSize,
        hasMore: start + pageSize < all.length,
      })
    })
  }

  it('renders only the first page of a large registry', async () => {
    mockPaginated(makeProjects(40))
    render(<Explore onOpen={vi.fn()} />)
    // The whole point of the change: 40 projects must not all mount at once.
    await waitFor(() => expect(cards().length).toBe(12))
  })

  it('grows a page at a time when asked for more', async () => {
    const user = userEvent.setup()
    mockPaginated(makeProjects(40))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards()[0]).toHaveTextContent('Project 1'))

    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(24))
    expect(cards()[12]).toHaveTextContent('Project 13')

    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(36))
    expect(cards()[24]).toHaveTextContent('Project 25')
  })

  it('offers only the remainder on the final page, then stops', async () => {
    const user = userEvent.setup()
    mockPaginated(makeProjects(28))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(12))

    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(24))

    // Final chunk only has the 4 remaining projects.
    await user.click(loadMoreButton(4))
    await waitFor(() => expect(cards().length).toBe(28))

    // Nothing left to load — the control retires rather than sitting there inert.
    expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument()
  })

  it('does not show the control when everything already fits', async () => {
    mockPaginated(makeProjects(5))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(5))
    expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument()
  })

  it('reports progress through the list as text', async () => {
    mockPaginated(makeProjects(40))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/Showing 12 of 40 projects/i)).toBeInTheDocument())
  })

  it('falls back to the bundled registry when the API fails', async () => {
    mockGetProjectsPaginated.mockRejectedValue(new Error('offline'))
    render(<Explore onOpen={vi.fn()} />)
    // The fallback path must still paginate rather than dumping the list.
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    expect(cards().length).toBeLessThanOrEqual(12)
  })

  it('restarts at the first page when the filter changes', async () => {
    const user = userEvent.setup()
    mockPaginated([...makeProjects(20, 'Solar'), ...makeProjects(20, 'Wind', 20)])
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(12))

    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(24))

    // Switching filter yields a different list; carrying the old page over
    // would reveal more of the new list than a first page should.
    await user.click(screen.getByRole('button', { name: 'Wind' }))
    await waitFor(() => expect(cards().length).toBe(12))
    expect(cards()[0]).toHaveTextContent('Project 21')
  })

  it('fetches a second page from server when hasMore is true and in-memory projects are exhausted', async () => {
    const user = userEvent.setup()
    const all = makeProjects(60)
    mockGetProjectsPaginated.mockImplementation((page = 1, pageSize = 50) => {
      const start = (page - 1) * pageSize
      return Promise.resolve({
        projects: all.slice(start, start + pageSize),
        total: all.length,
        page,
        pageSize,
        hasMore: start + pageSize < all.length,
      })
    })

    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(12))

    // Step through the first 50 in-memory items
    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(24))
    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(36))
    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(48))
    await user.click(loadMoreButton(2))
    await waitFor(() => expect(cards().length).toBe(50))

    // In-memory 50 are exhausted, but hasMore is true on server
    expect(screen.getByRole('button', { name: /more/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /more/i }))

    await waitFor(() => expect(cards().length).toBe(60))
    expect(mockGetProjectsPaginated).toHaveBeenCalledWith(2, 50)
  })
})
