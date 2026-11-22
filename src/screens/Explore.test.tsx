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
    ProjectCard: ({ name, verifiedLabel }: { name: string; verifiedLabel?: string }) => (
      <article data-testid="card">
        <span>{name}</span>
        {verifiedLabel && <span data-testid="verified-label">{verifiedLabel}</span>}
      </article>
    ),
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
    // The filter lives in the URL, so a navigation has to update the mocked params.
    mockReplace.mockImplementation((url: string) => {
      mockSearch = url.includes('?') ? url.slice(url.indexOf('?')) : ''
    })
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

  it('follows URL filter changes from back/forward and falls back to All for invalid types', () => {
    const projects = [...makeProjects(2, 'Solar'), ...makeProjects(2, 'Wind', 2)]
    const props = { onOpen: vi.fn(), initialProjects: projects, initialTotal: projects.length }
    mockSearch = '?type=Solar'
    const { rerender } = render(<Explore {...props} />)

    expect(screen.getByRole('button', { name: 'Solar' })).toHaveAttribute('aria-pressed', 'true')
    expect(cards()).toHaveLength(2)

    mockSearch = '?type=Wind'
    rerender(<Explore {...props} />)
    expect(screen.getByRole('button', { name: 'Wind' })).toHaveAttribute('aria-pressed', 'true')
    expect(cards()).toHaveLength(2)
    expect(cards()[0]).toHaveTextContent('Project 3')

    mockSearch = '?type=water'
    rerender(<Explore {...props} />)
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(cards()).toHaveLength(4)
  })

  it('fetches a second page when hasMore is true and reaches all projects beyond 50', async () => {
    const user = userEvent.setup()
    const allProjects = makeProjects(60)

    mockGetProjectsPaginated.mockImplementation((page = 1, pageSize = 50) => {
      const start = (page - 1) * pageSize
      const slice = allProjects.slice(start, start + pageSize)
      return Promise.resolve({
        projects: slice,
        total: allProjects.length,
        page,
        pageSize,
        hasMore: start + pageSize < allProjects.length,
      })
    })

    render(<Explore onOpen={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('60 projects')).toBeInTheDocument())
    expect(cards().length).toBe(12)

    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(24))

    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(36))

    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(48))

    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(60))

    expect(mockGetProjectsPaginated).toHaveBeenCalledWith(2, 50)
    expect(cards()[59]).toHaveTextContent('Project 60')
    expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument()
  })

  it('preserves unrelated query parameters when selecting a type (#1057)', async () => {
    const user = userEvent.setup()
    mockSearch = '?yieldRange=4-8&campaign=fall'
    render(<Explore onOpen={vi.fn()} initialProjects={makeProjects(5)} />)

    await user.click(screen.getByRole('button', { name: 'Wind' }))
    expect(mockReplace).toHaveBeenCalledWith('/explore?yieldRange=4-8&campaign=fall&type=Wind', {
      scroll: false,
    })
  })

  it('removes type while preserving unrelated parameters when selecting All (#1057)', async () => {
    const user = userEvent.setup()
    mockSearch = '?type=Wind&campaign=fall&yieldRange=4-8'
    render(<Explore onOpen={vi.fn()} initialProjects={makeProjects(5)} />)

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(mockReplace).toHaveBeenCalledWith('/explore?campaign=fall&yieldRange=4-8', {
      scroll: false,
    })
  })

  it('routes to /explore with no query string when selecting All if type was the only parameter (#1057)', async () => {
    const user = userEvent.setup()
    mockSearch = '?type=Wind'
    render(<Explore onOpen={vi.fn()} initialProjects={makeProjects(5)} />)

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(mockReplace).toHaveBeenCalledWith('/explore', {
      scroll: false,
    })
  })

  it('reaches a matching project on page two from a zero-match first page (#1003)', async () => {
    const user = userEvent.setup()
    const firstPage = makeProjects(50)
    const target = { ...makeProjects(1, 'Solar', 50)[0], name: 'Hidden Gem' }
    mockPaginated([...firstPage, target])

    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(12))

    await user.type(screen.getByRole('searchbox'), 'Hidden Gem')
    expect(await screen.findByText('No projects found')).toBeInTheDocument()
    const searchMore = screen.getByRole('button', { name: 'Search remaining projects' })

    await user.click(searchMore)
    await waitFor(() => expect(cards().length).toBe(1))
    expect(cards()[0]).toHaveTextContent('Hidden Gem')
    expect(screen.queryByText('No projects found')).not.toBeInTheDocument()
  })

  it('keeps the empty state when the search is genuinely exhausted (#1003)', async () => {
    const user = userEvent.setup()
    mockPaginated(makeProjects(5))

    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(5))

    await user.type(screen.getByRole('searchbox'), 'nothing matches')
    expect(await screen.findByText('No projects found')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Search remaining projects' }),
    ).not.toBeInTheDocument()
  })

  it('displays actual verification age on project cards and omits label when timestamp is missing (#1005)', async () => {
    const now = Date.now()
    const projectsWithAges: Project[] = [
      {
        ...makeProjects(1)[0],
        id: 1,
        name: 'Project 2h Ago',
        lastVerifiedAt: now - 2 * 60 * 60 * 1000,
      },
      {
        ...makeProjects(1)[0],
        id: 2,
        name: 'Project 5d Ago',
        lastVerifiedAt: now - 5 * 24 * 60 * 60 * 1000,
      },
      {
        ...makeProjects(1)[0],
        id: 3,
        name: 'Project No Timestamp',
        lastVerifiedAt: undefined,
      },
    ]

    mockGetProjectsPaginated.mockResolvedValueOnce({
      projects: projectsWithAges,
      total: 3,
      page: 1,
      pageSize: 50,
      hasMore: false,
    })

    render(<Explore onOpen={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Project 2h Ago')).toBeInTheDocument())

    const verifiedLabels = screen.queryAllByTestId('verified-label')
    expect(verifiedLabels).toHaveLength(2)
    expect(verifiedLabels[0]).toHaveTextContent('verified 2h ago')
    expect(verifiedLabels[1]).toHaveTextContent('verified 5d ago')

    const noTimestampCard = screen.getByText('Project No Timestamp').closest('article')
    expect(noTimestampCard?.querySelector('[data-testid="verified-label"]')).toBeNull()
  })

  it('displays recoverable feedback on pagination failure and retries successfully (#1004)', async () => {
    const user = userEvent.setup()
    const allProjects = makeProjects(60)

    mockGetProjectsPaginated.mockImplementation((page = 1, pageSize = 50) => {
      if (page === 2) {
        return Promise.reject(new Error('network error'))
      }
      const start = (page - 1) * pageSize
      const slice = allProjects.slice(start, start + pageSize)
      return Promise.resolve({
        projects: slice,
        total: allProjects.length,
        page,
        pageSize,
        hasMore: start + pageSize < allProjects.length,
      })
    })

    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('60 projects')).toBeInTheDocument())
    expect(cards().length).toBe(12)

    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(24))

    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(36))

    await user.click(loadMoreButton(12))
    await waitFor(() => expect(cards().length).toBe(48))

    // This click requires page 2 fetch, which rejects!
    await user.click(loadMoreButton(12))

    // Already loaded cards must be preserved!
    await waitFor(() =>
      expect(screen.getByText('Failed to load more projects')).toBeInTheDocument(),
    )
    expect(cards().length).toBe(48)
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    expect(retryBtn).toBeInTheDocument()

    // Now make page 2 succeed on retry
    mockGetProjectsPaginated.mockImplementation((page = 1, pageSize = 50) => {
      const start = (page - 1) * pageSize
      const slice = allProjects.slice(start, start + pageSize)
      return Promise.resolve({
        projects: slice,
        total: allProjects.length,
        page,
        pageSize,
        hasMore: start + pageSize < allProjects.length,
      })
    })

    await user.click(retryBtn)

    await waitFor(() => expect(cards().length).toBe(60))
    expect(cards()[59]).toHaveTextContent('Project 60')
    expect(screen.queryByText('Failed to load more projects')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument()
  })
})
