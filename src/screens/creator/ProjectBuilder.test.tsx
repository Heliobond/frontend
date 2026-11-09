import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render as rtlRender } from '@testing-library/react'
import { type xdr } from '@stellar/stellar-sdk'
import { render, screen, fireEvent, act } from '@/test/render'
import { LocaleProvider } from '@/i18n/LocaleProvider'
import {
  computeProjectMetadataHash,
  computeSha256Sync,
  resetSimulateRegistryCall,
  setSimulateRegistryCall,
  SIMULATION_SOURCE_ADDRESS,
  verifyProjectMetadataHash,
} from '@/wallet/registry'
import en from '../../../messages/en.json'
import fr from '../../../messages/fr.json'
import { ProjectBuilder } from './ProjectBuilder'

const goalInput = () => screen.getByLabelText(en.Creator.fieldGoal)
const uriInput = () => screen.getByLabelText(en.Creator.fieldMetadataUri)
const maturityInput = () => screen.getByLabelText(en.Creator.fieldMaturityDate)
const publishButton = () => screen.getByRole('button', { name: en.Creator.publishToRegistry })
const typeGoal = (value: string) => fireEvent.change(goalInput(), { target: { value } })
const flushPreview = (ms = 250) => act(() => vi.advanceTimersByTime(ms))

describe('ProjectBuilder', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    resetSimulateRegistryCall()
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

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

  it('validates URI and maturity date on the client with contract rules before signing', async () => {
    const signSpy = vi.fn(async (txXdr: string) => txXdr)
    render(<ProjectBuilder walletAddress={SIMULATION_SOURCE_ADDRESS} signTransaction={signSpy} />)

    fireEvent.change(uriInput(), { target: { value: 'ar://ab' } })
    expect(screen.getByRole('alert')).toHaveTextContent(en.Creator.uriErrorTooShort)

    fireEvent.change(uriInput(), { target: { value: 'ftp://example.com/meta.json' } })
    expect(screen.getByRole('alert')).toHaveTextContent(en.Creator.uriErrorInvalidScheme)

    fireEvent.change(uriInput(), {
      target: { value: 'ipfs://' + 'a'.repeat(506) },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(en.Creator.uriErrorTooLong)

    fireEvent.change(uriInput(), {
      target: { value: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' },
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    fireEvent.change(maturityInput(), { target: { value: '2020-01-01' } })
    expect(screen.getByRole('alert')).toHaveTextContent(en.Creator.maturityErrorInPast)

    await act(async () => {
      fireEvent.click(publishButton())
    })
    expect(signSpy).not.toHaveBeenCalled()
  })

  it('computes canonical metadata SHA-256, lets creator download JSON, and publishes project for a whitelisted wallet', async () => {
    vi.useRealTimers()
    let downloadedJson = ''
    let downloadedHash = ''
    let submittedMetadataBytes: Buffer | null = null
    const signSpy = vi.fn(async (txXdr: string) => txXdr)

    setSimulateRegistryCall(async (method: string, args: unknown[] = []) => {
      const scArgs = args as xdr.ScVal[]
      if (method === 'create_project') {
        expect(scArgs).toHaveLength(4)
        expect(scArgs[0].switch().name).toBe('scvAddress')
        expect(scArgs[1].switch().name).toBe('scvString')
        expect(scArgs[2].switch().name).toBe('scvU64')
        expect(scArgs[3].switch().name).toBe('scvBytes')
        submittedMetadataBytes = Buffer.from(scArgs[3].bytes())
        return 42
      }
      if (method === 'verify_metadata_hash') {
        expect(scArgs).toHaveLength(2)
        expect(scArgs[0].switch().name).toBe('scvU32')
        expect(scArgs[0].u32()).toBe(42)
        expect(scArgs[1].switch().name).toBe('scvBytes')
        const candidateBytes = Buffer.from(scArgs[1].bytes())
        return submittedMetadataBytes !== null && submittedMetadataBytes.equals(candidateBytes)
      }
      throw new Error(`Unexpected method: ${method}`)
    })

    render(
      <ProjectBuilder
        walletAddress={SIMULATION_SOURCE_ADDRESS}
        signTransaction={signSpy}
        onDownloadMetadata={(json, hash) => {
          downloadedJson = json
          downloadedHash = hash
        }}
      />,
    )

    const displayedHash = screen.getByTestId('metadata-hash').textContent ?? ''
    expect(displayedHash).toMatch(/^[0-9a-f]{64}$/)

    fireEvent.click(screen.getByRole('button', { name: en.Creator.downloadMetadataJson }))
    expect(downloadedJson).toBeTruthy()
    expect(downloadedHash).toBe(displayedHash)
    expect(computeSha256Sync(downloadedJson)).toBe(displayedHash)
    expect(await computeProjectMetadataHash(downloadedJson)).toBe(displayedHash)

    fireEvent.change(uriInput(), {
      target: { value: 'ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi' },
    })

    fireEvent.click(publishButton())

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Project #42 published to registry')
    expect(signSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: en.Creator.publishViewExplorer })).toBeInTheDocument()

    const verified = await verifyProjectMetadataHash(42, downloadedHash)
    expect(verified).toBe(true)
  })

  it('shows NotWhitelisted error and Apply tab link without prompting the wallet to sign', async () => {
    vi.useRealTimers()
    const signSpy = vi.fn(async (txXdr: string) => txXdr)
    const navigateToApplySpy = vi.fn()

    setSimulateRegistryCall(async () => {
      throw new Error('HostError: Error(Contract, #1)')
    })

    render(
      <ProjectBuilder
        walletAddress={SIMULATION_SOURCE_ADDRESS}
        signTransaction={signSpy}
        onNavigateToApply={navigateToApplySpy}
      />,
    )

    fireEvent.change(uriInput(), {
      target: { value: 'https://example.com/project-metadata.json' },
    })

    fireEvent.click(publishButton())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(en.Creator.publishNotWhitelisted)
    expect(signSpy).not.toHaveBeenCalled()

    const applyLink = screen.getByRole('link', { name: en.Creator.publishGoToApply })
    expect(applyLink).toHaveAttribute('href', '/creator?tab=apply')
    fireEvent.click(applyLink)
    expect(navigateToApplySpy).toHaveBeenCalledTimes(1)
  })
})
