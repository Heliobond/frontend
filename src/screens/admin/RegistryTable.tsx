'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components'
import { type RegistryEntry } from '@/data/admin'
import { clampScore, parseFundedNum } from './utils'

/**
 * RegistryTable — the dense project registry. A real <table> with a tinted,
 * sticky-feeling header. Numbers are mono / tabular / right-aligned. Column
 * headers reorder rows INSTANTLY (no transition — the brief bans animated
 * table sorts). Each row's "Update scores" toggles an inline editor row with
 * two number inputs that writes back via the parent's onSave.
 */
type SortKey = 'name' | 'type' | 'credit' | 'green' | 'funded' | 'lastVerified'
type SortDir = 'asc' | 'desc'

export interface RegistryTableProps {
  rows: RegistryEntry[]
  onSave: (id: number, credit: number, green: number) => void
}

export function RegistryTable({ rows, onSave }: RegistryTableProps) {
  const t = useTranslations('Admin')
  const [sortKey, setSortKey] = useState<SortKey>('credit')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [editing, setEditing] = useState<number | null>(null)

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
        case 'type':
        case 'lastVerified':
          cmp = String(a[sortKey]).localeCompare(String(b[sortKey]))
          break
        case 'funded':
          cmp = parseFundedNum(a.funded) - parseFundedNum(b.funded)
          break
        default:
          cmp = (a[sortKey] as number) - (b[sortKey] as number)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' || key === 'type' || key === 'lastVerified' ? 'asc' : 'desc')
    }
  }

  return (
    <div style={scrollWrapStyle}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th
              label={t('colProject')}
              k="name"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              sortLabel={t('sortBy', { col: t('colProject') })}
            />
            <Th
              label={t('colType')}
              k="type"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              sortLabel={t('sortBy', { col: t('colType') })}
            />
            <Th
              label={t('colCredit')}
              k="credit"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              sortLabel={t('sortBy', { col: t('colCredit') })}
              align="right"
            />
            <Th
              label={t('colGreen')}
              k="green"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              sortLabel={t('sortBy', { col: t('colGreen') })}
              align="right"
            />
            <Th
              label={t('colFunded')}
              k="funded"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              sortLabel={t('sortBy', { col: t('colFunded') })}
              align="right"
            />
            <Th
              label={t('colLastVerified')}
              k="lastVerified"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              sortLabel={t('sortBy', { col: t('colLastVerified') })}
              align="right"
            />
            <th style={thActions}>
              <span className="hb-eyebrow">{t('colActions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <Row
              key={r.id}
              row={r}
              editing={editing === r.id}
              onEdit={() => setEditing(r.id)}
              onCancel={() => setEditing(null)}
              onSave={async (credit, green) => {
                try {
                  await onSave(r.id, credit, green)
                  setEditing(null)
                } catch {
                  // Keep editor open on failure so admin can retry
                }
              }}
              updateLabel={t('updateScores')}
              reVerifyLabel={t('reVerify', { name: r.name })}
              creditFieldLabel={t('scoreFieldCredit')}
              greenFieldLabel={t('scoreFieldGreen')}
              cancelLabel={t('actionCancel')}
              saveLabel={t('actionSave')}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  sortLabel,
  align = 'left',
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  sortLabel: string
  align?: 'left' | 'right'
}) {
  const active = k === sortKey
  const ariaSort = active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'

  const thCellStyle = align === 'right' ? thRight : thLeft

  return (
    <th aria-sort={ariaSort} style={thCellStyle}>
      <button
        type="button"
        onClick={() => onSort(k)}
        style={align === 'right' ? thBtnRight : thBtnLeft}
        aria-label={sortLabel}
      >
        <span className="hb-eyebrow" style={active ? thLabelActive : thLabelInactive}>
          {label}
        </span>
        <span aria-hidden="true" style={active ? thIndicatorActive : thIndicatorInactive}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

function Row({
  row,
  editing,
  onEdit,
  onCancel,
  onSave,
  updateLabel,
  reVerifyLabel,
  creditFieldLabel,
  greenFieldLabel,
  cancelLabel,
  saveLabel,
}: {
  row: RegistryEntry
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (credit: number, green: number) => void
  updateLabel: string
  reVerifyLabel: string
  creditFieldLabel: string
  greenFieldLabel: string
  cancelLabel: string
  saveLabel: string
}) {
  const [credit, setCredit] = useState(String(row.credit))
  const [green, setGreen] = useState(String(row.green))

  // Reset draft to current values each time the editor opens.
  const open = () => {
    setCredit(String(row.credit))
    setGreen(String(row.green))
    onEdit()
  }

  return (
    <>
      <tr style={rowBorderStyle}>
        <td style={tdStyle}>
          <div style={nameStyle}>{row.name}</div>
          <div style={locationStyle}>{row.location}</div>
        </td>
        <td style={tdStyle}>
          <span style={typePill}>{row.type}</span>
        </td>
        <td style={tdNumStyle}>{row.credit}</td>
        <td style={tdNumStyle}>{row.green}</td>
        <td style={tdNumStyle}>{row.funded}</td>
        <td style={tdLastVerifiedStyle}>{row.lastVerified}</td>
        <td style={tdActionsStyle}>
          {!editing && (
            <Button size="sm" variant="ghost" onClick={open}>
              {updateLabel}
            </Button>
          )}
        </td>
      </tr>
      {editing && (
        <tr style={editingRowStyle}>
          <td colSpan={7} style={editingCellStyle}>
            <div style={editorFlexStyle}>
              <span style={reVerifySpanStyle}>{reVerifyLabel}</span>
              <ScoreField label={creditFieldLabel} value={credit} onChange={setCredit} />
              <ScoreField label={greenFieldLabel} value={green} onChange={setGreen} />
              <div style={btnGroupStyle}>
                <Button size="sm" variant="ghost" onClick={onCancel}>
                  {cancelLabel}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onSave(clampScore(credit), clampScore(green))}
                >
                  {saveLabel}
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ScoreField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label style={scoreLabelStyle}>
      <span className="hb-eyebrow">{label}</span>
      <input
        type="number"
        min={0}
        max={100}
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </label>
  )
}

const scrollWrapStyle: CSSProperties = {
  overflowX: 'auto',
  maxHeight: 320,
  overflowY: 'auto',
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-small)',
}

const thBase: CSSProperties = {
  background: 'var(--ink-06)',
  padding: '10px 14px',
  position: 'sticky',
  top: 0,
  whiteSpace: 'nowrap',
  zIndex: 1,
}

const tdStyle: CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'middle',
  color: 'var(--ink)',
}

const numCell: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontFeatureSettings: '"tnum" 1',
  textAlign: 'end',
  whiteSpace: 'nowrap',
}

const typePill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 22,
  padding: '0 9px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-eyebrow)',
  fontWeight: 500,
  color: 'var(--ink)',
  background: 'var(--ink-06)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-pill)',
  whiteSpace: 'nowrap',
}

