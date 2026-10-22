'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button, FormField, FormInput, FormSelect, sanitizeAmount } from '@/components'
import {
  panelStyle,
  textInput,
  helpText,
  gridStyle,
  formRowStyle,
  fieldGrowStyle,
  inputGroupStyle,
  dataCaptionStyle,
  warningBoxStyle,
  warningTextStyle,
  moneyStyle,
  panelTitleStyle,
  panelHeaderStyle,
  panelBodyStyle,
} from '@/theme'
import { type RegistryEntry } from '@/data/admin'
import { clampScore, validateScores, isSafeScore } from './utils'
import { formatMoney, parseAmount } from '@/lib/format'

export { isSafeScore }

export function isSafeAmount(value: string, liquidOrMax: number): boolean {
  if (!/^\d*\.?\d+$/.test(value)) return false
  const n = parseAmount(value)
  return Number.isFinite(n) && n > 0 && n <= liquidOrMax
}

export interface FundingGuardrails {
  insuranceReserve?: number
  investmentCapacities?: Record<number, number>
  maxTransactionAmount?: number
  isRegistryPaused?: boolean
}

/**
 * OracleForms — the two privileged write paths, side by side:
 *   1. Push score update — re-verify a project's credit + green on-chain.
 *   2. Fund a project — deploy idle vault USDC into a project.
 * Both are local-state only; on submit they call the parent's handlers, which
 * mutate the in-memory snapshot and raise a Toast. Plain-language, honest:
 * the form states exactly what will be written, never hides the consequence.
 */
export interface OracleFormsProps {
  projects: RegistryEntry[]
  liquid: number
  guardrails?: FundingGuardrails
  /** Set when score updates are blocked (e.g. the registry is paused). Disables the form. */
  scoresDisabledReason?: string
  /** Set when funding is blocked (e.g. the vault or registry is paused). Disables the form. */
  fundDisabledReason?: string
  /**
   * Resolve true when the transaction succeeded. Resolve false (or reject) when it
   * failed, so the form keeps the admin's input for a retry.
   */
  onPushScores: (id: number, credit: number, green: number) => Promise<boolean>
  onFund: (id: number, amount: number) => Promise<boolean>
}

