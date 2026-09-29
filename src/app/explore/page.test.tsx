import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/render'
import ExplorePage, { metadata } from './page'

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

describe('ExplorePage (Server Component)', () => {
  it('exports valid metadata for SEO', () => {
    expect(metadata.title).toBeDefined()
    expect(metadata.description).toBeDefined()
  })

  it('renders initial projects pre-fetched on the server without initial loading state', async () => {
    const pageElement = await ExplorePage()
    render(pageElement)
    expect(screen.getByText('Server Rendered Solar')).toBeInTheDocument()
  })
})
