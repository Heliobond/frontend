import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@/test/render'
import { Landing } from './Landing'

const REGISTRY_A = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const VAULT_A = 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
const REGISTRY_B = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'
const VAULT_B = 'CDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'

function renderLanding() {
  return render(<Landing onConnect={vi.fn()} onExplore={vi.fn()} />)
}

describe('Landing verification panel (#1069)', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each([
    [REGISTRY_A, VAULT_A],
    [REGISTRY_B, VAULT_B],
  ])('shows the full configured registry and vault ids (%s, %s)', (registry, vault) => {
    vi.stubEnv('NEXT_PUBLIC_REGISTRY_CONTRACT_ID', registry)
    vi.stubEnv('NEXT_PUBLIC_VAULT_CONTRACT_ID', vault)
    renderLanding()
    const ids = screen.getAllByTestId('contract-id').map((n) => n.textContent)
    expect(ids).toEqual([registry, vault])
    expect(screen.getAllByTestId('contract-id')[0]).toHaveAttribute('title', registry)
    expect(screen.queryByTestId('contract-unconfigured')).not.toBeInTheDocument()
  })

  it('never shows the old placeholder strings', () => {
    vi.stubEnv('NEXT_PUBLIC_REGISTRY_CONTRACT_ID', REGISTRY_A)
    vi.stubEnv('NEXT_PUBLIC_VAULT_CONTRACT_ID', VAULT_A)
    renderLanding()
    expect(screen.queryByText('C…7K4Z')).not.toBeInTheDocument()
    expect(screen.queryByText('C…9QWJ')).not.toBeInTheDocument()
  })

  it('labels an unconfigured deployment instead of showing placeholders', () => {
    vi.stubEnv('NEXT_PUBLIC_REGISTRY_CONTRACT_ID', '')
    vi.stubEnv('NEXT_PUBLIC_VAULT_CONTRACT_ID', '   ')
    renderLanding()
    expect(screen.queryAllByTestId('contract-id')).toHaveLength(0)
    expect(screen.getAllByTestId('contract-unconfigured')).toHaveLength(2)
    expect(screen.getAllByText('Not configured for this deployment')).toHaveLength(2)
    expect(screen.queryByText('C…7K4Z')).not.toBeInTheDocument()
  })

  it('handles one configured and one missing id independently', () => {
    vi.stubEnv('NEXT_PUBLIC_REGISTRY_CONTRACT_ID', REGISTRY_A)
    vi.stubEnv('NEXT_PUBLIC_VAULT_CONTRACT_ID', '')
    renderLanding()
    expect(screen.getAllByTestId('contract-id').map((n) => n.textContent)).toEqual([REGISTRY_A])
    expect(screen.getAllByTestId('contract-unconfigured')).toHaveLength(1)
  })
})
