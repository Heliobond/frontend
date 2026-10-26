'use client'

import { TransactionPendingError } from '../wallet/transactions'

import { useEffect, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { Button, Card, StatBlock, useToast } from '../components'
import { getExplorerTxUrl } from '../config/network'
import { formatDecimal } from '../lib/format'
import { parseErrorCode } from '../lib/errorMessages'
import { useVaultRefresh } from '../wallet/useVaultRefresh'
import { useWallet } from '../wallet/WalletProvider'
import { fetchPortfolio, submitClaimYield, type OnChainPortfolio } from '../wallet/vault'

/**
 * The connected wallet's live vault position (get_portfolio) with a Claim yield
 * action (claim_yield). Renders only when a vault contract is configured and a
 * real wallet is connected; demo sessions keep the fixture dashboard.
 */
export function OnChainPosition() {
  const t = useTranslations('Portfolio')
  const tErrors = useTranslations('Errors')
  const { address, isDemo, sign } = useWallet()
  const { toast } = useToast()
  const [portfolio, setPortfolio] = useState<OnChainPortfolio | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState(false)
  const enabled = Boolean(process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID) && !isDemo && !!address

  const { tick: reloads, refresh: refreshBalances } = useVaultRefresh(enabled)

  useEffect(() => {
    if (!enabled || !address || document.hidden) return
    let cancelled = false
    fetchPortfolio(address).then(
      (next) => {
        if (cancelled) return
        setPortfolio(next)
        setError(null)
      },
      () => {
        if (!cancelled) setError('onchainReadError')
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, address, reloads])

  if (!enabled) return null

  const handleClaimYield = async () => {
    if (!address) return
    setClaiming(true)
    try {
      const hash = await submitClaimYield(address, sign)
      // Displayed value drops to 0 immediately upon success (#590)
      setPortfolio((prev) => (prev ? { ...prev, claimableYield: 0 } : null))
      const explorerUrl = getExplorerTxUrl(hash)
      toast({
        tone: 'success',
        title: t('onchainClaimedTitle'),
        message: t('onchainClaimedBody'),
        href: explorerUrl,
        action: (
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
            {t('onchainViewExplorer')}
          </a>
        ),
      })
      // Refresh balances after confirmation (#590)
      refreshBalances()
    } catch (e) {
      const isPending = e instanceof TransactionPendingError
      const errorMessage = isPending
        ? t('onchainClaimPendingBody')
        : tErrors(parseErrorCode(e) as never)
      toast({
        tone: isPending ? 'solar' : 'error',
        title: isPending ? t('onchainClaimPendingTitle') : t('onchainClaimFailedTitle'),
        message: errorMessage,
        action: isPending ? undefined : (
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
      {error ? (
        <p role="alert" style={noteStyle}>
          {t(error as 'onchainReadError')}
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
              value={`$${formatDecimal(portfolio.claimableYield, 2)}`}
              size="md"
            />
          </div>
          {portfolio.claimableYield > 0 && (
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
