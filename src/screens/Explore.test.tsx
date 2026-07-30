import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/render'
import userEvent from '@testing-library/user-event'

const mockReplace = vi.fn()
let mockSearch = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}))

vi.mock('@/lib/api', () => ({ getProjects: vi.fn() }))

vi.mock('../components', async () => {
  const actual = await vi.importActual<typeof import('../components')>('../components')
  return {
    ...actual,
    ProjectCard: ({ name }: { name: string }) => <article data-testid="card">{name}</article>,
  }
})

import { getProjects } from '@/lib/api'
import { Explore } from './Explore'
import type { Project, ProjectType } from '../data'

const mockGetProjects = vi.mocked(getProjects)

/** A registry large enough to span several pages. */
function makeProjects(count: number, type: ProjectType = 'Solar'): Project[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    name: `Project ${i + 1}`,
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

describe('Explore — incremental loading', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearch = ''
  })

  it('renders only the first page of a large registry', async () => {
    mockGetProjects.mockResolvedValue(makeProjects(40))
    render(<Explore onOpen={vi.fn()} />)
    // The whole point of the change: 40 projects must not all mount at once.
    await waitFor(() => expect(cards().length).toBe(12))
  })

  it('grows a page at a time when asked for more', async () => {
    const user = userEvent.setup()
    mockGetProjects.mockResolvedValue(makeProjects(40))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(12))

    await user.click(screen.getByRole('button', { name: /show 12 more/i }))
    expect(cards().length).toBe(24)

    await user.click(screen.getByRole('button', { name: /show 12 more/i }))
    expect(cards().length).toBe(36)
  })

  it('offers only the remainder on the final page, then stops', async () => {
    const user = userEvent.setup()
    mockGetProjects.mockResolvedValue(makeProjects(14))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(12))

    // 2 left, so the control must not promise a full page of 12.
    const more = screen.getByRole('button', { name: /show 2 more/i })
    await user.click(more)

    expect(cards().length).toBe(14)
    // Nothing left to load — the control retires rather than sitting there inert.
    expect(screen.queryByRole('button', { name: /show .* more/i })).not.toBeInTheDocument()
  })

  it('does not show the control when everything already fits', async () => {
    mockGetProjects.mockResolvedValue(makeProjects(5))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(5))
    expect(screen.queryByRole('button', { name: /show .* more/i })).not.toBeInTheDocument()
  })

  it('reports progress through the list as text', async () => {
    mockGetProjects.mockResolvedValue(makeProjects(40))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/showing 12 of 40 projects/i)).toBeInTheDocument())
  })

  it('falls back to the bundled registry when the API fails', async () => {
    mockGetProjects.mockRejectedValue(new Error('offline'))
    render(<Explore onOpen={vi.fn()} />)
    // The fallback path must still paginate rather than dumping the list.
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    expect(cards().length).toBeLessThanOrEqual(12)
  })

  it('restarts at the first page when the filter changes', async () => {
    const user = userEvent.setup()
    mockGetProjects.mockResolvedValue([...makeProjects(20, 'Solar'), ...makeProjects(20, 'Wind')])
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(12))

    await user.click(screen.getByRole('button', { name: /show 12 more/i }))
    expect(cards().length).toBe(24)

    // Switching filter yields a different list; carrying the old depth over
    // would reveal more of the new list than a first page should.
    await user.click(screen.getByRole('button', { name: 'Wind' }))
    await waitFor(() => expect(cards().length).toBe(12))
  })
})
