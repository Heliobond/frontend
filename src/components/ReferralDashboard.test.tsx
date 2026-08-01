import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/render'
import { ReferralDashboard } from './ReferralDashboard'

// Mock the referral library
vi.mock('@/lib/referral', () => ({
  fetchReferralStats: vi.fn(),
  fetchReferralHistory: vi.fn(),
  generateReferralCode: vi.fn(() => 'ABCDEFGH'),
  buildReferralLink: vi.fn(
    (code: string) => `https://heliobond.vercel.app/referral?ref=${code}`,
  ),
  generateShareLinks: vi.fn(() => [
    { platform: 'twitter', label: 'Share on X', url: 'https://twitter.com/...', icon: 'twitter' },
    { platform: 'telegram', label: 'Share on Telegram', url: 'https://t.me/...', icon: 'telegram' },
    { platform: 'email', label: 'Share via Email', url: 'mailto:...', icon: 'email' },
    { platform: 'clipboard', label: 'Copy Link', url: 'https://heliobond.vercel.app/referral?ref=ABCDEFGH', icon: 'clipboard' },
  ]),
}))

// Mock clipboard
const mockWriteText = vi.fn()
Object.assign(navigator, {
  clipboard: { writeText: mockWriteText },
})

const { fetchReferralStats, fetchReferralHistory } = vi.mocked(
  await import('@/lib/referral'),
)

describe('ReferralDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWriteText.mockReset()
    mockWriteText.mockResolvedValue(undefined)
    fetchReferralStats.mockResolvedValue({
      totalReferred: 5,
      rewardsEarned: 25,
      rewardsPending: 10,
      referralCode: 'ABCDEFGH',
      referralLink: 'https://heliobond.vercel.app/referral?ref=ABCDEFGH',
    })
    fetchReferralHistory.mockResolvedValue([
      {
        refereeAddress: 'GDEMO...REF1',
        createdAt: '2026-07-25T00:00:00Z',
        completed: true,
        rewardAmount: 5,
        txHash: 'tx_001',
      },
      {
        refereeAddress: 'GDEMO...REF2',
        createdAt: '2026-07-20T00:00:00Z',
        completed: false,
        rewardAmount: 0,
        txHash: '',
      },
    ])
  })

  it('shows loading state initially', () => {
    render(<ReferralDashboard walletAddress="GDEMO..." />)
    expect(screen.getByText(/loading/i).closest('[aria-busy]')).toBeInTheDocument()
  })

  it('shows stats after loading', async () => {
    render(<ReferralDashboard walletAddress="GDEMO..." />)
    expect(await screen.findByText('Total Referrals')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('$25')).toBeInTheDocument()
    expect(screen.getByText('$10')).toBeInTheDocument()
  })

  it('shows referral link input', async () => {
    render(<ReferralDashboard walletAddress="GDEMO..." />)
    expect(await screen.findByLabelText('Your referral link')).toBeInTheDocument()
  })

  it('shows referral history', async () => {
    render(<ReferralDashboard walletAddress="GDEMO..." />)
    expect(await screen.findByText('Referral History')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('shows empty state when no wallet address', async () => {
    render(<ReferralDashboard walletAddress="" />)
    expect(
      await screen.findByText(/connect your stellar wallet/i),
    ).toBeInTheDocument()
  })

  it('shows "How It Works" section', async () => {
    render(<ReferralDashboard walletAddress="GDEMO..." />)
    expect(await screen.findByText('How It Works')).toBeInTheDocument()
    expect(screen.getByText(/Share/)).toBeInTheDocument()
    expect(screen.getByText(/sign up/)).toBeInTheDocument()
    expect(screen.getByText(/First deposit/)).toBeInTheDocument()
    expect(screen.getByText(/Both earn/)).toBeInTheDocument()
  })

  it('shows empty history message when no referrals', async () => {
    fetchReferralHistory.mockResolvedValue([])
    render(<ReferralDashboard walletAddress="GDEMO..." />)
    expect(
      await screen.findByText(/no referrals yet/i),
    ).toBeInTheDocument()
  })

  it('shows error state with retry button', async () => {
    fetchReferralStats.mockRejectedValue(new Error('Network error'))
    render(<ReferralDashboard walletAddress="GDEMO..." />)
    expect(await screen.findByText(/unable to load/i)).toBeInTheDocument()
    const retryBtn = screen.getByText('Retry')
    expect(retryBtn).toBeInTheDocument()

    // Retry should call load again
    fetchReferralStats.mockResolvedValue({
      totalReferred: 1,
      rewardsEarned: 5,
      rewardsPending: 0,
      referralCode: 'ABCDEFGH',
      referralLink: 'https://...',
    })
    fireEvent.click(retryBtn)
    expect(await screen.findByText('Total Referrals')).toBeInTheDocument()
  })

  it('accepts className prop', async () => {
    const { container } = render(
      <ReferralDashboard walletAddress="GDEMO..." className="custom-dash" />,
    )
    expect(
      await container.querySelector('.custom-dash'),
    ).toBeInTheDocument()
  })
})
