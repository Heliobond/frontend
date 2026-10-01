'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Badge, Button, AddressChip, useToast } from '@/components'
import {
  sectionCard,
  statRow,
  subtext,
  consolePage,
  header,
  pageTitle,
  sectionTitle,
  statCell,
  statCellLabel,
  statValueRow,
  statValue,
  statUnit,
  whitelistRow,
  whitelistName,
  whitelistNameText,
  whitelistMeta,
  whitelistData,
  whitelistActions,
} from '@/theme'
import { VAULT_STATS, REGISTRY, WHITELIST, type RegistryEntry, type Creator } from '@/data/admin'
import { RegistryTable } from './RegistryTable'
import { OracleForms } from './OracleForms'
import { OFF_SCREEN_PROJECTS_COUNT } from '@/data'
import { parseFundedNum } from './utils'
import { formatMoney as sharedFormatMoney } from '@/lib/format'
import { formatSharePrice, fetchTotalAssets, fetchUtilizationBps } from '@/wallet/vault'
import { useWallet } from '@/wallet/WalletProvider'
import { fetchProjectsPage } from '@/wallet/registry'
import {
  submitFundProject,
  submitUpdateScores,
  submitSetWhitelist,
  submitSetPaused,
  fetchIsPaused,
  isMultisigDeployment,
} from '@/wallet/admin'

/**
 * AdminConsole — the internal admin / oracle surface. Same design system as the
 * consumer app, but DENSER: tighter padding, smaller type, hairline-separated
 * rows, mono tabular numerals on every figure, and a real registry table.
 * All interactivity is local in-memory state — these stand in for privileged
 * InvestmentVault + ProjectRegistry writes. Honest, plain-language confirms.
 */

