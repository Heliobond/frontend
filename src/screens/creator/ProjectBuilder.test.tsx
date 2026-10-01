import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@/test/render'
import { ProjectBuilder } from './ProjectBuilder'
import * as registryModule from '@/wallet/registry'

const mockWallet = {
  address: 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX',
  connected: true,
  connecting: false,
  syncing: false,
  isDemo: false,
  restoring: false,
  connectionError: null,
  retryCount: 0,
  connect: vi.fn(),
  connectDemo: vi.fn(),
  disconnect: vi.fn(),
  retry: vi.fn(),
  sign: vi.fn().mockResolvedValue('mock-signed-xdr'),
  signMessage: vi.fn(),
  network: 'TESTNET' as const,
  setNetwork: vi.fn(),
  walletNetworkPassphrase: null,
  networkMismatch: false,
  checkWalletNetwork: vi.fn().mockResolvedValue(true),
}

vi.mock('@/wallet/WalletProvider', () => ({
  useWallet: () => mockWallet,
}))

describe('ProjectBuilder on-chain publishing (#697)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders metadata URI, maturity date, and publishing controls', () => {
    render(<ProjectBuilder />)
    expect(screen.getByLabelText(/metadata uri/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/maturity date/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download metadata\.json/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /publish to registry/i })).toBeInTheDocument()
  })

  it('validates invalid metadata URI on change and blur', async () => {
    render(<ProjectBuilder />)
    const uriInput = screen.getByLabelText(/metadata uri/i)
    fireEvent.change(uriInput, { target: { value: 'http://invalid-scheme.com' } })
    fireEvent.blur(uriInput)

    await waitFor(() => {
      expect(screen.getByText(/must start with ipfs:\/\/, https:\/\/, or ar:\/\//i)).toBeInTheDocument()
    })
  })

  it('validates maturity date in past', async () => {
    render(<ProjectBuilder />)
    const maturityInput = screen.getByLabelText(/maturity date/i)
    fireEvent.change(maturityInput, { target: { value: '2020-01-01' } })

    await waitFor(() => {
      expect(screen.getByText(/must be in the future/i)).toBeInTheDocument()
    })
  })

  it('handles not whitelisted error by directing creator to apply tab without wallet prompt', async () => {
    vi.spyOn(registryModule, 'submitCreateProject').mockRejectedValueOnce(
      new registryModule.NotWhitelistedError(),
    )

    render(<ProjectBuilder />)
    const publishBtn = screen.getByRole('button', { name: /publish to registry/i })
    fireEvent.click(publishBtn)

    await waitFor(() => {
      expect(screen.getByText(/wallet not whitelisted/i)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /apply for creator whitelist/i })).toHaveAttribute(
        'href',
        '/creator?tab=apply',
      )
    })
  })

  it('successfully publishes project and displays project ID and explorer link', async () => {
    vi.spyOn(registryModule, 'submitCreateProject').mockResolvedValueOnce({
      projectId: 42,
      hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    })

    render(<ProjectBuilder />)
    const publishBtn = screen.getByRole('button', { name: /publish to registry/i })
    fireEvent.click(publishBtn)

    await waitFor(() => {
      expect(screen.getByText(/project published on-chain/i)).toBeInTheDocument()
      expect(screen.getByText(/#42/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /view transaction on stellar explorer/i })).toBeInTheDocument()
    })
  })
})
