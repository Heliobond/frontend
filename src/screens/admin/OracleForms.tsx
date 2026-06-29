'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components'
import { type RegistryEntry } from '@/data/admin'

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
  const first = projects[0]?.id ?? 0

  // Push-scores form state.
  const [scoreId, setScoreId] = useState(first)
  const [credit, setCredit] = useState('')
  const [green, setGreen] = useState('')

  // Fund form state.
  const [fundId, setFundId] = useState(first)
  const [amount, setAmount] = useState('')

  const clamp = (v: string) => {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n)) return 0
    return Math.min(100, Math.max(0, n))
  }

  const creditN = Number(credit)
  const greenN = Number(green)
  const scoresValid =
    credit !== '' && green !== '' && creditN >= 0 && creditN <= 100 && greenN >= 0 && greenN <= 100

  const amountN = Number(amount.replace(/[^0-9.]/g, ''))
  const fundValid = amountN > 0 && amountN <= liquid

  const target = projects.find((p) => p.id === scoreId)

  const submitScores = () => {
    if (!scoresValid) return
    onPushScores(scoreId, clamp(credit), clamp(green))
    setCredit('')
    setGreen('')
  }

  const submitFund = () => {
    if (!fundValid) return
    onFund(fundId, amountN)
    setAmount('')
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 16,
      }}
    >
      {/* Push score update */}
      <Panel title="Push score update" hint="Writes a new oracle reading to the ProjectRegistry.">
        <Field label="Project">
          <Select value={scoreId} onChange={setScoreId} projects={projects} />
        </Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Credit quality" style={{ flex: 1 }}>
            <NumberInput
              value={credit}
              onChange={setCredit}
              placeholder={target ? String(target.credit) : '0'}
            />
          </Field>
          <Field label="Green impact" style={{ flex: 1 }}>
            <NumberInput
              value={green}
              onChange={setGreen}
              placeholder={target ? String(target.green) : '0'}
            />
          </Field>
        </div>
        <p style={helpText}>
          {target
            ? `Current on-chain: credit ${target.credit}, green ${target.green}. Scores are 0–100.`
            : 'Scores are 0–100.'}
        </p>
        <Button
          size="sm"
          variant="primary"
          disabled={!scoresValid}
          reason="Enter both scores (0–100) first."
          onClick={submitScores}
        >
          Update on-chain scores
        </Button>
      </Panel>

      {/* Fund a project */}
      <Panel title="Fund a project" hint="Deploys idle vault USDC into a project.">
        <Field label="Project">
          <Select value={fundId} onChange={setFundId} projects={projects} />
        </Field>
        <Field label="Amount (USDC)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              style={{ ...textInput, flex: 1, fontSize: 18 }}
            />
            <span style={{ fontFamily: 'var(--font-data)', fontSize: 13, color: 'var(--ink-60)' }}>
              USDC
            </span>
          </div>
        </Field>
        <p style={helpText}>
          Liquid in vault:{' '}
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontFeatureSettings: '"tnum" 1',
              color: 'var(--ink)',
            }}
          >
            ${liquid.toLocaleString('en-US')}
          </span>
          .{' '}
          {amountN > liquid
            ? 'That is more than is liquid right now — lower the amount.'
            : 'Funding lowers liquid USDC by the same amount.'}
        </p>
        <Button
          size="sm"
          variant="primary"
          disabled={!fundValid}
          reason={
            amountN > liquid
              ? 'Amount exceeds liquid USDC.'
              : 'Enter an amount within the liquid balance.'
          }
          onClick={submitFund}
        >
          Fund from the vault
        </Button>
      </Panel>
    </div>
  )
}

function Panel({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div style={panelStyle}>
      <div style={{ marginBottom: 12 }}>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 15.5,
            margin: 0,
            color: 'var(--ink)',
          }}
        >
          {title}
        </h3>
        <p style={{ ...helpText, marginTop: 4 }}>{hint}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>
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
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <span className="hb-eyebrow">{label}</span>
      {children}
    </label>
  )
}

function Select({
  value,
  onChange,
  projects,
}: {
  value: number
  onChange: (id: number) => void
  projects: RegistryEntry[]
}) {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} style={selectStyle}>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
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
    <input
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

const panelStyle: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-card)',
  padding: 16,
  boxShadow: 'var(--shadow-sm)',
}

const textInput: CSSProperties = {
  height: 40,
  padding: '0 12px',
  fontFamily: 'var(--font-data)',
  fontSize: 14,
  fontFeatureSettings: '"tnum" 1',
  color: 'var(--ink)',
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-input)',
  outline: 'none',
  width: '100%',
}

const selectStyle: CSSProperties = {
  height: 40,
  padding: '0 12px',
  fontFamily: 'var(--font-body)',
  fontSize: 13.5,
  color: 'var(--ink)',
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-input)',
  outline: 'none',
  width: '100%',
  cursor: 'pointer',
}

const helpText: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 12.5,
  lineHeight: 1.5,
  color: 'var(--ink-60)',
}