export function AdminConsole() {
  const t = useTranslations('Admin')
  const { toast } = useToast()
  const { address, sign } = useWallet()
  const [registry, setRegistry] = useState<RegistryEntry[]>(REGISTRY)
  const [whitelist, setWhitelist] = useState<Creator[]>(WHITELIST)
  // Vault liquid + deployed shift as the oracle funds projects.
  const [liquid, setLiquid] = useState(VAULT_STATS.liquid)
  const [deployed, setDeployed] = useState(VAULT_STATS.deployed)
  const [isMultisig, setIsMultisig] = useState(false)
  const [vaultPaused, setVaultPaused] = useState(false)
  const [registryPaused, setRegistryPaused] = useState(false)

  // Live contract reads on mount
  useEffect(() => {
    let active = true

    fetchProjectsPage(0, 50, address ?? undefined)
      .then((res) => {
        if (!active || res.projects.length === 0) return
        setRegistry(
          res.projects.map((p, i) => ({
            ...p,
            lastVerified: REGISTRY[i]?.lastVerified ?? 'on-chain',
          })),
        )
      })
      .catch(() => {})

    Promise.all([
      fetchIsPaused('vault', address ?? undefined).catch(() => false),
      fetchIsPaused('registry', address ?? undefined).catch(() => false),
    ]).then(([isVaultPaused, isRegistryPaused]) => {
      if (!active) return
      setVaultPaused(isVaultPaused)
      setRegistryPaused(isRegistryPaused)
    })

    if (address) {
      Promise.all([
        fetchTotalAssets(address).catch(() => null),
        fetchUtilizationBps(address).catch(() => null),
        isMultisigDeployment(address).catch(() => false),
      ]).then(([liveAssets, utilBps, multisig]) => {
        if (!active) return
        setIsMultisig(Boolean(multisig))
        if (liveAssets !== null && liveAssets > 0) {
          const bps = utilBps ?? 0
          const liveDeployed = (liveAssets * bps) / 10000
          const liveLiquid = liveAssets - liveDeployed
          setLiquid(liveLiquid)
          setDeployed(liveDeployed)
        }
      })
    }

    return () => {
      active = false
    }
  }, [address])

  // The pool funds 14 projects: 6 demo projects in the registry plus 8 historical/off-screen projects.
  const fundedCount =
    registry.filter((r) => parseFundedNum(r.funded) > 0).length + OFF_SCREEN_PROJECTS_COUNT

  const updateScores = async (id: number, credit: number, green: number) => {
    setRegistry((rows) =>
      rows.map((r) => (r.id === id ? { ...r, credit, green, lastVerified: 'just now' } : r)),
    )
    const name = registry.find((r) => r.id === id)?.name ?? 'project'
    try {
      const res = await submitUpdateScores(id, credit, green, address ?? '', sign, isMultisig)
      toast({
        tone: 'success',
        title: t('toastScoresTitle'),
        message:
          t('toastScoresMsg', { name, credit, green }) +
          (res.approvalCount ? ` (${res.approvalCount} approval recorded)` : ''),
        duration: 5000,
      })
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Transaction failed',
        message: e instanceof Error ? e.message : 'Failed to update scores',
        duration: 5000,
      })
    }
  }

  const fundProject = async (id: number, amount: number) => {
    if (registryPaused) {
      toast({
        tone: 'error',
        title: 'Action blocked',
        message: 'ProjectRegistry is currently paused. Project funding is disabled.',
        duration: 5000,
      })
      return
    }
    const safe = Math.min(amount, liquid)
    setRegistry((rows) =>
      rows.map((r) =>
        r.id === id ? { ...r, funded: formatFunded(parseFundedNum(r.funded) + safe) } : r,
      ),
    )
    setLiquid((l) => l - safe)
    setDeployed((d) => d + safe)
    const name = registry.find((r) => r.id === id)?.name ?? 'project'
    try {
      const res = await submitFundProject(id, safe, address ?? '', sign, isMultisig)
      toast({
        tone: 'solar',
        title: t('toastFundTitle'),
        message:
          t('toastFundMsg', { name, amount: sharedFormatMoney(safe) }) +
          (res.approvalCount ? ` (${res.approvalCount} approval recorded)` : ''),
        duration: 5000,
      })
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Transaction failed',
        message: e instanceof Error ? e.message : 'Failed to fund project',
        duration: 5000,
      })
    }
  }

  const setCreatorStatus = async (
    targetAddress: string,
    status: Creator['status'],
    rejectionReason?: string,
  ) => {
    // Revoking a creator is consequential: confirm first, then offer undo.
    if (status === 'pending' || status === 'rejected') {
      const c = whitelist.find((x) => x.address === targetAddress)
      if (!window.confirm(`${t('actionRevoke')} ${c?.name ?? 'Creator'}?`)) return
    }
    setWhitelist((list) =>
      list.map((c) =>
        c.address === targetAddress
          ? { ...c, status, rejectionReason: status === 'rejected' ? rejectionReason : undefined }
          : c,
      ),
    )
    const c = whitelist.find((x) => x.address === targetAddress)
    const toneMap = {
      approved: 'success' as const,
      rejected: 'error' as const,
      pending: 'neutral' as const,
    }
    const titleMap = {
      approved: t('toastApprovedTitle'),
      rejected: t('toastRevokedTitle'),
      pending: t('toastRevokedTitle'),
    }
    const messageMap = {
      approved: t('toastApprovedMsg', { name: c?.name ?? 'Creator' }),
      rejected: t('toastRevokedMsg', { name: c?.name ?? 'Creator' }),
      pending: t('toastRevokedMsg', { name: c?.name ?? 'Creator' }),
    }
    try {
      const res = await submitSetWhitelist(
        targetAddress,
        status === 'approved',
        address ?? '',
        sign,
        isMultisig,
      )
      toast({
        tone: toneMap[status],
        title: titleMap[status],
        message:
          messageMap[status] +
          (res.approvalCount ? ` (${res.approvalCount} approval recorded)` : ''),
        action:
          status !== 'approved' ? (
            <button
              type="button"
              onClick={() => setCreatorStatus(targetAddress, 'approved')}
              style={{
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: 'var(--type-data)',
                color: 'var(--solar)',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {t('actionUndo')}
            </button>
          ) : undefined,
        duration: 5000,
      })
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Transaction failed',
        message: e instanceof Error ? e.message : 'Failed to update whitelist',
        duration: 5000,
      })
    }
  }

  const toggleVaultPause = async () => {
    const next = !vaultPaused
    const actionName = next ? 'Pause InvestmentVault' : 'Resume InvestmentVault'
    if (
      !window.confirm(
        `${actionName}? ${
          next
            ? 'User deposits and withdrawals will be suspended on-chain.'
            : 'Normal vault operations will resume.'
        }`,
      )
    ) {
      return
    }
    try {
      console.error('>>> Calling submitSetPaused now! type:', typeof submitSetPaused)
      const res = await submitSetPaused('vault', next, address ?? '', sign)
      console.error('>>> submitSetPaused returned:', res)
      setVaultPaused(next)
      toast({
        tone: next ? 'error' : 'success',
        title: next ? 'InvestmentVault paused' : 'InvestmentVault resumed',
        message: next
          ? 'Vault deposits and withdrawals are now suspended.'
          : 'Vault is active. Normal deposits and withdrawals resumed.',
        duration: 5000,
      })
    } catch (e) {
      console.error('>>> submitSetPaused error:', e)
      toast({
        tone: 'error',
        title: 'Transaction failed',
        message: e instanceof Error ? e.message : 'Failed to change vault pause state',
        duration: 5000,
      })
    }
  }

  const toggleRegistryPause = async () => {
    const next = !registryPaused
    const actionName = next ? 'Pause ProjectRegistry' : 'Resume ProjectRegistry'
    if (
      !window.confirm(
        `${actionName}? ${
          next
            ? 'Project funding and registrations will be suspended on-chain.'
            : 'Normal registry operations will resume.'
        }`,
      )
    ) {
      return
    }
    try {
      await submitSetPaused('registry', next, address ?? '', sign)
      setRegistryPaused(next)
      toast({
        tone: next ? 'error' : 'success',
        title: next ? 'ProjectRegistry paused' : 'ProjectRegistry resumed',
        message: next
          ? 'Registry is now paused. Project funding is suspended.'
          : 'Registry is active. Project registrations and funding resumed.',
        duration: 5000,
      })
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Transaction failed',
        message: e instanceof Error ? e.message : 'Failed to change registry pause state',
        duration: 5000,
      })
    }
  }

  const totalAssets = liquid + deployed

  return (
    <div style={consolePage}>
      {/* Header */}
      <header style={header}>
        <div>
          <div className="hb-eyebrow" style={{ marginBottom: 8 }}>
            {t('eyebrow')}
          </div>
          <h1 style={pageTitle}>{t('h1')}</h1>
          <p style={{ ...subtext, marginTop: 6 }}>{t('subtitle')}</p>
        </div>
        <Badge tone="testnet">{t('badgeInternal')}</Badge>
      </header>

      {/* Circuit Breaker Emergency Banner */}
      {(vaultPaused || registryPaused) && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            marginBottom: 20,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <strong style={{ color: 'var(--red, #ef4444)' }}>CIRCUIT BREAKER ACTIVE:</strong>{' '}
            <span style={{ fontSize: 'var(--type-body)' }}>
              {vaultPaused && registryPaused
                ? 'Both InvestmentVault and ProjectRegistry are paused.'
                : vaultPaused
                  ? 'InvestmentVault is paused. Deposits and withdrawals are suspended.'
                  : 'ProjectRegistry is paused. Project funding is suspended.'}
            </span>
          </div>
          <Badge tone="ember">PAUSED</Badge>
        </div>
      )}

      {/* Vault overview — dense horizontal row of stat cells */}
      <section style={{ ...sectionCard, padding: 0, marginBottom: 20 }}>
        <div style={statRow}>
          <StatCell
            label={t('statTotalAssets')}
            value={sharedFormatMoney(totalAssets, { includeSymbol: true })}
          />
          <StatCell
            label={t('statSharePrice')}
            value={formatSharePrice(VAULT_STATS.sharePrice)}
            unit="USDC/HBS"
          />
          <StatCell label={t('statHbsSupply')} value={sharedFormatMoney(VAULT_STATS.hbsSupply)} />
          <StatCell
            label={t('statLiquid')}
            value={sharedFormatMoney(liquid, { includeSymbol: true })}
          />
          <StatCell
            label={t('statDeployed')}
            value={sharedFormatMoney(deployed, { includeSymbol: true })}
          />
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
              style={{ ...whitelistRow, borderTop: i ? '1px solid var(--ink-12)' : 'none' }}
            >
              <div style={whitelistName}>
                <div style={whitelistNameText}>{c.name}</div>
                <div style={whitelistMeta}>
                  <span style={whitelistData}>{c.projects}</span>{' '}
                  {t('liveProject', { count: c.projects })}
                </div>
              </div>
              <AddressChip value={c.address} label="creator address" />
              <Badge tone={c.status === 'approved' ? 'growth' : 'neutral'}>
                {c.status === 'approved' ? t('statusApproved') : t('statusPending')}
              </Badge>
              <div style={whitelistActions}>
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

      {/* Circuit Breakers & Emergency Controls */}
      <Section
        title="Circuit Breakers"
        caption="Emergency pause and resume controls for InvestmentVault and ProjectRegistry contracts."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--surface-sunken, rgba(255,255,255,0.02))',
              borderRadius: 8,
              border: '1px solid var(--ink-12)',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--type-body)' }}>InvestmentVault</div>
              <p style={{ ...subtext, marginTop: 2 }}>
                {vaultPaused
                  ? 'Vault operations are paused. User deposits and withdrawals are suspended.'
                  : 'Vault is operating normally. Deposits and withdrawals are active.'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Badge tone={vaultPaused ? 'ember' : 'growth'}>
                {vaultPaused ? 'Paused' : 'Active'}
              </Badge>
              <Button
                size="sm"
                variant={vaultPaused ? 'primary' : 'ghost'}
                onClick={toggleVaultPause}
              >
                {vaultPaused ? 'Resume Vault' : 'Pause Vault'}
              </Button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--surface-sunken, rgba(255,255,255,0.02))',
              borderRadius: 8,
              border: '1px solid var(--ink-12)',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--type-body)' }}>ProjectRegistry</div>
              <p style={{ ...subtext, marginTop: 2 }}>
                {registryPaused
                  ? 'Registry is paused. Project registrations and funding are suspended.'
                  : 'Registry is operating normally. Project registrations and funding are active.'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Badge tone={registryPaused ? 'ember' : 'growth'}>
                {registryPaused ? 'Paused' : 'Active'}
              </Badge>
              <Button
                size="sm"
                variant={registryPaused ? 'primary' : 'ghost'}
                onClick={toggleRegistryPause}
              >
                {registryPaused ? 'Resume Registry' : 'Pause Registry'}
              </Button>
            </div>
          </div>
        </div>
      </Section>
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
        <h2 style={sectionTitle}>{title}</h2>
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
        ...statCell,
        borderInlineEnd: last ? 'none' : '1px solid var(--ink-12)',
      }}
    >
      <div className="hb-eyebrow" style={statCellLabel}>
        {label}
      </div>
      <div style={statValueRow}>
        <span style={statValue}>{value}</span>
        {unit && <span style={statUnit}>{unit}</span>}
      </div>
    </div>
  )
}

// --- formatting helpers (no Math.random; deterministic) -------------------
export { parseFundedNum }

export function formatFunded(n: number): string {
  return sharedFormatMoney(n, { includeSymbol: true })
}
