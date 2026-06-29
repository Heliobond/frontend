'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { Button } from '@/components'
import { type RegistryEntry } from '@/data/admin'

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

/** Parse "$1,180,000" → 1180000 for numeric sorting on the funded column. */
function fundedNum(s: string): number {
  const n = Number(s.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function RegistryTable({ rows, onSave }: RegistryTableProps) {
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
          cmp = fundedNum(a.funded) - fundedNum(b.funded)
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
    <div style={{ overflowX: 'auto' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <Th label="Project" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <Th label="Type" k="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            <Th
              label="Credit"
              k="credit"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              align="right"
            />
            <Th
              label="Green"
              k="green"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              align="right"
            />
            <Th
              label="Funded"
              k="funded"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              align="right"
            />
            <Th
              label="Last verified"
              k="lastVerified"
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
              align="right"
            />
            <th style={{ ...thBase, textAlign: 'right' }}>
              <span className="hb-eyebrow">Actions</span>
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
              onSave={(credit, green) => {
                onSave(r.id, credit, green)
                setEditing(null)
              }}
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
  align = 'left',
}: {
  label: string
  k: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = k === sortKey
  return (
    <th style={{ ...thBase, textAlign: align }}>
      <button
        type="button"
        onClick={() => onSort(k)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          flexDirection: align === 'right' ? 'row-reverse' : 'row',
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: active ? 'var(--ink)' : 'var(--ink-60)',
        }}
        aria-label={`Sort by ${label}`}
      >
        <span className="hb-eyebrow" style={{ color: 'inherit' }}>
          {label}
        </span>
        <span
          aria-hidden="true"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 10,
            color: active ? 'var(--ink)' : 'var(--ink-40)',
          }}
        >
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
}: {
  row: RegistryEntry
  editing: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (credit: number, green: number) => void
}) {
  const [credit, setCredit] = useState(String(row.credit))
  const [green, setGreen] = useState(String(row.green))

  // Reset draft to current values each time the editor opens.
  const open = () => {
    setCredit(String(row.credit))
    setGreen(String(row.green))
    onEdit()
  }

  const clamp = (v: string) => {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n)) return 0
    return Math.min(100, Math.max(0, n))
  }

  return (
    <>
      <tr style={{ borderTop: '1px solid var(--ink-12)' }}>
        <td style={tdStyle}>
          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{row.name}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-60)' }}>{row.location}</div>
        </td>
        <td style={tdStyle}>
          <span style={typePill}>{row.type}</span>
        </td>
        <td style={{ ...tdStyle, ...numCell }}>{row.credit}</td>
        <td style={{ ...tdStyle, ...numCell }}>{row.green}</td>
        <td style={{ ...tdStyle, ...numCell }}>{row.funded}</td>
        <td style={{ ...tdStyle, ...numCell, color: 'var(--ink-60)' }}>{row.lastVerified}</td>
        <td style={{ ...tdStyle, textAlign: 'right' }}>
          {!editing && (
            <Button size="sm" variant="ghost" onClick={open}>
              Update scores
            </Button>
          )}
        </td>
      </tr>
      {editing && (
        <tr style={{ background: 'var(--ink-06)' }}>
          <td colSpan={7} style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12.5,
                  color: 'var(--ink-60)',
                  alignSelf: 'center',
                }}
              >
                Re-verify {row.name}
              </span>
              <ScoreField label="Credit quality" value={credit} onChange={setCredit} />
              <ScoreField label="Green impact" value={green} onChange={setGreen} />
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                <Button size="sm" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onSave(clamp(credit), clamp(green))}
                >
                  Save
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
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: 'var(--font-body)',
  fontSize: 13.5,
}

const thBase: CSSProperties = {
  background: 'var(--ink-06)',
  padding: '10px 14px',
  position: 'sticky',
  top: 0,
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'middle',
  color: 'var(--ink)',
}

const numCell: CSSProperties = {
  fontFamily: 'var(--font-data)',
  fontFeatureSettings: '"tnum" 1',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

const typePill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  height: 22,
  padding: '0 9px',
  fontFamily: 'var(--font-body)',
  fontSize: 12,
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
  fontSize: 14,
  fontFeatureSettings: '"tnum" 1',
  color: 'var(--ink)',
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-input)',
  outline: 'none',
}
