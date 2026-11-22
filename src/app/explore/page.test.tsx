import { describe, it, expect, vi } from '@/test/bun'
import en from '../../../messages/en.json'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}))

vi.mock('../../lib/api', () => ({
  getProjectsPaginated: vi.fn().mockResolvedValue({
    projects: [
      {
        id: 1,
        name: 'Server Rendered Solar',
        location: 'Spain',
        type: 'Solar',
        credit: 90,
        green: 95,
        funded: '$100,000',
        fundedAmount: 100000,
        fundingGoal: 200000,
        priceHistory: [],
      },
    ],
    total: 1,
    page: 1,
    pageSize: 12,
    hasMore: false,
  }),
  shouldShowDemoBadge: () => false,
}))

const { render, screen } = await import('@/test/render')
const { getProjectsPaginated } = await import('../../lib/api')
const { default: ExplorePage, generateMetadata } = await import('./page')

describe('ExplorePage (Server Component)', () => {
  it('generates a localized title and description for SEO', async () => {
    const meta = await generateMetadata()
    expect(meta.title).toMatchObject({ default: en.Metadata.explore.title })
    expect(meta.description).toBe(en.Metadata.explore.description)
    // Indexable public content — never noindex.
    expect(meta.robots).toBeUndefined()
  })

  it('renders initial projects pre-fetched on the server without initial loading state', async () => {
    const pageElement = await ExplorePage()
    render(pageElement)
    expect(screen.getByText('Server Rendered Solar')).toBeInTheDocument()
  })

  it('renders a successful empty server page without refetching on the client', async () => {
    const getProjects = vi.mocked(getProjectsPaginated)
    getProjects.mockClear()
    getProjects.mockResolvedValueOnce({
      projects: [],
      total: 0,
      page: 1,
      pageSize: 50,
      hasMore: false,
    })

    render(await ExplorePage())

    expect(screen.getByText(en.Explore.emptyTitle)).toBeInTheDocument()
    expect(getProjects).toHaveBeenCalledExactlyOnceWith(1, 50)
  })

  it('retries on the client when page one was unavailable on the server', async () => {
    const getProjects = vi.mocked(getProjectsPaginated)
    getProjects.mockClear()
    getProjects.mockRejectedValueOnce(new Error('Registry unavailable'))

    render(await ExplorePage())

    expect(await screen.findByText('Server Rendered Solar')).toBeInTheDocument()
    expect(getProjects).toHaveBeenCalledTimes(2)
    expect(getProjects).toHaveBeenNthCalledWith(2, 1, 50)
  })
})
