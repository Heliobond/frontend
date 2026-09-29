// Translates Soroban contract failures into user-facing messages (#610).
// Failures surface as `Error(Contract, #N)` inside a HostError/simulation string;
// N indexes the VaultError or RegistryError enum (see contractErrorCodes.ts).

import en from '../../messages/en.json'
import {
  REGISTRY_ERROR_CODES,
  VAULT_ERROR_CODES,
  type ContractErrorEntry,
} from './contractErrorCodes'

export type ContractErrorSource = 'vault' | 'registry'

export interface ParsedContractError {
  source: ContractErrorSource
  code: number
  /** Enum variant name, e.g. "SlippageLimitExceeded"; null for an unmapped code. */
  name: string | null
  /** Key inside the "ContractErrors" i18n namespace. */
  messageKey: string
}

export interface ContractErrorContext {
  /** Which contract raised the error. Defaults to the vault. */
  source?: ContractErrorSource
  /** Pool utilization (0–100). Adds a liquidity hint to withdrawal errors. */
  utilization?: number
}

type TranslateValues = Record<string, string | number>
// `key: never` lets a next-intl translator (whose keys are a literal union) be
// passed in; the keys are resolved from the code tables, so they're checked by tests.
type Translate = (key: never, values?: never) => string

const TABLES: Record<ContractErrorSource, Readonly<Record<number, ContractErrorEntry>>> = {
  vault: VAULT_ERROR_CODES,
  registry: REGISTRY_ERROR_CODES,
}

// Codes whose message reads better with the current utilization appended.
const UTILIZATION_HINT_KEYS = new Set(['vault_WithdrawalExceedsLimit', 'vault_InsufficientLiquid'])

const CONTRACT_ERROR_PATTERN = /Error\(\s*Contract\s*,\s*#(\d+)\s*\)/

function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const { message, error: inner } = error as { message?: unknown; error?: unknown }
    if (typeof message === 'string') return message
    if (typeof inner === 'string') return inner
  }
  return ''
}

/** Extract the contract error code from an error, simulation string or HostError. */
export function parseContractError(
  error: unknown,
  context: ContractErrorContext = {},
): ParsedContractError | null {
  const match = CONTRACT_ERROR_PATTERN.exec(errorText(error))
  if (!match) return null
  const source = context.source ?? 'vault'
  const code = Number(match[1])
  const entry = TABLES[source][code]
  return {
    source,
    code,
    name: entry ? entry[0] : null,
    messageKey: entry ? entry[1] : 'unknown',
  }
}

function resolveKey(parsed: ParsedContractError, context: ContractErrorContext): string {
  const { messageKey } = parsed
  if (context.utilization !== undefined && UTILIZATION_HINT_KEYS.has(messageKey)) {
    return `${messageKey}Util`
  }
  return messageKey
}

/**
 * Localized message for a contract error, or null when `error` isn't one.
 * `t` is a translator scoped to the "ContractErrors" namespace.
 */
export function translateContractError(
  error: unknown,
  t: Translate,
  context: ContractErrorContext = {},
): string | null {
  const parsed = parseContractError(error, context)
  if (!parsed) return null
  const values =
    context.utilization !== undefined ? { utilization: Math.round(context.utilization) } : undefined
  return (t as (key: string, values?: TranslateValues) => string)(
    resolveKey(parsed, context),
    values,
  )
}

/** English message for callers with no i18n context (plain helpers, tests). */
export function contractErrorMessageEn(
  error: unknown,
  context: ContractErrorContext = {},
): string | null {
  const messages = en.ContractErrors as Record<string, string>
  return translateContractError(
    error,
    (key: string, values?: TranslateValues) =>
      (messages[key] ?? messages.unknown).replace(/\{(\w+)\}/g, (_, name) =>
        String(values?.[name] ?? ''),
      ),
    context,
  )
}
