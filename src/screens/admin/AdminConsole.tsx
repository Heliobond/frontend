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
  warningBoxStyle,
  warningTextStyle,
} from '@/theme'
import { VAULT_STATS, REGISTRY, WHITELIST, type RegistryEntry, type Creator } from '@/data/admin'
import { RegistryTable } from './RegistryTable'
import { OracleForms } from './OracleForms'
import { OFF_SCREEN_PROJECTS_COUNT } from '@/data'
import { parseFundedNum } from './utils'
import { formatMoney as sharedFormatMoney } from '@/lib/format'
import { formatSharePrice, fetchTotalAssets, fetchUtilizationBps } from '@/wallet/vault'
import { useWallet } from '@/wallet/WalletProvider'
import { fetchProjectsPage, clearRegistryCache, isRegistryConfigured } from '@/wallet/registry'
import {
  submitFundProject,
  submitUpdateScores,
  submitSetWhitelist,
  submitSetPaused,
  isMultisigDeployment,
  getAdminRoles,
  getPauseState,
  type AdminRoles,
  type PauseState,
  type PausableContract,
} from '@/wallet/admin'

export interface AdminConsoleProps {
  roles?: AdminRoles
}

type PauseStates = Record<PausableContract, PauseState>

const NO_PAUSE: PauseState = { paused: null, emergencyAdmin: null }
const NO_PAUSES: PauseStates = { vault: NO_PAUSE, registry: NO_PAUSE }

/** Live registry rows, or null when the registry has no projects to show. */
async function loadRegistryRows(address: string | null): Promise<RegistryEntry[] | null> {
  const res = await fetchProjectsPage(0, 50, address ?? undefined)
  if (res.projects.length === 0) return null
  return res.projects.map((p, i) => ({
    ...p,
    lastVerified: REGISTRY[i]?.lastVerified ?? 'on-chain',
  }))
}

/** Live vault liquid and deployed amounts, or null when they cannot be read. */
async function loadVaultFigures(
  address: string,
): Promise<{ liquid: number; deployed: number } | null> {
  const [liveAssets, utilBps] = await Promise.all([
    fetchTotalAssets(address).catch(() => null),
    fetchUtilizationBps(address).catch(() => null),
  ])
  if (liveAssets === null || liveAssets <= 0) return null
  const deployed = (liveAssets * (utilBps ?? 0)) / 10000
  return { liquid: liveAssets - deployed, deployed }
}

