'use client'

import { useRef } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AddressChip } from './AddressChip'
import { useTransactions, type TransactionItem } from '../wallet/TransactionsProvider'
import { getExplorerTxUrl } from '../config/network'
import { useFocusTrap } from '../hooks/useFocusTrap'

export interface TransactionsDrawerProps {
  open: boolean
  onClose: () => void
}

export function TransactionsDrawer({ open, onClose }: TransactionsDrawerProps) {
  const t = useTranslations('Components.TransactionsDrawer')
  const { transactions, pendingCount, clearCompleted } = useTransactions()

  const panel = useRef<HTMLDivElement>(null)
  useFocusTrap(open, panel, undefined, onClose)
  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Drawer Panel */}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        tabIndex={-1}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          height: '100%',
          background: 'var(--surface)',
          borderLeft: '1px solid var(--ink-12)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.2)',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--ink-12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--type-h3)',
                margin: 0,
                color: 'var(--ink)',
              }}
            >
              {t('title')}
            </h2>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-caption)',
                color: 'var(--ink-60)',
              }}
            >
              {pendingCount > 0 ? t('pendingCount', { count: pendingCount }) : t('sessionHistory')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeActivityPanel')}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              color: 'var(--ink-60)',
            }}
          >
            &times;
          </button>
        </div>

        {/* Content List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {transactions.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 0',
                color: 'var(--ink-60)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-small)',
              }}
            >
              {t('empty')}
            </div>
          ) : (
            transactions.map((tx) => <TransactionRow key={tx.hash} item={tx} />)
          )}
        </div>

        {/* Footer */}
        {transactions.length > 0 && (
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--ink-12)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={clearCompleted}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-caption)',
                fontWeight: 600,
                color: 'var(--ink-60)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {t('clearCompleted')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TransactionRow({ item }: { item: TransactionItem }) {
  const t = useTranslations('Components.TransactionsDrawer')
  const locale = useLocale()
  const timeAgo = formatTimeAgo(item.submittedAt, locale)

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 'var(--radius-card)',
        border: '1px solid var(--ink-12)',
        background: 'var(--ink-03)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--type-small)',
            fontWeight: 600,
            textTransform: 'capitalize',
            color: 'var(--ink)',
          }}
        >
          {item.kind === 'deposit'
            ? t('kindDeposit')
            : item.kind === 'withdraw'
              ? t('kindWithdraw')
              : item.kind === 'claim'
                ? t('kindClaim')
                : item.kind === 'claim_yield'
                  ? t('kindClaimYield')
                  : item.kind.replace('_', ' ')}
          {item.amount ? ` • ${item.amount} USDC` : ''}
        </span>
        <StatusBadge status={item.status} />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 'var(--type-caption)',
          color: 'var(--ink-60)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <span>{t('submitted', { timeAgo })}</span>
        {item.fee !== undefined && (
          <span>{t('estimatedMaximumFee', { fee: item.fee.toFixed(7) })}</span>
        )}
      </div>

      {item.inclusionFee !== undefined && (
        <span>{t('inclusionFee', { fee: item.inclusionFee.toFixed(7) })}</span>
      )}
      {item.resourceFee !== undefined && (
        <span>{t('resourceFee', { fee: item.resourceFee.toFixed(7) })}</span>
      )}
      <div style={{ marginTop: 4 }}>
        <AddressChip
          value={item.hash}
          explorerUrl={
            item.hash.startsWith('demo')
              ? undefined
              : item.network
                ? `https://stellar.expert/explorer/${item.network}/tx/${item.hash}`
                : getExplorerTxUrl(item.hash)
          }
          label={t('transactionHash')}
        />
      </div>

      {item.error && (
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-caption)',
            color: 'var(--ember)',
          }}
        >
          {item.error}
        </span>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: TransactionItem['status'] }) {
  const t = useTranslations('Components.TransactionsDrawer')
  let label = t('statusConfirmed')
  let bg = 'rgba(34, 197, 94, 0.15)'
  let color = 'var(--growth)'

  if (status === 'pending') {
    label = t('statusPending')
    bg = 'rgba(59, 130, 246, 0.15)'
    color = '#3b82f6'
  } else if (status === 'timeout_pending') {
    label = t('statusStillPending')
    bg = 'rgba(234, 179, 8, 0.15)'
    color = '#eab308'
  } else if (status === 'failed') {
    label = t('statusFailed')
    bg = 'rgba(239, 68, 68, 0.15)'
    color = 'var(--ember)'
  }

  return (
    <span
      style={{
        padding: '2px 8px',
        borderRadius: 'var(--radius-pill)',
        background: bg,
        color,
        fontFamily: 'var(--font-data)',
        fontSize: 'var(--type-caption)',
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  )
}

function formatTimeAgo(timestamp: number, locale: string): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' })
  if (seconds < 60) return formatter.format(-Math.max(1, seconds), 'second')
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return formatter.format(-minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  return formatter.format(-hours, 'hour')
}
