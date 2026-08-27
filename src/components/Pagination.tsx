'use client'

import type { CSSProperties } from 'react'

export interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

export function Pagination({ currentPage, totalPages, totalItems, pageSize, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null

  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(currentPage * pageSize, totalItems)

  return (
    <nav aria-label="Pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 24 }}>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--type-small)', color: 'var(--ink-60)' }} aria-live="polite">
        Page {currentPage} of {totalPages} — showing {start}-{end} of {totalItems}
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Go to previous page"
          style={btnStyle(currentPage <= 1)}
        >
          Previous
        </button>
        <span style={{ fontFamily: 'var(--font-data)', fontSize: 'var(--type-small)', color: 'var(--ink)', padding: '0 8px' }} aria-current="page">
          {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Go to next page"
          style={btnStyle(currentPage >= totalPages)}
        >
          Next
        </button>
      </div>
    </nav>
  )
}

function btnStyle(disabled: boolean): CSSProperties {
  return {
    height: 36,
    padding: '0 14px',
    borderRadius: 'var(--radius-pill)',
    border: '1px solid var(--ink-12)',
    background: disabled ? 'var(--ink-06)' : 'var(--surface)',
    color: disabled ? 'var(--ink-40)' : 'var(--ink)',
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--type-small)',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }
}
