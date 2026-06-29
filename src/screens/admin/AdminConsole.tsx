'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
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
  const [registry, setRegistry] = useState<RegistryEntry[]>(REGISTRY)
  const [whitelist, setWhitelist] = useState<Creator[]>(WHITELIST)
  // Vault liquid + deployed shift as the oracle funds projects.
  const [liquid, setLiquid] = useState(VAULT_STATS.liquid)
  const [deployed, setDeployed] = useState(VAULT_STATS.deployed)
  const [toast, setToast] = useState<ToastState | null>(null)

  // The vault funds more projects than the 6 demo registry rows; show the pool's
  // own count so it agrees with the deployed-capital figure beside it.
  const fundedCount = VAULT_STATS.projectsFunded

  const updateScores = (id: number, credit: number, green: number) => {
    setRegistry((rows) =>
      rows.map((r) => (r.id === id ? { ...r, credit, green, lastVerified: 'just now' } : r)),
    )
    const name = registry.find((r) => r.id === id)?.name ?? 'project'
    setToast({
      tone: 'success',
      title: 'Scores written on-chain',
      message: `${name} re-verified: credit ${credit}, green ${green}.`,
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
      title: 'Capital deployed',
      message: `Funded ${name} with $${safe.toLocaleString('en-US')} from the vault.`,
    })
  }

  const setCreatorStatus = (address: string, status: Creator['status']) => {
    setWhitelist((list) => list.map((c) => (c.address === address ? { ...c, status } : c)))
    const c = whitelist.find((x) => x.address === address)
    setToast({
      tone: status === 'approved' ? 'success' : 'neutral',
      title: status === 'approved' ? 'Creator approved' : 'Creator revoked',
      message:
        status === 'approved'
          ? `${c?.name ?? 'Creator'} can now register projects.`
          : `${c?.name ?? 'Creator'} can no longer register new projects.`,
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
            Heliobond internal
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: 28,
              margin: 0,
              color: 'var(--ink)',
            }}
          >
            Admin · oracle console
          </h1>
          <p style={{ ...subtext, marginTop: 6 }}>
            Verify scores, deploy vault capital, and manage the creator whitelist. Every write is
            on-chain.
          </p>
        </div>
        <Badge tone="testnet">Internal · testnet</Badge>
      </header>

      {/* Vault overview — dense horizontal row of stat cells */}
      <section style={{ ...sectionCard, padding: 0, marginBottom: 20 }}>
        <div style={statRow}>
          <StatCell label="Total assets" value={`$${formatMoney(totalAssets)}`} />
          <StatCell label="Share price" value={VAULT_STATS.sharePrice.toFixed(4)} unit="USDC/HBS" />
          <StatCell label="HBS supply" value={formatMoney(VAULT_STATS.hbsSupply)} />
          <StatCell label="Liquid USDC" value={`$${formatMoney(liquid)}`} />
          <StatCell label="Capital deployed" value={`$${formatMoney(deployed)}`} />
          <StatCell label="Projects funded" value={String(fundedCount)} last />
        </div>
      </section>

      {/* Project registry table */}
      <Section
        title="Project registry"
        caption="Oracle-verified credit & green scores. Click a header to reorder; update inline."
      >
        <RegistryTable rows={registry} onSave={updateScores} />
      </Section>

      {/* Oracle actions */}
      <Section title="Oracle actions" caption="Privileged writes to the registry and the vault.">
        <OracleForms
          projects={registry}
          liquid={liquid}
          onPushScores={updateScores}
          onFund={fundProject}
        />
      </Section>

      {/* Whitelist management */}
      <Section
        title="Creator whitelist"
        caption="Only approved creators can register projects in the ProjectRegistry."
      >
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
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ ...subtext, fontSize: 12 }}>
                  <span style={{ fontFamily: 'var(--font-data)', fontFeatureSettings: '"tnum" 1' }}>
                    {c.projects}
                  </span>{' '}
                  live {c.projects === 1 ? 'project' : 'projects'}
                </div>
              </div>
              <AddressChip value={c.address} label="creator address" />
              <Badge tone={c.status === 'approved' ? 'growth' : 'neutral'}>
                {c.status === 'approved' ? 'Approved' : 'Pending'}
              </Badge>
              <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                {c.status === 'approved' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCreatorStatus(c.address, 'pending')}
                  >
                    Revoke
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCreatorStatus(c.address, 'approved')}
                  >
                    Approve
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
            fontSize: 18,
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
            fontSize: 19,
            color: 'var(--ink)',
            fontFeatureSettings: '"tnum" 1',
            lineHeight: 1.1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontFamily: 'var(--font-data)', fontSize: 11, color: 'var(--ink-60)' }}>
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

function parseFundedNum(s: string): number {
  const n = Number(s.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function formatFunded(n: number): string {
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
  fontSize: 12.5,
  lineHeight: 1.5,
  color: 'var(--ink-60)',
}
