import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render as rtlRender, waitFor } from '@testing-library/react'
import { render, screen, fireEvent, act } from '@/test/render'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import en from '../../../messages/en.json'
import fr from '../../../messages/fr.json'
import { ProjectBuilder } from './ProjectBuilder'
import {
  CreateProjectError,
  simulateCreateProject,
  submitCreateProject,
} from '../../wallet/createProject'

const CREATOR = 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX'
const TX_HASH = 'a'.repeat(64)

const wallet = vi.hoisted(() => ({
  address: 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX',
  sign: vi.fn(),
}))

vi.mock('../../wallet/WalletProvider', () => ({
  useWallet: () => wallet,
}))

vi.mock('../../wallet/createProject', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../wallet/createProject')>()
  return {
    ...actual,
    simulateCreateProject: vi.fn(),
    submitCreateProject: vi.fn(),
  }
})

const goalInput = () => screen.getByLabelText(en.Creator.fieldGoal)
const typeGoal = (value: string) => fireEvent.change(goalInput(), { target: { value } })
const flushPreview = (ms = 250) => act(() => vi.advanceTimersByTime(ms))

describe('ProjectBuilder', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('previews the draft goal without an error', () => {
    render(<ProjectBuilder />)
    expect(screen.getByText('$0 of $250,000')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(goalInput()).toHaveAttribute('aria-invalid', 'false')
  })

  it.each(['1,5', '1.2.3', 'abc', '', '1e6', '0'])(
    'flags %j as invalid and links the error to the input',
    (value) => {
      render(<ProjectBuilder />)
      typeGoal(value)
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(en.Creator.goalInvalid)
      expect(goalInput()).toHaveAttribute('aria-invalid', 'true')
      expect(goalInput()).toHaveAttribute('aria-describedby', alert.id)
    },
  )

  it('rejects a goal above the maximum and accepts the maximum itself', () => {
    render(<ProjectBuilder />)
    typeGoal('100,000,001')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a funding goal of at most $100,000,000',
    )
    typeGoal('100,000,000')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('updates the preview 250ms after typing stops', () => {
    render(<ProjectBuilder />)
    typeGoal('1,250')
    flushPreview(249)
    expect(screen.getByText('$0 of $250,000')).toBeInTheDocument()
    flushPreview(1)
    expect(screen.getByText('$0 of $1,250')).toBeInTheDocument()
  })

  it('previews "awaiting funding" while the goal is invalid', () => {
    render(<ProjectBuilder />)
    typeGoal('1,5')
    flushPreview()
    expect(screen.getByText(en.Creator.awaitingFunding)).toBeInTheDocument()
  })

  it('writes the project name into the preview card', () => {
    render(<ProjectBuilder />)
    fireEvent.change(screen.getByLabelText(en.Creator.fieldName), {
      target: { value: 'Atacama wind' },
    })
    flushPreview()
    expect(screen.getByText('Atacama wind')).toBeInTheDocument()
  })

  it('reads a French decimal comma as a decimal, not as 15', () => {
    rtlRender(
      <LocaleProvider initialLocale="fr" initialMessages={fr}>
        <ProjectBuilder />
      </LocaleProvider>,
    )
    const input = screen.getByLabelText(fr.Creator.fieldGoal)
    fireEvent.change(input, { target: { value: '1,5' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.change(input, { target: { value: '1.2.3' } })
    expect(screen.getByRole('alert')).toHaveTextContent(fr.Creator.goalInvalid)
  })
})

describe('ProjectBuilder publish', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.mocked(simulateCreateProject).mockResolvedValue(42)
    vi.mocked(submitCreateProject).mockResolvedValue({ projectId: 42, hash: TX_HASH })
  })

  afterEach(() => vi.useRealTimers())

  const uriInput = () => screen.getByLabelText(en.Creator.fieldMetadataUri)
  const maturityInput = () => screen.getByLabelText(en.Creator.fieldMaturity)
  const publishButton = () => screen.getByRole('button', { name: en.Creator.publishCta })

  const waitForPublish = async () => {
    await waitFor(() => expect(publishButton()).toBeEnabled())
  }

  it('validates the metadata URI with the contract scheme rules', () => {
    render(<ProjectBuilder />)
    fireEvent.change(uriInput(), { target: { value: 'ftp://example.com/project.json' } })
    fireEvent.blur(uriInput())
    expect(uriInput()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(en.Creator.uriInvalidScheme)
  })

  it('validates that the maturity date is in the future', () => {
    render(<ProjectBuilder />)
    fireEvent.change(maturityInput(), { target: { value: '2020-01-01' } })
    fireEvent.blur(maturityInput())
    expect(maturityInput()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(en.Creator.maturityInPast)
  })

  it('publishes the project and shows the id with an explorer link', async () => {
    render(<ProjectBuilder />)
    fireEvent.change(uriInput(), { target: { value: 'ipfs://bafyproject' } })
    await waitForPublish()

    fireEvent.click(publishButton())

    await screen.findByText('Project #42 is on-chain.')
    expect(simulateCreateProject).toHaveBeenCalledWith(
      CREATOR,
      'ipfs://bafyproject',
      0,
      expect.any(Uint8Array),
    )
    expect(submitCreateProject).toHaveBeenCalledWith(
      CREATOR,
      'ipfs://bafyproject',
      0,
      expect.any(Uint8Array),
      wallet.sign,
    )
    expect(screen.getByRole('link', { name: en.Creator.publishViewTx })).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/testnet/tx/${TX_HASH}`,
    )
  })

  it('sends a non-whitelisted wallet to the Apply tab without signing', async () => {
    vi.mocked(simulateCreateProject).mockRejectedValueOnce(
      new CreateProjectError('notWhitelisted', 'Error(Contract, #1)', 1),
    )
    const onApply = vi.fn()
    render(<ProjectBuilder onApply={onApply} />)
    fireEvent.change(uriInput(), { target: { value: 'ipfs://bafyproject' } })
    await waitForPublish()

    fireEvent.click(publishButton())

    await screen.findByText(en.Creator.publishNotWhitelisted)
    expect(submitCreateProject).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en.Creator.publishGoApply }))
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('keeps a contract rejection inline instead of signing', async () => {
    vi.mocked(simulateCreateProject).mockRejectedValueOnce(
      new CreateProjectError('uri', 'Error(Contract, #29)', 29),
    )
    render(<ProjectBuilder />)
    fireEvent.change(uriInput(), { target: { value: 'ipfs://bafyproject' } })
    await waitForPublish()

    fireEvent.click(publishButton())

    await screen.findByText(en.Creator.publishUriRejected)
    expect(submitCreateProject).not.toHaveBeenCalled()
  })
})
