import { describe, it, expect, vi } from 'vitest'
import { StrictMode } from 'react'
import { render } from '@/test/render'
import { screen, fireEvent, waitFor, act } from '@testing-library/react'
import { YieldAlertProvider } from '../alerts/YieldAlertProvider'
import { ProjectDetail } from './ProjectDetail'
import { type Project } from '../data'
import { PROJECT_DETAILS, type ProjectDetail as ProjectDetailData } from '../data/projectDetails'
import { getExplorerTxUrl } from '../config/network'

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

  it('renders "Demo data" badge when source is "demo"', () => {
    renderDetail({ source: 'demo' })
    expect(screen.getByText('Demo data')).toBeInTheDocument()
  })

  it('hides "Demo data" badge when source is "registry" (live on-chain data)', () => {
    renderDetail({ source: 'registry' })
    expect(screen.queryByText('Demo data')).not.toBeInTheDocument()
  })

  it('defaults to "unverified" when verifiedMetadata prop is omitted (fail closed)', () => {
    renderDetail()

    expect(screen.getByText('Unverified metadata')).toBeInTheDocument()
    expect(screen.queryByText('Verified metadata')).not.toBeInTheDocument()
    expect(screen.queryByText('Metadata mismatch')).not.toBeInTheDocument()
  })
})

describe('ProjectDetail funding timeline explorer links (#703)', () => {
  function renderDetail(detail: ProjectDetailData) {
    return render(
      <YieldAlertProvider>
        <ProjectDetail project={mockProject} detail={detail} onInvest={vi.fn()} />
      </YieldAlertProvider>,
    )
  }

  it('links each funding event to the configured explorer with the full hash', () => {
    const detail = PROJECT_DETAILS[1]
    renderDetail(detail)

    for (const event of detail.fundingTimeline) {
      const link = screen.getByTitle(event.hash)
      expect(link).toHaveAttribute('href', getExplorerTxUrl(event.hash))
      expect(link).toHaveAttribute('target', '_blank')
    }

    const first = detail.fundingTimeline[0].hash
    const firstLink = screen.getByTitle(first)
    expect(firstLink.textContent).toContain('↗')
    expect(firstLink.textContent).not.toBe(first)
    expect(screen.queryByText(first)).not.toBeInTheDocument()
  })

  it('renders a malformed or truncated hash as text, not a link', () => {
    const truncated = '7c1e…b8f5'
    const detail: ProjectDetailData = {
      ...PROJECT_DETAILS[1],
      fundingTimeline: [
        {
          date: '12 Jan 2026',
          label: 'Funded from the pool',
          amount: '$180,000',
          hash: truncated,
        },
      ],
    }

    renderDetail(detail)

    const node = screen.getByTitle(truncated)
    expect(node.tagName).toBe('SPAN')
    expect(node).not.toHaveAttribute('href')
    expect(screen.getByText(truncated)).toBeVisible()
    expect(screen.queryByRole('link', { name: new RegExp(truncated) })).not.toBeInTheDocument()
  })
})

describe('ProjectDetail invest button pending state and error handling (#808)', () => {
  it('disables the button and marks it busy while pending', async () => {
    let resolveInvest: (url: string) => void = () => {}
    const onInvest = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveInvest = resolve
        }),
    )

    render(
      <YieldAlertProvider>
        <ProjectDetail project={mockProject} detail={mockDetail} onInvest={onInvest} />
      </YieldAlertProvider>,
    )

    const button = screen.getByRole('button', { name: /invest in the pool/i })
    expect(button).not.toBeDisabled()
    expect(button).not.toHaveAttribute('aria-busy', 'true')

    fireEvent.click(button)

    expect(onInvest).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')

    resolveInvest('/connect')
    await waitFor(() => {
      expect(button).not.toBeDisabled()
      expect(button).not.toHaveAttribute('aria-busy', 'true')
    })
  })

  it('ignores double-clicks and re-entry while an investment request is pending', async () => {
    let resolveInvest: (url: string) => void = () => {}
    const onInvest = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveInvest = resolve
        }),
    )

    render(
      <YieldAlertProvider>
        <ProjectDetail project={mockProject} detail={mockDetail} onInvest={onInvest} />
      </YieldAlertProvider>,
    )

    const button = screen.getByRole('button', { name: /invest in the pool/i })

    // Fire double-click rapidly
    fireEvent.click(button)
    fireEvent.click(button)

    expect(onInvest).toHaveBeenCalledTimes(1)

    resolveInvest('/connect')
    await waitFor(() => {
      expect(button).not.toBeDisabled()
    })
  })

  it('displays an error on rejection and re-enables the button', async () => {
    let rejectInvest: (err: unknown) => void = () => {}
    const onInvest = vi.fn().mockImplementation(
      () =>
        new Promise<string>((_, reject) => {
          rejectInvest = reject
        }),
    )

    render(
      <YieldAlertProvider>
        <ProjectDetail project={mockProject} detail={mockDetail} onInvest={onInvest} />
      </YieldAlertProvider>,
    )

    const button = screen.getByRole('button', { name: /invest in the pool/i })
    fireEvent.click(button)

    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')

    rejectInvest(new Error('Network error'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(button).not.toBeDisabled()
      expect(button).not.toHaveAttribute('aria-busy', 'true')
    })
  })
})

