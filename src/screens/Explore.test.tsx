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

describe('Explore — pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearch = ''
  })

  it('renders only the first page of a large registry', async () => {
    mockGetProjects.mockResolvedValue(makeProjects(40))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(6))
  })

  it('navigates between pages using Next and Previous buttons', async () => {
    const user = userEvent.setup()
    mockGetProjects.mockResolvedValue(makeProjects(40))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(6))
    expect(screen.getByText('Project 1')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /go to next page/i }))
    expect(cards().length).toBe(6)
    expect(screen.getByText('Project 7')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /go to previous page/i }))
    expect(cards().length).toBe(6)
    expect(screen.getByText('Project 1')).toBeInTheDocument()
  })

  it('does not show pagination when everything already fits', async () => {
    mockGetProjects.mockResolvedValue(makeProjects(5))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(5))
    expect(screen.queryByRole('navigation', { name: /pagination/i })).not.toBeInTheDocument()
  })

  it('reports progress through the list as text', async () => {
    mockGetProjects.mockResolvedValue(makeProjects(40))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/showing 1-6 of 40/i)).toBeInTheDocument())
  })

  it('falls back to the bundled registry when the API fails', async () => {
    mockGetProjects.mockRejectedValue(new Error('offline'))
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBeGreaterThan(0))
    expect(cards().length).toBeLessThanOrEqual(6)
  })

  it('restarts at the first page when the filter changes', async () => {
    const user = userEvent.setup()
    mockGetProjects.mockResolvedValue([...makeProjects(20, 'Solar'), ...makeProjects(20, 'Wind')])
    render(<Explore onOpen={vi.fn()} />)
    await waitFor(() => expect(cards().length).toBe(6))

    await user.click(screen.getByRole('button', { name: /go to next page/i }))
    expect(screen.getByText('Project 7')).toBeInTheDocument()

    // Switching filter yields a different list and resets to page 1
    await user.click(screen.getByRole('button', { name: 'Wind' }))
    await waitFor(() => expect(cards().length).toBe(6))
    expect(screen.getByText('Project 1')).toBeInTheDocument()
  })
})
