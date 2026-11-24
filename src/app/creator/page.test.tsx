import { describe, expect, it, vi } from '@/test/bun'
import en from '../../../messages/en.json'

const nav = {
  tab: 'build',
  replace: vi.fn(),
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: (url: string) => {
      const params = new URL(url, 'http://localhost').searchParams
      nav.tab = params.get('tab') ?? 'apply'
      nav.replace(url)
    },
  }),
  useSearchParams: () => new URLSearchParams(`tab=${nav.tab}`),
}))

vi.mock('@/wallet/WalletProvider', () => ({
  useWallet: () => ({ address: null, sign: vi.fn() }),
}))

const { fireEvent, render, screen } = await import('@/test/render')
const { default: CreatorPage } = await import('./page')

function goTo(tab: string, rerender: (ui: React.ReactNode) => void) {
  fireEvent.click(
    screen.getByRole('tab', { name: en.Creator[`tab${tab}` as keyof typeof en.Creator] as string }),
  )
  rerender(<CreatorPage />)
}

describe('creator workspace drafts', () => {
  it('keeps a typed project name and story across a dashboard round trip', () => {
    nav.tab = 'build'
    const { rerender } = render(<CreatorPage />)

    fireEvent.change(screen.getByLabelText(en.Creator.fieldName), {
      target: { value: 'Sunrise Co-op Array' },
    })
    fireEvent.change(screen.getByLabelText(en.Creator.fieldStory), {
      target: { value: 'A story that must survive a tab change.' },
    })

    goTo('Dashboard', rerender)
    goTo('Build', rerender)

    expect(screen.getByLabelText(en.Creator.fieldName)).toHaveValue('Sunrise Co-op Array')
    expect(screen.getByLabelText(en.Creator.fieldStory)).toHaveValue(
      'A story that must survive a tab change.',
    )
  })

  it('keeps application fields independently of the project draft', () => {
    nav.tab = 'apply'
    const { rerender } = render(<CreatorPage />)

    fireEvent.change(screen.getByLabelText(en.Creator.fieldOrg), {
      target: { value: 'Valley Energy Cooperative' },
    })

    goTo('Build', rerender)
    goTo('Apply', rerender)
    expect(screen.getByLabelText(en.Creator.fieldOrg)).toHaveValue('Valley Energy Cooperative')

    // Typing in the project form does not disturb the application draft.
    goTo('Build', rerender)
    fireEvent.change(screen.getByLabelText(en.Creator.fieldName), {
      target: { value: 'Independent Project' },
    })
    goTo('Apply', rerender)
    expect(screen.getByLabelText(en.Creator.fieldOrg)).toHaveValue('Valley Energy Cooperative')
  })
})
