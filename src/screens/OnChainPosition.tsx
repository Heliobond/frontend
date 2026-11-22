'use client'

import { TransactionPendingError } from '../wallet/transactions'

import { useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { Button, Card, StatBlock, useToast } from '../components'
import { getExplorerTxUrl } from '../config/network'
import { formatDecimal } from '../lib/format'
import { parseErrorCode } from '../lib/errorMessages'
import { useWallet } from '../wallet/WalletProvider'
import { submitClaimYield } from '../wallet/vault'
import type { UsePortfolioResult } from '../hooks/usePortfolio'

/**
 * The connected wallet's live vault position (get_portfolio) with a Claim yield
 * action (claim_yield). Renders only when a vault contract is configured and a
 * real wallet is connected; demo sessions keep the fixture dashboard.
 */
export function OnChainPosition({
  portfolio,
  claimableYield,
  positionUnavailable,
}: Pick<UsePortfolioResult, 'portfolio' | 'claimableYield' | 'positionUnavailable'>) {
  const t = useTranslations('Portfolio')
  const tErrors = useTranslations('Errors')
  const { address, isDemo, sign } = useWallet()
  const { toast } = useToast()
  const [claimedPosition, setClaimedPosition] = useState<typeof portfolio>(null)
  const [claiming, setClaiming] = useState(false)
  const enabled = Boolean(process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID) && !isDemo && !!address
  const availableYield = portfolio === claimedPosition ? 0 : claimableYield

  if (!enabled) return null

  const handleClaimYield = async () => {
    if (!address) return
    setClaiming(true)
    try {
      const hash = await submitClaimYield(address, sign)
      // Keep the confirmed claim cleared until the dashboard's shared read settles.
      setClaimedPosition(portfolio)
      const explorerUrl = getExplorerTxUrl(hash)
      toast({
        tone: 'success',
        title: t('onchainClaimedTitle'),
        message: t('onchainClaimedBody'),
        href: explorerUrl,
        action: explorerLink(explorerUrl, t('onchainViewExplorer')),
      })
    } catch (e) {
      const isPending = e instanceof TransactionPendingError
      const errorMessage = isPending
        ? t('onchainClaimPendingBody')
        : tErrors(parseErrorCode(e) as never)
      const explorerUrl = isPending ? getExplorerTxUrl(e.hash) : undefined
      toast({
        tone: isPending ? 'solar' : 'error',
        title: isPending ? t('onchainClaimPendingTitle') : t('onchainClaimFailedTitle'),
        message: errorMessage,
        href: explorerUrl,
        action: explorerUrl ? (
          explorerLink(explorerUrl, t('onchainViewExplorer'))
        ) : (
          <button
            type="button"
            onClick={() => void handleClaimYield()}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-small)',
              fontWeight: 600,
              padding: '6px 12px',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              background: 'var(--ember)',
              color: 'var(--surface)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t('onchainRetry')}
          </button>
        ),
      })
    } finally {
      setClaiming(false)
    }
  }

  return (
    <Card data-testid="onchain-position" style={{ padding: 22, marginBottom: 28 }}>
      <h3 style={titleStyle}>{t('onchainTitle')}</h3>
      {positionUnavailable ? (
        <p role="alert" style={noteStyle}>
          {t('onchainReadError')}
        </p>
      ) : !portfolio ? (
        <p style={noteStyle}>{t('onchainReading')}</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-end' }}>
          <div data-testid="onchain-shares">
            <StatBlock
              label={t('onchainShares')}
              value={formatDecimal(portfolio.shares, 2)}
              size="md"
            />
          </div>
          <StatBlock
            label={t('onchainValue')}
            value={`$${formatDecimal(portfolio.usdcValue, 2)}`}
            size="md"
          />
          <div data-testid="onchain-claimable-yield">
            <StatBlock
              label={t('onchainClaimable')}
              value={`$${formatDecimal(availableYield, 2)}`}
              size="md"
            />
          </div>
          {availableYield > 0 && (
            <Button
              variant="primary"
              loading={claiming}
              disabled={claiming}
              onClick={() => void handleClaimYield()}
            >
              {t('onchainClaimCta')}
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}

function explorerLink(explorerUrl: string, label: string) {
  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--type-small)',
        color: 'var(--solar)',
        textDecoration: 'underline',
      }}
    >
      {label}
    </a>
  )
}

const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 'var(--type-h5)',
  color: 'var(--ink)',
  margin: '0 0 16px',
}

const noteStyle: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-small)',
  color: 'var(--ink-60)',
  margin: 0,
}
