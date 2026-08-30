import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/render'
import { SocialAccountConflictWarning } from './SocialAccountConflictWarning'

describe('SocialAccountConflictWarning', () => {
  it('renders provider conflict title, description, and action button', () => {
    render(
      <SocialAccountConflictWarning
        provider="google"
        email="alex.doe@gmail.com"
        onContinueWithProvider={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.getByText('Existing Google account detected')).toBeInTheDocument()
    expect(
      screen.getByText(/The email alex.doe@gmail.com is already registered using your Google account/),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  })

  it('triggers onContinueWithProvider with the correct provider when CTA is clicked', () => {
    const onContinue = vi.fn()
    render(
      <SocialAccountConflictWarning
        provider="google"
        email="alex.doe@gmail.com"
        onContinueWithProvider={onContinue}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }))
    expect(onContinue).toHaveBeenCalledWith('google')
  })

  it('renders optional link anyway secondary action when provided', () => {
    const onProceed = vi.fn()
    render(
      <SocialAccountConflictWarning
        provider="apple"
        email="user@icloud.com"
        onContinueWithProvider={vi.fn()}
        onProceedWithEmail={onProceed}
      />,
    )

    const linkAnywayBtn = screen.getByRole('button', { name: 'Link this email to my account' })
    expect(linkAnywayBtn).toBeInTheDocument()

    fireEvent.click(linkAnywayBtn)
    expect(onProceed).toHaveBeenCalledTimes(1)
  })
})
