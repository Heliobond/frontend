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
  isMultisigDeployment,
  getAdminRoles,
  type AdminRoles,
} from '@/wallet/admin'

export interface AdminConsoleProps {
  roles?: AdminRoles
}

export function AdminConsole({ roles: propRoles }: AdminConsoleProps = {}) {
  const t = useTranslations('Admin')
  const { toast } = useToast()
  const { address, sign } = useWallet()
  const [registry, setRegistry] = useState<RegistryEntry[]>(REGISTRY)
  const [whitelist, setWhitelist] = useState<Creator[]>(WHITELIST)
  // Vault liquid + deployed shift as the oracle funds projects.
  const [liquid, setLiquid] = useState(VAULT_STATS.liquid)
  const [deployed, setDeployed] = useState(VAULT_STATS.deployed)
  const [isMultisig, setIsMultisig] = useState(false)
  const [fetchedRoles, setFetchedRoles] = useState<AdminRoles | undefined>()

  useEffect(() => {
    if (propRoles) return
    if (address) {
      getAdminRoles(address)
        .then(setFetchedRoles)
        .catch(() => {})
    }
  }, [propRoles, address])

  const roles = propRoles ?? fetchedRoles

  const canFund = roles ? roles.isVaultOwner || roles.isConfiguredAdmin : true
  const canUpdateScores = roles ? roles.isRegistryOwner || roles.isConfiguredAdmin : true
  const canManageWhitelist = roles
    ? roles.isWhitelister || roles.isRegistryOwner || roles.isConfiguredAdmin
    : true

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
    const prevRegistry = registry
    const name = registry.find((r) => r.id === id)?.name ?? 'project'
    try {
      const res = await submitUpdateScores(id, credit, green, address ?? '', sign, isMultisig)
      setRegistry((rows) =>
        rows.map((r) => (r.id === id ? { ...r, credit, green, lastVerified: 'just now' } : r)),
      )
      toast({
        tone: 'success',
        title: t('toastScoresTitle'),
        message:
          t('toastScoresMsg', { name, credit, green }) +
          (res.approvalCount ? ` (${res.approvalCount} approval recorded)` : ''),
        duration: 5000,
      })
    } catch (e) {
      setRegistry(prevRegistry)
      toast({
        tone: 'error',
        title: 'Transaction failed',
        message: e instanceof Error ? e.message : 'Failed to update scores',
        duration: 5000,
      })
      throw e
    }
  }

  const fundProject = async (id: number, amount: number) => {
    const prevRegistry = registry
    const prevLiquid = liquid
    const prevDeployed = deployed
    const name = registry.find((r) => r.id === id)?.name ?? 'project'
    try {
      const res = await submitFundProject(id, amount, address ?? '', sign, isMultisig)
      setRegistry((rows) =>
        rows.map((r) =>
          r.id === id ? { ...r, funded: formatFunded(parseFundedNum(r.funded) + amount) } : r,
        ),
      )
      setLiquid((l) => l - amount)
      setDeployed((d) => d + amount)
      toast({
        tone: 'solar',
        title: t('toastFundTitle'),
        message:
          t('toastFundMsg', { name, amount: sharedFormatMoney(amount) }) +
          (res.approvalCount ? ` (${res.approvalCount} approval recorded)` : ''),
        duration: 5000,
      })
    } catch (e) {
      setRegistry(prevRegistry)
      setLiquid(prevLiquid)
      setDeployed(prevDeployed)
      toast({
        tone: 'error',
        title: 'Transaction failed',
        message: e instanceof Error ? e.message : 'Failed to fund project',
        duration: 5000,
      })
      throw e
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
        {!canUpdateScores && (
          <div
            style={{
              padding: '8px 12px',
              marginBottom: 12,
              background: 'var(--ink-06)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--type-caption)',
              color: 'var(--ink-60)',
            }}
          >
            Registry owner permissions required to update scores.
          </div>
        )}
        <RegistryTable rows={registry} onSave={updateScores} />
      </Section>

      {/* Oracle actions */}
      <Section title={t('sectionOracle')} caption={t('sectionOracleCaption')}>
        {(!canFund || !canUpdateScores) && (
          <div
            style={{
              padding: '8px 12px',
              marginBottom: 12,
              background: 'var(--ink-06)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--type-caption)',
              color: 'var(--ink-60)',
            }}
          >
            {!canFund && !canUpdateScores
              ? 'Vault owner or registry owner permissions required for privileged actions.'
              : !canFund
                ? 'Vault owner permissions required to fund projects.'
                : 'Registry owner permissions required to update scores.'}
          </div>
        )}
        <OracleForms
          projects={registry}
          liquid={liquid}
          onPushScores={updateScores}
          onFund={fundProject}
        />
      </Section>

      {/* Whitelist management */}
      <Section title={t('sectionWhitelist')} caption={t('sectionWhitelistCaption')}>
        {!canManageWhitelist && (
          <div
            style={{
              padding: '8px 12px',
              marginBottom: 12,
              background: 'var(--ink-06)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--type-caption)',
              color: 'var(--ink-60)',
            }}
          >
            Whitelister permissions required to manage the creator whitelist.
          </div>
        )}
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
                    disabled={!canManageWhitelist}
                    onClick={() => setCreatorStatus(c.address, 'pending')}
                  >
                    {t('actionRevoke')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canManageWhitelist}
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
