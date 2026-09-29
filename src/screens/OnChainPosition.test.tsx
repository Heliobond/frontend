import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { OnChainPosition } from './OnChainPosition'
import { notifyTransactionConfirmed } from '../wallet/vaultEvents'
import { vaultEventStream } from '../lib/websocket'
import { fetchPortfolio } from '../wallet/vault'

vi.mock('../wallet/WalletProvider', () => ({
  useWallet: () => ({ address: 'GADDRESS', isDemo: false, sign: vi.fn() }),
}))
vi.mock('../wallet/vault', () => ({ fetchPortfolio: vi.fn(), submitClaimYield: vi.fn() }))
vi.mock('../components', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: () => <button>Claim yield</button>,
  StatBlock: ({ label, value }: { label: string; value: string }) => (
    <div>
      {label}: {value}
    </div>
  ),
  useToast: () => ({ toast: vi.fn() }),
}))
const portfolio = (shares: number) => ({
  shares,
  usdcValue: shares * 2,
  claimableYield: 1,
  shareOfPoolBps: 100,
  totalDeposited: shares * 2,
})
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_VAULT_CONTRACT_ID', 'CVAULT')
  vi.stubEnv('NEXT_PUBLIC_WS_URL', '')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  vi.mocked(fetchPortfolio).mockReset()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})
it('updates personal shares after a confirmed transaction and live vault event', async () => {
  vi.mocked(fetchPortfolio)
    .mockResolvedValueOnce(portfolio(1))
    .mockResolvedValueOnce(portfolio(2))
    .mockResolvedValueOnce(portfolio(3))
  render(<OnChainPosition />)
  await waitFor(() => expect(screen.getByTestId('onchain-shares')).toHaveTextContent('1.00'))
  act(() => notifyTransactionConfirmed())
  await waitFor(() => expect(screen.getByTestId('onchain-shares')).toHaveTextContent('2.00'))
  act(() => vaultEventStream.emit({ type: 'YieldReceived', contractId: 'CVAULT' }))
  await waitFor(() => expect(screen.getByTestId('onchain-shares')).toHaveTextContent('3.00'))
})
it('defers reads while hidden and refreshes on tab return', async () => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  vi.mocked(fetchPortfolio).mockResolvedValue(portfolio(4))
  render(<OnChainPosition />)
  act(() => notifyTransactionConfirmed())
  expect(fetchPortfolio).not.toHaveBeenCalled()
  act(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await waitFor(() => expect(screen.getByTestId('onchain-shares')).toHaveTextContent('4.00'))
  expect(fetchPortfolio).toHaveBeenCalledTimes(1)
})
