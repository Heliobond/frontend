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
import { clampScore, validateScores } from './utils'
import { formatMoney, parseAmount } from '@/lib/format'

export function isSafeScore(value: string): boolean {
  const n = Number(value)
  return /^\d*\.?\d+$/.test(value) && Number.isFinite(n) && n >= 0 && n <= 100
}

export function isSafeAmount(value: string, liquid: number): boolean {
  if (!/^\d*\.?\d+$/.test(value)) return false
  const n = parseAmount(value)
  return Number.isFinite(n) && n > 0 && n <= liquid
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
  onPushScores: (id: number, credit: number, green: number) => void
  onFund: (id: number, amount: number) => void
}

export function OracleForms({ projects, liquid, onPushScores, onFund }: OracleFormsProps) {
  const t = useTranslations('Admin')
  const first = projects[0]?.id ?? 0

  // Push-scores form state.
  const [scoreId, setScoreId] = useState(first)
  const [credit, setCredit] = useState('')
  const [green, setGreen] = useState('')

  // Fund form state.
  const [fundId, setFundId] = useState(first)
  const [amount, setAmount] = useState('')

  const scoresValid = isSafeScore(credit) && isSafeScore(green) && validateScores(credit, green)

  const amountN = parseAmount(amount)
  const fundValid = isSafeAmount(amount, liquid)
  const overLiquid = amountN > liquid

  const target = projects.find((p) => p.id === scoreId)

  const submitScores = () => {
    if (!scoresValid) return
    onPushScores(scoreId, clampScore(credit), clampScore(green))
    setCredit('')
    setGreen('')
  }

  const submitFund = () => {
    if (!fundValid) return
    onFund(fundId, amountN)
    setAmount('')
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
        <Button
          size="sm"
          variant="primary"
          disabled={!scoresValid}
          reason={t('scoresReason')}
          onClick={submitScores}
        >
          {t('submitScores')}
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
          {overLiquid && (
            <div role="status" style={warningBoxStyle}>
              <p style={warningTextStyle}>{t('fundExceeds')}</p>
            </div>
          )}
        </Field>
        <p style={helpText}>
          {t('liquidHint')} <span style={moneyStyle}>${formatMoney(liquid)}</span>.{' '}
          {amountN > liquid ? t('fundExceeds') : t('fundOk')}
        </p>
        <Button
          size="sm"
          variant="primary"
          disabled={!fundValid}
          reason={amountN > liquid ? t('fundReasonExceeds') : t('fundReasonEmpty')}
          onClick={submitFund}
        >
          {t('submitFund')}
        </Button>
      </Panel>
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

