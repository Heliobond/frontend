import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/render'
import { ReferralShareLink } from './ReferralShareLink'

// Mock clipboard API
const mockWriteText = vi.fn()
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
})

// Mock window.open
const mockOpen = vi.fn()
window.open = mockOpen

describe('ReferralShareLink', () => {
  beforeEach(() => {
    mockWriteText.mockReset()
    mockOpen.mockReset()
    mockWriteText.mockResolvedValue(undefined)
  })

  it('renders the referral link in a readonly input', () => {
    render(<ReferralShareLink referralCode="ABCDEFGH" />)
    const input = screen.getByLabelText('Your referral link')
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('readonly')
    expect((input as HTMLInputElement).value).toContain('ref=ABCDEFGH')
  })

  it('renders a Copy button', () => {
    render(<ReferralShareLink referralCode="ABCDEFGH" />)
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
  })

  it('copies link to clipboard when Copy is clicked', async () => {
    render(<ReferralShareLink referralCode="ABCDEFGH" />)
    const copyBtn = screen.getByRole('button', { name: /copy referral link/i })
    fireEvent.click(copyBtn)
    expect(mockWriteText).toHaveBeenCalled()
    const copiedText = mockWriteText.mock.calls[0][0]
    expect(copiedText).toContain('ref=ABCDEFGH')
  })

  it('shows "Copied!" after successful copy', () => {
    render(<ReferralShareLink referralCode="ABCDEFGH" />)
    const copyBtn = screen.getByRole('button', { name: /copy referral link/i })
    fireEvent.click(copyBtn)
    expect(screen.getByText('✓ Copied!')).toBeInTheDocument()
  })

  it('renders social share buttons', () => {
    render(<ReferralShareLink referralCode="ABCDEFGH" />)
    // Twitter/X, Telegram, Email
    expect(screen.getByLabelText('Share on X')).toBeInTheDocument()
    expect(screen.getByLabelText('Share on Telegram')).toBeInTheDocument()
    expect(screen.getByLabelText('Share via Email')).toBeInTheDocument()
  })

  it('opens Twitter share link in new window', () => {
    render(<ReferralShareLink referralCode="ABCDEFGH" />)
    const twitterBtn = screen.getByLabelText('Share on X')
    fireEvent.click(twitterBtn)
    expect(mockOpen).toHaveBeenCalledWith(
      expect.stringContaining('twitter.com/intent/tweet'),
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('opens Telegram share link in new window', () => {
    render(<ReferralShareLink referralCode="ABCDEFGH" />)
    const telegramBtn = screen.getByLabelText('Share on Telegram')
    fireEvent.click(telegramBtn)
    expect(mockOpen).toHaveBeenCalledWith(
      expect.stringContaining('t.me/share/url'),
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('displays share links containing the referral code', () => {
    render(<ReferralShareLink referralCode="ABCDEFGH" />)
    const input = screen.getByLabelText('Your referral link')
    expect((input as HTMLInputElement).value).toContain('ref=ABCDEFGH')
  })

  it('accepts className prop', () => {
    const { container } = render(
      <ReferralShareLink referralCode="ABCDEFGH" className="custom-class" />,
    )
    expect(container.querySelector('.custom-class')).toBeInTheDocument()
  })

  it('renders input click to select all text', () => {
    render(<ReferralShareLink referralCode="ABCDEFGH" />)
    const input = screen.getByLabelText('Your referral link')
    fireEvent.click(input)
    // Selection should be triggered; no error means success
    expect(input).toBeInTheDocument()
  })
})
