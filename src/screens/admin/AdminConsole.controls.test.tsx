/**
 * Behaviour of the admin console's write paths: circuit breakers and pause gating
 * (#695), and rollback plus double-submit protection on failed or pending
 * transactions (#692). These render the real component with the chain modules mocked.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { render } from '@/test/render'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminConsole } from './AdminConsole'
import type { PauseState } from '@/wallet/admin'
import { fetchProjectsPage, isRegistryConfigured } from '@/wallet/registry'
import { REGISTRY } from '@/data/admin'
import { fetchTotalAssets, fetchUtilizationBps } from '@/wallet/vault'

const mocks = vi.hoisted(() => ({
  address: 'GOWNER' as string | null,
  sign: vi.fn(),
  submitFundProject: vi.fn(),
  submitUpdateScores: vi.fn(),
  submitSetWhitelist: vi.fn(),
  submitSetPaused: vi.fn(),
  getPauseState: vi.fn(),
  getAdminRoles: vi.fn(),
  isMultisigDeployment: vi.fn(),
}))

vi.mock('@/wallet/WalletProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/wallet/WalletProvider')>()),
  useWallet: () => ({ address: mocks.address, sign: mocks.sign }),
}))

vi.mock('@/wallet/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/wallet/admin')>()),
  submitFundProject: mocks.submitFundProject,
  submitUpdateScores: mocks.submitUpdateScores,
  submitSetWhitelist: mocks.submitSetWhitelist,
  submitSetPaused: mocks.submitSetPaused,
  getPauseState: mocks.getPauseState,
  getAdminRoles: mocks.getAdminRoles,
  isMultisigDeployment: mocks.isMultisigDeployment,
}))

// No contract is configured in tests, so the console keeps its local figures.
vi.mock('@/wallet/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/wallet/registry')>()),
  fetchProjectsPage: vi.fn().mockResolvedValue({ projects: [] }),
  clearRegistryCache: vi.fn(),
  isRegistryConfigured: vi.fn(() => false),
}))

vi.mock('@/wallet/vault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/wallet/vault')>()),
  fetchTotalAssets: vi.fn().mockRejectedValue(new Error('not configured')),
  fetchUtilizationBps: vi.fn().mockRejectedValue(new Error('not configured')),
}))

const ownerRoles = {
  isVaultOwner: true,
  isRegistryOwner: true,
  isWhitelister: true,
  isMultisigSigner: false,
  isConfiguredAdmin: false,
  isAdmin: true,
}
const noRoles = {
  ...ownerRoles,
  isVaultOwner: false,
  isRegistryOwner: false,
  isWhitelister: false,
  isAdmin: false,
}

function pauseStates(vault: Partial<PauseState>, registry: Partial<PauseState> = {}) {
  return async (contract: 'vault' | 'registry') => {
    const base = { paused: false, emergencyAdmin: null }
    return contract === 'vault' ? { ...base, ...vault } : { ...base, ...registry }
  }
}

async function pauseRow(label: string): Promise<HTMLElement> {
  const section = (await screen.findByRole('heading', { name: 'Circuit breakers' })).closest(
    'section',
  )!
  return within(section).getByText(label).parentElement!.parentElement!
}

function liquidCell() {
  return screen.getByText('Liquid USDC').parentElement!
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.address = 'GOWNER'
  mocks.getAdminRoles.mockResolvedValue(ownerRoles)
  mocks.isMultisigDeployment.mockResolvedValue(false)
  mocks.getPauseState.mockImplementation(pauseStates({}))
  mocks.sign.mockResolvedValue('signed')
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  )
})

describe('AdminConsole circuit breakers (#695)', () => {
  it('shows a banner and locks the blocked forms while the vault is paused', async () => {
    mocks.getPauseState.mockImplementation(pauseStates({ paused: true }))
    render(<AdminConsole />)

    expect(
      await screen.findByText(/The vault is paused\. Deposits, withdrawals/),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Vault is paused').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Fund from the vault' })).toBeDisabled()
  })

  it('locks score updates and whitelisting while the registry is paused', async () => {
    mocks.getPauseState.mockImplementation(pauseStates({}, { paused: true }))
    render(<AdminConsole />)

    expect(await screen.findByText(/The registry is paused\. Score updates/)).toBeInTheDocument()
    expect(screen.getAllByText('Registry is paused').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Update on-chain scores' })).toBeDisabled()
    for (const button of screen.getAllByRole('button', { name: /^(Approve|Revoke)$/ })) {
      expect(button).toBeDisabled()
    }
  })

  it('shows no banner when neither contract is paused', async () => {
    render(<AdminConsole />)
    await waitFor(() => expect(mocks.getPauseState).toHaveBeenCalled())
    expect(screen.queryByText(/is paused\./)).not.toBeInTheDocument()
  })

  it('pauses the vault as owner with the no-argument path', async () => {
    render(<AdminConsole />)
    const vaultRow = await pauseRow('Investment vault')
    const pause = within(vaultRow).getByRole('button', { name: 'Pause' })
    await waitFor(() => expect(pause).toBeEnabled())
    fireEvent.click(pause)

    await waitFor(() =>
      expect(mocks.submitSetPaused).toHaveBeenCalledWith('vault', true, 'GOWNER', mocks.sign, {
        emergency: false,
      }),
    )
  })

  it('uses the emergency path when the connected wallet is the emergency admin and not the owner', async () => {
    mocks.address = 'GEMERGENCY'
    mocks.getAdminRoles.mockResolvedValue(noRoles)
    mocks.getPauseState.mockImplementation(
      pauseStates({ emergencyAdmin: 'GEMERGENCY' }, { emergencyAdmin: 'GEMERGENCY' }),
    )
    render(<AdminConsole />)

    const registryRow = await pauseRow('Project registry')
    const pause = await within(registryRow).findByRole('button', { name: 'Pause' })
    await waitFor(() => expect(pause).toBeEnabled())
    fireEvent.click(pause)

    await waitFor(() =>
      expect(mocks.submitSetPaused).toHaveBeenCalledWith(
        'registry',
        true,
        'GEMERGENCY',
        mocks.sign,
        {
          emergency: true,
        },
      ),
    )
  })

  it('does not offer pause controls to a wallet that is neither owner nor emergency admin', async () => {
    mocks.address = 'GSTRANGER'
    mocks.getAdminRoles.mockResolvedValue(noRoles)
    render(<AdminConsole />)

    const vaultRow = await pauseRow('Investment vault')
    await waitFor(() =>
      expect(within(vaultRow).getByRole('button', { name: 'Pause' })).toBeDisabled(),
    )
    expect(mocks.submitSetPaused).not.toHaveBeenCalled()
  })
})

describe('AdminConsole rollback and pending state (#692)', () => {
  async function fundAmount(amount: string) {
    const input = await screen.findByPlaceholderText('0.00')
    fireEvent.change(input, { target: { value: amount } })
    fireEvent.click(screen.getByRole('button', { name: 'Fund from the vault' }))
  }

  it('leaves the liquid figure unchanged when the transaction is rejected', async () => {
    mocks.submitFundProject.mockRejectedValue(new Error('User declined'))
    render(<AdminConsole />)
    const before = liquidCell().textContent

    await fundAmount('1000')

    await waitFor(() => expect(mocks.submitFundProject).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Fund from the vault' })).toBeEnabled(),
    )
    expect(liquidCell().textContent).toBe(before)
    expect((screen.getByPlaceholderText('0.00') as HTMLInputElement).value).toBe('1000')
  })

  it('moves the liquid figure only after the transaction resolves', async () => {
    let resolveTx: (hash: string) => void = () => {}
    mocks.submitFundProject.mockReturnValue(
      new Promise<{ hash: string }>((r) => (resolveTx = (hash) => r({ hash }))),
    )
    render(<AdminConsole />)
    const before = liquidCell().textContent

    await fundAmount('1000')
    expect(liquidCell().textContent).toBe(before)

    await act(async () => resolveTx('0xabc12345'))
    await waitFor(() => expect(liquidCell().textContent).not.toBe(before))
    expect((screen.getByPlaceholderText('0.00') as HTMLInputElement).value).toBe('')
  })

  it('sends one transaction for a double click while the first is pending', async () => {
    mocks.submitFundProject.mockReturnValue(new Promise(() => {}))
    render(<AdminConsole />)

    await fundAmount('1000')
    fireEvent.click(screen.getByRole('button', { name: 'Waiting for confirmation…' }))

    expect(mocks.submitFundProject).toHaveBeenCalledTimes(1)
  })
})

describe('AdminConsole reads from chain when a contract is configured', () => {
  it('shows the vault liquid and deployed figures read on mount', async () => {
    vi.mocked(fetchTotalAssets).mockResolvedValueOnce(1_000_000)
    vi.mocked(fetchUtilizationBps).mockResolvedValueOnce(5000)
    render(<AdminConsole />)

    await waitFor(() => expect(liquidCell().textContent).toContain('500,000'))
  })

  it('shows the credit re-read from chain after a confirmed update, not the submitted value', async () => {
    vi.mocked(isRegistryConfigured).mockReturnValue(true)
    const [first] = REGISTRY
    const projectsWithCredit = (credit: number) =>
      ({ projects: [{ ...first, name: 'Chain Project', credit, green: 66 }] }) as never
    vi.mocked(fetchProjectsPage)
      .mockResolvedValueOnce(projectsWithCredit(77))
      .mockResolvedValueOnce(projectsWithCredit(88))
    mocks.submitUpdateScores.mockResolvedValue({ hash: '0x1234abcd' })
    render(<AdminConsole />)

    const table = await screen.findByRole('table')
    await within(table).findByText('77')
    fireEvent.click(within(table).getByRole('button', { name: 'Update scores' }))
    fireEvent.change(within(table).getByLabelText(/credit quality/i), { target: { value: '12' } })
    fireEvent.click(within(table).getByRole('button', { name: /save/i }))

    await waitFor(() => expect(within(table).getByText('88')).toBeInTheDocument())
    expect(within(table).queryByText('12')).not.toBeInTheDocument()
    expect(mocks.submitUpdateScores).toHaveBeenCalledWith(
      first.id,
      12,
      66,
      'GOWNER',
      mocks.sign,
      false,
    )
  })
})