async function loadPauseStates(address: string | null): Promise<PauseStates> {
  const [vault, registry] = await Promise.all([
    getPauseState('vault', address),
    getPauseState('registry', address),
  ])
  return { vault, registry }
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
  const [pauseStates, setPauseStates] = useState<PauseStates>(NO_PAUSES)

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

  const vaultPaused = pauseStates.vault.paused === true
  const registryPaused = pauseStates.registry.paused === true

  // A pause blocks the forms it gates. The reason is shown on each locked control.
  const fundBlockedReason = vaultPaused
    ? 'Vault is paused'
    : registryPaused
      ? 'Registry is paused'
      : undefined
  const scoresBlockedReason = registryPaused ? 'Registry is paused' : undefined
  const whitelistBlockedReason = registryPaused ? 'Registry is paused' : undefined

  // Live contract reads on mount
  useEffect(() => {
    let active = true

    loadRegistryRows(address)
      .then((rows) => {
        if (active && rows) setRegistry(rows)
      })
      .catch(() => {})

    if (address) {
      Promise.all([
        loadVaultFigures(address),
        isMultisigDeployment(address).catch(() => false),
        loadPauseStates(address).catch(() => NO_PAUSES),
      ]).then(([figures, multisig, pauses]) => {
        if (!active) return
        setIsMultisig(Boolean(multisig))
        if (figures) {
          setLiquid(figures.liquid)
          setDeployed(figures.deployed)
        }
        setPauseStates(pauses)
      })
    }

    return () => {
      active = false
    }
  }, [address])

  // Re-read the registry from chain after a write. Returns false when there is no
  // chain to read (demo mode) or the read failed, so the caller can apply the change locally.
  const refreshRegistry = async (): Promise<boolean> => {
    if (!isRegistryConfigured()) return false
    clearRegistryCache()
    const rows = await loadRegistryRows(address).catch(() => null)
    if (rows) setRegistry(rows)
    return rows !== null
  }

  const refreshVault = async (): Promise<boolean> => {
    if (!address) return false
    const figures = await loadVaultFigures(address)
    if (!figures) return false
    setLiquid(figures.liquid)
    setDeployed(figures.deployed)
    return true
  }

  const refreshPauseStates = async () => {
    setPauseStates(await loadPauseStates(address))
  }

  // The pool funds 14 projects: 6 demo projects in the registry plus 8 historical/off-screen projects.
  const fundedCount =
    registry.filter((r) => parseFundedNum(r.funded) > 0).length + OFF_SCREEN_PROJECTS_COUNT

  // Nothing changes on screen until the transaction is confirmed. On failure the
  // row keeps its values, and the form keeps the admin's input for a retry.
  const updateScores = async (id: number, credit: number, green: number): Promise<boolean> => {
    const name = registry.find((r) => r.id === id)?.name ?? 'project'
    try {
      const res = await submitUpdateScores(id, credit, green, address ?? '', sign, isMultisig)
      const refreshed = await refreshRegistry()
      setRegistry((rows) =>
        rows.map((r) =>
          r.id === id
            ? { ...r, ...(refreshed ? {} : { credit, green }), lastVerified: 'just now' }
            : r,
        ),
      )
      toast({
        tone: 'success',
        title: t('toastScoresTitle'),
        message:
          t('toastScoresMsg', { name, credit, green }) +
          (res.approvalCount ? ` (${res.approvalCount} approval recorded)` : '') +
          ` · tx ${res.hash.slice(0, 8)}…`,
        duration: 5000,
      })
      return true
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Transaction failed',
        message: e instanceof Error ? e.message : 'Failed to update scores',
        duration: 5000,
      })
      return false
    }
  }

  const fundProject = async (id: number, amount: number): Promise<boolean> => {
    const name = registry.find((r) => r.id === id)?.name ?? 'project'
    try {
      const res = await submitFundProject(id, amount, address ?? '', sign, isMultisig)
      const [vaultRefreshed, registryRefreshed] = await Promise.all([
        refreshVault(),
        refreshRegistry(),
      ])
      if (!vaultRefreshed) {
        setLiquid((l) => l - amount)
        setDeployed((d) => d + amount)
      }
      if (!registryRefreshed) {
        setRegistry((rows) =>
          rows.map((r) =>
            r.id === id ? { ...r, funded: formatFunded(parseFundedNum(r.funded) + amount) } : r,
          ),
        )
      }
      toast({
        tone: 'solar',
        title: t('toastFundTitle'),
        message:
          t('toastFundMsg', { name, amount: sharedFormatMoney(amount) }) +
          (res.approvalCount ? ` (${res.approvalCount} approval recorded)` : '') +
          ` · tx ${res.hash.slice(0, 8)}…`,
        duration: 5000,
      })
      return true
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Transaction failed',
        message: e instanceof Error ? e.message : 'Failed to fund project',
        duration: 5000,
      })
      return false
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

  // Owner pauses with pause()/unpause(). The emergency admin uses emergency_pause(caller).
  const ownsContract = (contract: PausableContract): boolean => {
    if (!roles) return true
    return contract === 'vault'
      ? roles.isVaultOwner || roles.isConfiguredAdmin
      : roles.isRegistryOwner || roles.isConfiguredAdmin
  }

  const isEmergencyAdmin = (contract: PausableContract): boolean => {
    const emergencyAdmin = pauseStates[contract].emergencyAdmin
    return Boolean(
      address && emergencyAdmin && emergencyAdmin.toUpperCase() === address.toUpperCase(),
    )
  }

  const togglePause = async (contract: PausableContract, paused: boolean) => {
    const label = contract === 'vault' ? 'vault' : 'registry'
    const message = paused
      ? contract === 'vault'
        ? 'Deposits, withdrawals and funding stop until resumed.'
        : 'Score updates, whitelisting, project creation and funding stop until resumed.'
      : 'Blocked actions become available again.'
    if (!window.confirm(`${paused ? 'Pause' : 'Resume'} the ${label}? ${message}`)) return

    const emergency = !ownsContract(contract) && isEmergencyAdmin(contract)
    try {
      await submitSetPaused(contract, paused, address ?? '', sign, { emergency })
      toast({
        tone: paused ? 'error' : 'success',
        title: `${label[0].toUpperCase()}${label.slice(1)} ${paused ? 'paused' : 'resumed'}`,
        message: emergency ? 'Sent as emergency admin.' : 'Sent as owner.',
        duration: 5000,
      })
      await refreshPauseStates()
    } catch (e) {
      toast({
        tone: 'error',
        title: 'Transaction failed',
        message: e instanceof Error ? e.message : 'Failed to change pause state',
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

      {(vaultPaused || registryPaused) && (
        <div role="status" style={{ ...warningBoxStyle, marginBottom: 20 }}>
          <p style={warningTextStyle}>
            {vaultPaused && 'The vault is paused. Deposits, withdrawals and funding are stopped. '}
            {registryPaused &&
              'The registry is paused. Score updates, whitelisting and project creation are stopped, and funding is blocked.'}
          </p>
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

      {/* Circuit breakers */}
      <Section
        title="Circuit breakers"
        caption="Pause the vault or the registry in an emergency. Pausing stops the writes listed beside each contract."
      >
        <PauseRow
          label="Investment vault"
          state={pauseStates.vault}
          canAct={ownsContract('vault') || isEmergencyAdmin('vault')}
          onToggle={(paused) => togglePause('vault', paused)}
        />
        <PauseRow
          label="Project registry"
          state={pauseStates.registry}
          canAct={ownsContract('registry') || isEmergencyAdmin('registry')}
          onToggle={(paused) => togglePause('registry', paused)}
          last
        />
      </Section>

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
        <RegistryTable
          rows={registry}
          onSave={updateScores}
          updateDisabledReason={scoresBlockedReason}
        />
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
          scoresDisabledReason={scoresBlockedReason}
          fundDisabledReason={fundBlockedReason}
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
        {whitelistBlockedReason && (
          <div role="status" style={{ ...warningBoxStyle, marginBottom: 12 }}>
            <p style={warningTextStyle}>{whitelistBlockedReason}. Whitelisting is disabled.</p>
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
                    disabled={!canManageWhitelist || Boolean(whitelistBlockedReason)}
                    reason={whitelistBlockedReason}
                    onClick={() => setCreatorStatus(c.address, 'pending')}
                  >
                    {t('actionRevoke')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canManageWhitelist || Boolean(whitelistBlockedReason)}
                    reason={whitelistBlockedReason}
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

function PauseRow({
  label,
  state,
  canAct,
  onToggle,
  last,
}: {
  label: string
  state: PauseState
  canAct: boolean
  onToggle: (paused: boolean) => void
  last?: boolean
}) {
  const unknown = state.paused === null
  const paused = state.paused === true
  const reason = unknown
    ? 'Status unavailable'
    : !canAct
      ? 'Owner or emergency admin only'
      : undefined

  return (
    <div
      style={{
        ...whitelistRow,
        borderTop: '1px solid var(--ink-12)',
        borderBottom: last ? '1px solid var(--ink-12)' : 'none',
      }}
    >
      <div style={whitelistName}>
        <div style={whitelistNameText}>{label}</div>
        <div style={whitelistMeta}>
          {state.emergencyAdmin ? 'Emergency admin set' : 'No emergency admin'}
        </div>
      </div>
      <Badge tone={paused ? 'neutral' : 'growth'}>
        {unknown ? 'Unknown' : paused ? 'Paused' : 'Live'}
      </Badge>
      <div style={whitelistActions}>
        <Button
          size="sm"
          variant={paused ? 'primary' : 'ghost'}
          disabled={unknown || !canAct}
          reason={reason}
          onClick={() => onToggle(!paused)}
        >
          {paused ? 'Resume' : 'Pause'}
        </Button>
      </div>
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