const inputStyle: CSSProperties = {
  width: 72,
  height: 36,
  padding: '0 10px',
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--type-small)',
  fontFeatureSettings: '"tnum" 1',
  color: 'var(--ink)',
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-input)',
  outline: 'none',
}

// ── Th static styles ────────────────────────────────────────────────────────
const thLeft: CSSProperties = { ...thBase, textAlign: 'left' }
const thRight: CSSProperties = { ...thBase, textAlign: 'right' }
const thActions: CSSProperties = { ...thBase, textAlign: 'end' }

const thBtnBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
}
const thBtnLeft: CSSProperties = { ...thBtnBase, flexDirection: 'row' }
const thBtnRight: CSSProperties = { ...thBtnBase, flexDirection: 'row-reverse' }

const thLabelActive: CSSProperties = { color: 'var(--ink)' }
const thLabelInactive: CSSProperties = { color: 'var(--ink-60)' }
const thIndicatorActive: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--type-micro)',
  color: 'var(--ink)',
}
const thIndicatorInactive: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontSize: 'var(--type-micro)',
  color: 'var(--ink-40)',
}

// ── Row static styles ────────────────────────────────────────────────────────
const rowBorderStyle: CSSProperties = { borderTop: '1px solid var(--ink-12)' }

const nameStyle: CSSProperties = { fontWeight: 600, color: 'var(--ink)' }
const locationStyle: CSSProperties = {
  fontSize: 'var(--type-eyebrow)',
  color: 'var(--ink-60)',
}

const tdNumStyle: CSSProperties = { ...tdStyle, ...numCell }
const tdLastVerifiedStyle: CSSProperties = { ...tdStyle, ...numCell, color: 'var(--ink-60)' }
const tdActionsStyle: CSSProperties = { ...tdStyle, textAlign: 'end' }

const editingRowStyle: CSSProperties = { background: 'var(--ink-06)' }
const editingCellStyle: CSSProperties = { padding: '12px 14px' }
const editorFlexStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 16,
  flexWrap: 'wrap',
}
const reVerifySpanStyle: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-caption)',
  color: 'var(--ink-60)',
  alignSelf: 'center',
}
const btnGroupStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
  marginInlineStart: 'auto',
}

// ── ScoreField static styles ─────────────────────────────────────────────────
const scoreLabelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
