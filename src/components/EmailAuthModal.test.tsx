import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { describe, expect, test, vi } from '@/test/bun'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { ThemeProvider } from '@/theme/ThemeProvider'
import en from '../../messages/en.json'
import { EmailAuthModal } from './EmailAuthModal'
import { loginBiometric, registerBiometric } from '../lib/webauthn'

vi.mock('../lib/webauthn', () => ({
  loginBiometric: vi.fn(),
  registerBiometric: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loginBiometric).mockResolvedValue({ verified: true })
  vi.mocked(registerBiometric).mockResolvedValue({ verified: true })
})

function renderModal(props: Partial<React.ComponentProps<typeof EmailAuthModal>> = {}) {
  const ui = (p: typeof props) => (
    <LocaleProvider initialLocale="en" initialMessages={en}>
      <ThemeProvider>
        <EmailAuthModal open onClose={vi.fn()} {...p} />
      </ThemeProvider>
    </LocaleProvider>
  )
  const view = rtlRender(ui(props))
  return { ...view, update: (next: typeof props) => view.rerender(ui(next)) }
}

const submit = (email = 'a@example.com') => {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: /continue with email|sending/i }))
}

describe('EmailAuthModal send lifecycle', () => {
  test('shows "link sent" only after the send resolves', async () => {
    let resolve!: () => void
    const onSuccess = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    renderModal({ onSuccess })
    submit()
    expect(screen.queryByText(/magic sign-in link has been sent/i)).not.toBeInTheDocument()
    resolve()
    await waitFor(() =>
      expect(screen.getByText(/magic sign-in link has been sent/i)).toBeInTheDocument(),
    )
  })

  test('a rejected send shows an error and keeps the form usable', async () => {
    renderModal({ onSuccess: vi.fn().mockRejectedValue(new Error('boom')) })
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(en.AccountConflict.sendError)
    expect(screen.queryByText(/magic sign-in link has been sent/i)).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('you@example.com')).toBeEnabled()
    expect(screen.getByRole('button', { name: /continue with email/i })).toBeEnabled()
  })

  test('reopening shows a fresh form', async () => {
    const onSuccess = vi.fn().mockResolvedValue(undefined)
    const { update } = renderModal({ onSuccess })
    submit()
    await screen.findByText(/magic sign-in link has been sent/i)
    update({ open: false, onSuccess })
    update({ open: true, onSuccess })
    expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('')
    expect(screen.queryByText(/magic sign-in link has been sent/i)).not.toBeInTheDocument()
  })

  test('a delayed send confirms the submitted address, not a later edit', async () => {
    let resolve!: () => void
    const onSuccess = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    renderModal({ onSuccess })
    submit('alice@example.com')

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'mallory@example.com' },
    })
    resolve()

    const confirmation = await screen.findByText(/magic sign-in link has been sent/i)
    expect(confirmation).toHaveTextContent('alice@example.com')
    expect(confirmation).not.toHaveTextContent('mallory@example.com')
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith('alice@example.com')
  })

  test('a failed send can be corrected and retried', async () => {
    const onSuccess = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    renderModal({ onSuccess })

    submit('wrong@example.com')
    expect(await screen.findByRole('alert')).toHaveTextContent(en.AccountConflict.sendError)

    submit('fixed@example.com')
    const confirmation = await screen.findByText(/magic sign-in link has been sent/i)
    expect(confirmation).toHaveTextContent('fixed@example.com')
    expect(onSuccess).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenLastCalledWith('fixed@example.com')
  })
})

describe('EmailAuthModal biometric completion', () => {
  test('biometric login reports completion once without requesting an email link', async () => {
    const onSuccess = vi.fn().mockResolvedValue(undefined)
    const onBiometricComplete = vi.fn()
    renderModal({ onSuccess, onBiometricComplete })

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'bio@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /face id \/ touch id login/i }))

    await waitFor(() => expect(onBiometricComplete).toHaveBeenCalledTimes(1))
    expect(onBiometricComplete).toHaveBeenCalledWith('bio@example.com')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(loginBiometric).toHaveBeenCalledWith('bio@example.com')
  })

  test('biometric registration reports completion once without requesting an email link', async () => {
    const onSuccess = vi.fn().mockResolvedValue(undefined)
    const onBiometricComplete = vi.fn()
    renderModal({ onSuccess, onBiometricComplete })

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'register@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /register biometric/i }))

    await waitFor(() => expect(onBiometricComplete).toHaveBeenCalledTimes(1))
    expect(onBiometricComplete).toHaveBeenCalledWith('register@example.com')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(registerBiometric).toHaveBeenCalledWith('register@example.com')
    expect(loginBiometric).toHaveBeenCalledWith('register@example.com')
  test('without a social redirect handler the conflict offers only the email path', async () => {
    const onSuccess = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderModal({ onSuccess, onClose })

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'alex.doe@gmail.com' },
    })

    expect(screen.getByText(/Existing Google account detected/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sign in with Google/i })).not.toBeInTheDocument()

    const emailAction = screen.getByRole('button', { name: /Link this email to my account/i })
    fireEvent.click(emailAction)

    // The entry survives and the user can continue by email.
    expect(screen.getByPlaceholderText('you@example.com')).toHaveValue('alex.doe@gmail.com')
    fireEvent.click(screen.getByRole('button', { name: /continue with email/i }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('alex.doe@gmail.com'))
    expect(onClose).not.toHaveBeenCalled()
  })

  test('with a redirect handler the selected provider is forwarded once', () => {
    const onSocialLogin = vi.fn()
    const onClose = vi.fn()
    renderModal({ onSocialLogin, onClose })

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'alex.doe@gmail.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Sign in with Google/i }))

    expect(onSocialLogin).toHaveBeenCalledTimes(1)
    expect(onSocialLogin).toHaveBeenCalledWith('google')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
