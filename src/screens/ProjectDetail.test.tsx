import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/render'
import { YieldAlertProvider } from '../alerts/YieldAlertProvider'
import { ProjectDetail } from './ProjectDetail'
import { type Project } from '../data'
import { type ProjectDetail as ProjectDetailData } from '../data/projectDetails'

const mockProject: Project = {
  id: 1,
  name: 'Helio Alpha Solar',
  location: 'Provence, France',
  type: 'Solar',
  credit: 90,
  green: 95,
  funded: '$500,000',
  fundedAmount: 500000,
  fundingGoal: 1000000,
  priceHistory: [],
}

const mockDetail: ProjectDetailData = {
  name: 'Helio Alpha Solar',
  location: 'Provence, France',
  heroGradient: 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(16,185,129,0.2) 100%)',
  creator: {
    name: 'Helio Energy',
    verified: true,
    since: '2025',
  },
  story: 'Community solar project.',
  scoreHistory: { credit: [], green: [] },
  priceHistory: [],
  fundingGoal: 1000000,
  fundedAmount: 500000,
  fundingTimeline: [],
}

describe('ProjectDetail metadata verification badge', () => {
  const defaultProps = {
    project: mockProject,
    detail: mockDetail,
    onInvest: vi.fn().mockResolvedValue('/connect'),
  }

  function renderDetail(props = {}) {
    return render(
      <YieldAlertProvider>
        <ProjectDetail {...defaultProps} {...props} />
      </YieldAlertProvider>,
    )
  }

  it('renders "Verified metadata" growth badge when verifiedMetadata is "verified"', () => {
    renderDetail({ verifiedMetadata: 'verified' })

    expect(screen.getByText('Verified metadata')).toBeInTheDocument()
    expect(screen.queryByText('Metadata mismatch')).not.toBeInTheDocument()
    expect(screen.queryByText('Unverified metadata')).not.toBeInTheDocument()
  })

  it('renders "Metadata mismatch" ember status badge when verifiedMetadata is "mismatch"', () => {
    renderDetail({ verifiedMetadata: 'mismatch' })

    const mismatchBadge = screen.getByText('Metadata mismatch')
    expect(mismatchBadge).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('Verified metadata')).not.toBeInTheDocument()
    expect(screen.queryByText('Unverified metadata')).not.toBeInTheDocument()
  })

  it('renders "Unverified metadata" neutral badge when verifiedMetadata is "unverified"', () => {
    renderDetail({ verifiedMetadata: 'unverified' })

    expect(screen.getByText('Unverified metadata')).toBeInTheDocument()
    expect(screen.queryByText('Verified metadata')).not.toBeInTheDocument()
    expect(screen.queryByText('Metadata mismatch')).not.toBeInTheDocument()
  })

  it('defaults to "unverified" when verifiedMetadata prop is omitted (fail closed)', () => {
    renderDetail()

    expect(screen.getByText('Unverified metadata')).toBeInTheDocument()
    expect(screen.queryByText('Verified metadata')).not.toBeInTheDocument()
    expect(screen.queryByText('Metadata mismatch')).not.toBeInTheDocument()
  })
})
