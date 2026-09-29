import { describe, expect, it } from 'vitest'

import ar from '../../messages/ar.json'
import en from '../../messages/en.json'
import es from '../../messages/es.json'
import fr from '../../messages/fr.json'
import pt from '../../messages/pt.json'
import { REGISTRY_ERROR_CODES, VAULT_ERROR_CODES } from './contractErrorCodes'
import {
  contractErrorMessageEn,
  parseContractError,
  translateContractError,
} from './contractErrors'
import { getFriendlyErrorMessage, parseAndFriendlyError } from './errorMessages'

const HOST_ERROR =
  'Simulation failed: HostError: Error(Contract, #33)\n\nEvent log (newest first):\n   0: [Diagnostic Event] contract:CDLZ..., topics:[error, Error(Contract, #33)]'

const LOCALES = { en, fr, es, pt, ar } as const

describe('parseContractError', () => {
  it('extracts the vault error from a HostError simulation string', () => {
    expect(parseContractError(HOST_ERROR)).toMatchObject({
      source: 'vault',
      code: 33,
      name: 'SlippageLimitExceeded',
      messageKey: 'vault_SlippageLimitExceeded',
    })
  })

  it('reads Error instances and resolves registry codes when asked', () => {
    const error = new Error('HostError: Error(Contract, #7)')
    expect(parseContractError(error, { source: 'registry' })?.name).toBe('ProjectNotFound')
    expect(parseContractError(error)?.name).toBe('YieldAmountNotPositive')
  })

  it('returns null for non-contract errors', () => {
    expect(parseContractError('Network timeout')).toBeNull()
    expect(parseContractError(undefined)).toBeNull()
  })

  it('falls back to the generic message for an unmapped code', () => {
    const parsed = parseContractError('Error(Contract, #9999)')
    expect(parsed).toMatchObject({ code: 9999, name: null, messageKey: 'unknown' })
  })
})

describe('translateContractError', () => {
  it('turns a sample HostError into the right message', () => {
    expect(contractErrorMessageEn(HOST_ERROR)).toBe(en.ContractErrors.vault_SlippageLimitExceeded)
    expect(contractErrorMessageEn(HOST_ERROR)).toMatch(/slippage tolerance/i)
  })

  it('adds a utilization hint to liquidity errors', () => {
    expect(contractErrorMessageEn('Error(Contract, #5)', { utilization: 92 })).toBe(
      'Try a smaller amount — liquidity is limited right now (utilization 92%).',
    )
    expect(contractErrorMessageEn('Error(Contract, #5)')).toBe(
      'Try a smaller amount — liquidity is limited right now.',
    )
  })

  it('uses the supplied translator', () => {
    const t = (key: string) => `t:${key}`
    expect(translateContractError('Error(Contract, #36)', t)).toBe('t:vault_DepositLocked')
  })

  it('feeds the friendly-error helpers', () => {
    expect(getFriendlyErrorMessage(HOST_ERROR)).toBe(en.ContractErrors.vault_SlippageLimitExceeded)
    expect(parseAndFriendlyError(new Error('Error(Contract, #34)'))).toBe(
      en.ContractErrors.vault_Paused,
    )
  })
})

describe('coverage of every contract error code', () => {
  const entries = [
    ...Object.entries(VAULT_ERROR_CODES).map(([code, e]) => ['vault', code, e] as const),
    ...Object.entries(REGISTRY_ERROR_CODES).map(([code, e]) => ['registry', code, e] as const),
  ]

  it('covers the full VaultError and RegistryError enums', () => {
    expect(Object.keys(VAULT_ERROR_CODES)).toHaveLength(61)
    expect(Object.keys(REGISTRY_ERROR_CODES)).toHaveLength(45)
  })

  it.each(Object.entries(LOCALES))('%s has a message for every code', (_locale, messages) => {
    const table = messages.ContractErrors as Record<string, string>
    for (const [source, code, [name, key]] of entries) {
      expect(table[key], `${source} #${code} ${name} -> ${key}`).toBeTruthy()
    }
    expect(table.unknown).toBeTruthy()
  })

  it.each(Object.entries(LOCALES))('%s has the utilization hint variants', (_locale, messages) => {
    const table = messages.ContractErrors as Record<string, string>
    expect(table.vault_WithdrawalExceedsLimitUtil).toContain('{utilization}')
    expect(table.vault_InsufficientLiquidUtil).toContain('{utilization}')
  })
})
