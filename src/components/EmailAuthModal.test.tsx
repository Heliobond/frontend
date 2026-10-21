import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import { ThemeProvider } from '@/theme/ThemeProvider'
import en from '../../messages/en.json'
import { EmailAuthModal } from './EmailAuthModal'

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
})
