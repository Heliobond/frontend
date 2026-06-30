'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Badge, Button, AddressChip, Toast } from '@/components'
import { type ToastTone } from '@/components'
import { VAULT_STATS, REGISTRY, WHITELIST, type RegistryEntry, type Creator } from '@/data/admin'
import { RegistryTable } from './RegistryTable'
import { OracleForms } from './OracleForms'

/**
 * AdminConsole — the internal admin / oracle surface. Same design system as the
 * consumer app, but DENSER: tighter padding, smaller type, hairline-separated
 * rows, mono tabular numerals on every figure, and a real registry table.
 * All interactivity is local in-memory state — these stand in for privileged
 * InvestmentVault + ProjectRegistry writes. Honest, plain-language confirms.
 */
interface ToastState {
  tone: ToastTone
  title: string
  message: string
}

export function AdminConsole() {
  const t = useTranslations('Admin')
  const [registry, setRegistry] = useState<RegistryEntry[]>(REGISTRY)
  const [whitelist, setWhitelist] = useState<Creator[]>(WHITELIST)
  // Vault liquid + deployed shift as the oracle funds projects.
  const [liquid, setLiquid] = useState(VAULT_STATS.liquid)
  const [deployed, setDeployed] = useState(VAULT_STATS.deployed)
  const [toast, setToast] = useState<ToastState | null>(null)

  const fundedCount = registry.filter((r) => parseFundedNum(r.funded) > 0).length

  const updateScores = (id: number, credit: number, green: number) => {
    setRegistry((rows) =>
      rows.map((r) => (r.id === id ? { ...r, credit, green, lastVerified: 'just now' } : r)),
    )
    const name = registry.find((r) => r.id === id)?.name ?? 'project'
    setToast({
      tone: 'success',
      title: t('toastScoresTitle'),
      message: t('toastScoresMsg', { name, credit, green }),
    })
  }

  const fundProject = (id: number, amount: number) => {
    const safe = Math.min(amount, liquid)
    setRegistry((rows) =>
      rows.map((r) =>
        r.id === id ? { ...r, funded: formatFunded(parseFundedNum(r.funded) + safe) } : r,
      ),
    )
    setLiquid((l) => l - safe)
    setDeployed((d) => d + safe)
    const name = registry.find((r) => r.id === id)?.name ?? 'project'
    setToast({
      tone: 'solar',
      title: t('toastFundTitle'),
      message: t('toastFundMsg', { name, amount: safe.toLocaleString('en-US') }),
    })
  }

  const setCreatorStatus = (address: string, status: Creator['status']) => {
    setWhitelist((list) => list.map((c) => (c.address === address ? { ...c, status } : c)))
    const c = whitelist.find((x) => x.address === address)
    setToast({
      tone: status === 'approved' ? 'success' : 'neutral',
      title: status === 'approved' ? t('toastApprovedTitle') : t('toastRevokedTitle'),
      message:
        status === 'approved'
          ? t('toastApprovedMsg', { name: c?.name ?? 'Creator' })
          : t('toastRevokedMsg', { name: c?.name ?? 'Creator' }),
    })
  }

  const totalAssets = liquid + deployed

  return (
    <div style={{ fontFamily: 'var(--font-body)', color: 'var(--ink)' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 20,
        }}
      >
        <div>
          <div className="hb-eyebrow" style={{ marginBottom: 8 }}>
            {t('eyebrow')}
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 'var(--type-h2)',
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            {t('h1')}
          </h1>
          <p style={{ ...subtext, marginTop: 6 }}>{t('subtitle')}</p>
        </div>
        <Badge tone="testnet">{t('badgeInternal')}</Badge>
      </header>

      {/* Vault overview — dense horizontal row of stat cells */}
      <section style={{ ...sectionCard, padding: 0, marginBottom: 20 }}>
        <div style={statRow}>
          <StatCell label={t('statTotalAssets')} value={`$${formatMoney(totalAssets)}`} />
          <StatCell
            label={t('statSharePrice')}
            value={VAULT_STATS.sharePrice.toFixed(4)}
            unit="USDC/HBS"
          />
          <StatCell label={t('statHbsSupply')} value={formatMoney(VAULT_STATS.hbsSupply)} />
          <StatCell label={t('statLiquid')} value={`$${formatMoney(liquid)}`} />
          <StatCell label={t('statDeployed')} value={`$${formatMoney(deployed)}`} />
          <StatCell label={t('statProjectsFunded')} value={String(fundedCount)} last />
        </div>
      </section>

      {/* Project registry table */}
      <Section title={t('sectionRegistry')} caption={t('sectionRegistryCaption')}>
        <RegistryTable rows={registry} onSave={updateScores} />
      </Section>

      {/* Oracle actions */}
      <Section title={t('sectionOracle')} caption={t('sectionOracleCaption')}>
        <OracleForms
          projects={registry}
          liquid={liquid}
          onPushScores={updateScores}
          onFund={fundProject}
        />
      </Section>

      {/* Whitelist management */}
      <Section title={t('sectionWhitelist')} caption={t('sectionWhitelistCaption')}>
        <div>
          {whitelist.map((c, i) => (
            <div
              key={c.address}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                flexWrap: 'wrap',
                padding: '12px 0',
                borderTop: i ? '1px solid var(--ink-12)' : 'none',
              }}
            >
              <div style={{ minWidth: 180, flex: '1 1 200px' }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--type-small)' }}>{c.name}</div>
                <div style={{ ...subtext, fontSize: 'var(--type-eyebrow)' }}>
                  <span style={{ fontFamily: 'var(--font-data)', fontFeatureSettings: '"tnum" 1' }}>
                    {c.projects}
                  </span>{' '}
                  {t('liveProject', { count: c.projects })}
                </div>
              </div>
              <AddressChip value={c.address} label="creator address" />
              <Badge tone={c.status === 'approved' ? 'growth' : 'neutral'}>
                {c.status === 'approved' ? t('statusApproved') : t('statusPending')}
              </Badge>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                {c.status === 'approved' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCreatorStatus(c.address, 'pending')}
                  >
                    {t('actionRevoke')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCreatorStatus(c.address, 'approved')}
                  >
                    {t('actionApprove')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Transient confirmation */}
      {toast && (
        <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 50 }}>
          <Toast
            tone={toast.tone}
            title={toast.title}
            message={toast.message}
            onDismiss={() => setToast(null)}
          />
        </div>
      )}
    </div>
  )
}