describe('ProjectDetail StrictMode mount flag (#1011)', () => {
  function renderStrict(onInvest: () => Promise<string>) {
    return render(
      <StrictMode>
        <YieldAlertProvider>
          <ProjectDetail project={mockProject} detail={mockDetail} onInvest={onInvest} />
        </YieldAlertProvider>
      </StrictMode>,
    )
  }

  it('clears pending state after a completed action under StrictMode', async () => {
    let resolveInvest: (url: string) => void = () => {}
    const onInvest = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveInvest = resolve
        }),
    )

    renderStrict(onInvest)
    const button = screen.getByRole('button', { name: /invest in the pool/i })
    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')

    resolveInvest('/connect')
    await waitFor(() => {
      expect(button).not.toBeDisabled()
      expect(button).not.toHaveAttribute('aria-busy', 'true')
    })
    expect(screen.getAllByRole('link', { name: /view investment/i }).length).toBeGreaterThan(0)
  })

  it('clears pending state after a failed action under StrictMode', async () => {
    let rejectInvest: (err: unknown) => void = () => {}
    const onInvest = vi.fn().mockImplementation(
      () =>
        new Promise<string>((_, reject) => {
          rejectInvest = reject
        }),
    )

    renderStrict(onInvest)
    const button = screen.getByRole('button', { name: /invest in the pool/i })
    fireEvent.click(button)
    expect(button).toBeDisabled()

    rejectInvest(new Error('Network error'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(button).not.toBeDisabled()
      expect(button).not.toHaveAttribute('aria-busy', 'true')
    })
  })

  it('ignores a late result after a genuine unmount', async () => {
    let resolveInvest: (url: string) => void = () => {}
    const onInvest = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveInvest = resolve
        }),
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const { unmount } = renderStrict(onInvest)
      fireEvent.click(screen.getByRole('button', { name: /invest in the pool/i }))
      unmount()

      resolveInvest('/connect')
      await act(async () => {
        await Promise.resolve()
      })

      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('ProjectDetail with backend-only data', () => {
  const backendDetail: ProjectDetailData = {
    ...mockDetail,
    name: 'Bond Project #42',
    story: '',
    creator: { name: '', verified: false, since: '' },
    scoreHistory: { credit: [], green: [] },
    fundingTimeline: [],
    priceHistory: [],
    missingSections: ['story', 'creator', 'scoreHistory', 'fundingTimeline', 'priceHistory'],
  }

  it('renders the id and returned scores with explicit missing-information states', () => {
    render(
      <YieldAlertProvider>
        <ProjectDetail
          project={{ ...mockProject, id: 42, name: 'Bond Project #42', credit: 77, green: 88 }}
          detail={backendDetail}
          onInvest={vi.fn()}
        />
      </YieldAlertProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Bond Project #42' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Credit quality: 77 out of 100' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Green impact: 88 out of 100' })).toBeInTheDocument()
    expect(screen.getByText('Creator information unavailable')).toBeInTheDocument()
    expect(screen.getByText('No project story is available.')).toBeInTheDocument()
    expect(
      screen.getByText('No on-chain score history is available for this project yet.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Verified creator/)).not.toBeInTheDocument()
  })

  it('does not crash when a caller passes a partial detail record', () => {
    const partialDetail = {
      ...backendDetail,
      creator: undefined,
      scoreHistory: undefined,
    } as unknown as ProjectDetailData

    expect(() =>
      render(
        <YieldAlertProvider>
          <ProjectDetail
            project={{ ...mockProject, id: 42 }}
            detail={partialDetail}
            onInvest={vi.fn()}
          />
        </YieldAlertProvider>,
      ),
    ).not.toThrow()
  })
})