export function OracleForms({
  projects,
  liquid,
  guardrails,
  scoresDisabledReason,
  fundDisabledReason,
  onPushScores,
  onFund,
}: OracleFormsProps) {
  const t = useTranslations('Admin')
  const first = projects[0]?.id ?? 0

  // Push-scores form state.
  const [scoreId, setScoreId] = useState(first)
  const [credit, setCredit] = useState('')
  const [green, setGreen] = useState('')
  const [scorePending, setScorePending] = useState(false)

  // Fund form state.
  const [fundId, setFundId] = useState(first)
  const [amount, setAmount] = useState('')
  const [fundPending, setFundPending] = useState(false)

  const scoresValid = isSafeScore(credit) && isSafeScore(green) && validateScores(credit, green)

  const isPaused = guardrails?.isRegistryPaused ?? false
  const reserve = guardrails?.insuranceReserve ?? 0
  const afterReserve = Math.max(0, liquid - reserve)
  const capacity = guardrails?.investmentCapacities?.[fundId] ?? Infinity
  const maxTx = guardrails?.maxTransactionAmount ?? Infinity
  const deployable = isPaused ? 0 : Math.max(0, Math.min(afterReserve, capacity, maxTx))

  const amountN = parseAmount(amount)
  const fundValid = !isPaused && !fundDisabledReason && isSafeAmount(amount, deployable)
  const overLiquid = amountN > deployable

  const target = projects.find((p) => p.id === scoreId)

  // Inputs stay filled on failure, so the admin can retry. They clear only on success.
  const submitScores = async () => {
    if (!scoresValid || scoresDisabledReason || scorePending) return
    setScorePending(true)
    try {
      if (await onPushScores(scoreId, clampScore(credit), clampScore(green))) {
        setCredit('')
        setGreen('')
      }
    } finally {
      setScorePending(false)
    }
  }

  const submitFund = async () => {
    if (!fundValid || fundPending) return
    setFundPending(true)
    try {
      if (await onFund(fundId, amountN)) setAmount('')
    } finally {
      setFundPending(false)
    }
  }

  return (
    <div style={gridStyle}>
      {/* Push score update */}
      <Panel title={t('panelPushTitle')} hint={t('panelPushHint')}>
        <Field label={t('fieldProject')}>
          <Select
            value={scoreId}
            onChange={setScoreId}
            projects={projects}
            label={t('fieldProject')}
          />
        </Field>
        <div style={formRowStyle}>
          <Field label={t('fieldCredit')} style={fieldGrowStyle}>
            <NumberInput
              value={credit}
              onChange={setCredit}
              placeholder={target ? String(target.credit) : '0'}
            />
          </Field>
          <Field label={t('fieldGreen')} style={fieldGrowStyle}>
            <NumberInput
              value={green}
              onChange={setGreen}
              placeholder={target ? String(target.green) : '0'}
            />
          </Field>
        </div>
        <p style={helpText}>
          {target
            ? t('scoresHint', { credit: target.credit, green: target.green })
            : t('scoresHintShort')}
        </p>
        {scoresDisabledReason && <BlockedNotice>{scoresDisabledReason}</BlockedNotice>}
        <Button
          size="sm"
          variant="primary"
          disabled={!scoresValid || Boolean(scoresDisabledReason) || scorePending}
          reason={scoresDisabledReason ?? t('scoresReason')}
          onClick={submitScores}
        >
          {scorePending ? 'Waiting for confirmation…' : t('submitScores')}
        </Button>
      </Panel>

      {/* Fund a project */}
      <Panel title={t('panelFundTitle')} hint={t('panelFundHint')}>
        <Field label={t('fieldProject')}>
          <Select
            value={fundId}
            onChange={setFundId}
            projects={projects}
            label={t('fieldProject')}
          />
        </Field>
        <Field label={t('fieldAmount')}>
          <div style={inputGroupStyle}>
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onPaste={(e) => {
                e.preventDefault()
                const pastedText = e.clipboardData.getData('text')
                setAmount(sanitizeAmount(pastedText))
              }}
              onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
              style={{
                ...textInput,
                flex: 1,
                fontSize: 18,
                borderColor: overLiquid ? 'var(--ember)' : undefined,
              }}
            />
            <span style={dataCaptionStyle}>USDC</span>
          </div>
          {isPaused && (
            <div role="status" style={warningBoxStyle}>
              <p style={warningTextStyle}>
                Registry is currently paused. Project funding is disabled.
              </p>
            </div>
          )}
          {fundDisabledReason && !isPaused && <BlockedNotice>{fundDisabledReason}</BlockedNotice>}
          {!isPaused && overLiquid && (
            <div role="status" style={warningBoxStyle}>
              <p style={warningTextStyle}>
                {amountN > afterReserve && reserve > 0
                  ? `Amount exceeds deployable balance after insurance reserve of $${formatMoney(reserve)}`
                  : amountN > capacity
                    ? `Amount exceeds remaining capacity for this project ($${formatMoney(capacity)})`
                    : t('fundExceeds')}
              </p>
            </div>
          )}
        </Field>
        <p style={helpText}>
          {t('liquidHint')} <span style={moneyStyle}>${formatMoney(deployable)}</span>.{' '}
          {overLiquid ? t('fundExceeds') : t('fundOk')}
        </p>
        <Button
          size="sm"
          variant="primary"
          disabled={!fundValid || fundPending}
          reason={
            fundDisabledReason ??
            (isPaused
              ? 'Registry is paused'
              : overLiquid
                ? 'Amount exceeds deployable limit'
                : t('fundReasonEmpty'))
          }
          onClick={submitFund}
        >
          {fundPending ? 'Waiting for confirmation…' : t('submitFund')}
        </Button>
      </Panel>
    </div>
  )
}

/** Explains why a form is locked. Shown above the submit button, next to the reason on hover. */
function BlockedNotice({ children }: { children: ReactNode }) {
  return (
    <div role="status" style={warningBoxStyle}>
      <p style={warningTextStyle}>{children}</p>
    </div>
  )
}

function Panel({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <h3 style={panelTitleStyle}>{title}</h3>
        <p style={{ ...helpText, marginTop: 4 }}>{hint}</p>
      </div>
      <div style={panelBodyStyle}>{children}</div>
    </div>
  )
}

function Field({
  label,
  children,
  style,
}: {
  label: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <FormField label={label} style={style}>
      {children}
    </FormField>
  )
}

function Select({
  value,
  onChange,
  projects,
  label,
}: {
  value: number
  onChange: (id: number) => void
  projects: RegistryEntry[]
  label: string
}) {
  return (
    <FormSelect aria-label={label} value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </FormSelect>
  )
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <FormInput
      type="number"
      min={0}
      max={100}
      inputMode="numeric"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={textInput}
    />
  )
}