function Section({
  title,
  caption,
  children,
}: {
  title: string
  caption: string
  children: ReactNode
}) {
  return (
    <section style={{ ...sectionCard, marginBottom: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'var(--type-h5)',
            margin: 0,
            color: 'var(--ink)',
          }}
        >
          {title}
        </h2>
        <p style={{ ...subtext, marginTop: 4 }}>{caption}</p>
      </div>
      {children}
    </section>
  )
}

function StatCell({
  label,
  value,
  unit,
  last,
}: {
  label: string
  value: string
  unit?: string
  last?: boolean
}) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 140,
        padding: '14px 16px',
        borderRight: last ? 'none' : '1px solid var(--ink-12)',
      }}
    >
      <div className="hb-eyebrow" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: 'var(--font-data)',
            fontWeight: 600,
            fontSize: 'var(--type-h4)',
            color: 'var(--ink)',
            fontFeatureSettings: '"tnum" 1',
            lineHeight: 1.1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 'var(--type-fine)',
              color: 'var(--ink-60)',
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  )
}

// --- formatting helpers (no Math.random; deterministic) -------------------
function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function parseFundedNum(s: string): number {
  const n = Number(s.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function formatFunded(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const sectionCard: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-card)',
  padding: 16,
  boxShadow: 'var(--shadow-sm)',
}

const statRow: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
}

const subtext: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-caption)',
  lineHeight: 1.5,
  color: 'var(--ink-60)',
}
