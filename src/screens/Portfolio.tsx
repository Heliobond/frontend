'use client'

import { TransactionPendingError } from '../wallet/transactions'

import { memo, useState, useEffect, useCallback, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Button, StatBlock, LiquidityMeter, Card, AddressChip, useToast } from '../components'
import { Helio } from '../brand/Helio'
import { useWallet } from '../wallet/WalletProvider'
import { getPendingClaims, removePendingClaim, type PendingClaim } from '../wallet/pendingClaims'
import { submitClaim } from '../wallet/vault'
import { formatDate, formatDecimal } from '../lib/format'
import { OnChainPosition } from './OnChainPosition'
import { usePortfolio } from '../hooks/usePortfolio'
import { useVault } from '../wallet/useVault'
import { getVirtualRange } from '../lib/virtualRange'
import { PortfolioPerformanceChart } from '../components/PortfolioPerformanceChart'

const MemoizedHelio = memo(Helio)

const MemoizedLiquidityMeter = memo(LiquidityMeter)
const ACTIVITY_ROW_HEIGHT = 84
const ACTIVITY_VIEWPORT_HEIGHT = 504
const ACTIVITY_OVERSCAN = 2

/**
 * Portfolio — calm dashboard. Headline value with delta since deposit, the
 * personal mini-Helio, and three always-visible figures including the permanent
 * "Available to withdraw now" liquidity truth.
 *
 * Driven by the connected wallet's live Soroban position (get_portfolio + claimable_yield)
 * with graceful fallback to demo fixtures when disconnected or in demo mode. (#589)
 */
export interface PortfolioProps {
  onWithdraw: () => void
  onDeposit: () => void
}

export const Portfolio = memo(function Portfolio({ onWithdraw, onDeposit }: PortfolioProps) {
  const t = useTranslations('Portfolio')
  const locale = useLocale()
  const { connected, connect, address, sign } = useWallet()
  const { toast } = useToast()

  // Drive portfolio metrics dynamically from the connected wallet
  const { portfolio, you, activity, loading, error, refresh } = usePortfolio()
  const { totalAssets } = useVault()

  const [pendingClaims, setPendingClaims] = useState<PendingClaim[]>([])
  const pendingClaimsTotal = pendingClaims.reduce((sum, c) => sum + (c.amount || 0), 0)
  const hasRisk = you.riskScore !== undefined && you.riskLevel !== undefined
  const referralLink = you.referralLink
  const hasValidReferral =
    !!referralLink && !referralLink.includes('…') && /^https?:\/\//.test(referralLink)
  const [claiming, setClaiming] = useState(false)
  const [activityScrollTop, setActivityScrollTop] = useState(0)
  const activityRange = getVirtualRange(
    activity.length,
    activityScrollTop,
    ACTIVITY_VIEWPORT_HEIGHT,
    ACTIVITY_ROW_HEIGHT,
    ACTIVITY_OVERSCAN,
  )

  const refreshClaims = useCallback(() => {
    setPendingClaims(getPendingClaims(address ?? undefined))
  }, [address])

  useEffect(() => {
    refreshClaims()
  }, [refreshClaims])

  const handleClaim = async () => {
    setClaiming(true)
    try {
      await submitClaim(address ?? '', sign)
      pendingClaims.forEach((c) => removePendingClaim(c.hash))
      refreshClaims()
      toast({
        tone: 'success',
        title: 'Withdrawals claimed',
        message: 'Queued withdrawals claimed successfully and paid out in USDC.',
      })
    } catch (e) {
      toast({
        tone: e instanceof TransactionPendingError ? 'solar' : 'error',
        title:
          e instanceof TransactionPendingError
            ? 'Still pending — we’ll keep checking'
            : 'Claim failed',
        message: e instanceof Error ? e.message : 'Could not process claim at this time.',
      })
    } finally {
      setClaiming(false)
    }
  }

  if (!connected) {
    return (
      <main
        id="main-content"
        style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 32px 80px' }}
      >
        <Card
          style={{
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            alignItems: 'flex-start',
          }}
        >
          <div className="hb-eyebrow">{t('eyebrow')}</div>
          <h2 style={{ ...cardTitle, margin: 0 }}>Connect your wallet to view your portfolio</h2>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-small)',
              lineHeight: 1.5,
              color: 'var(--ink-60)',
              margin: 0,
            }}
          >
            Your holdings and activity will appear here after you connect.
          </p>
          <Button variant="primary" onClick={() => void connect()}>
            Connect wallet
          </Button>
        </Card>
      </main>
    )
  }

  const integerVal = Math.floor(you.value)
  const decimalPart = (you.value % 1).toFixed(2).slice(2)

  return (
    <main id="main-content" style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 32px 80px' }}>
      {/* On-chain loading state banner */}
      {loading && !portfolio && (
        <Card data-testid="portfolio-loading" style={{ padding: 22, marginBottom: 28 }}>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-small)',
              color: 'var(--ink-60)',
              margin: 0,
            }}
          >
            Reading your portfolio position from Soroban…
          </p>
        </Card>
      )}

      {/* On-chain error state banner */}
      {error && (
        <Card data-testid="portfolio-error" style={{ padding: 22, marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p
              role="alert"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-small)',
                color: 'var(--ember)',
                margin: 0,
              }}
            >
              {error}
            </p>
            <Button variant="secondary" size="sm" onClick={refresh}>
              Retry
            </Button>
          </div>
        </Card>
      )}

      {/* On-chain empty holdings state banner (0 shares) */}
      {portfolio && portfolio.shares === 0 && portfolio.totalDeposited === 0 && (
        <Card data-testid="portfolio-empty" style={{ padding: 22, marginBottom: 28 }}>
          <h3 style={cardTitle}>No active vault position found</h3>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-small)',
              color: 'var(--ink-60)',
              margin: '4px 0 16px',
            }}
          >
            Your connected wallet has not deposited into this green-bond vault yet.
          </p>
          <Button variant="primary" onClick={onDeposit}>
            Make your first deposit
          </Button>
        </Card>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 24,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <div>
          <div className="hb-eyebrow" style={{ marginBottom: 14 }}>
            {t('eyebrow')}
          </div>
          <div data-testid="portfolio-value">
            <StatBlock
              label={t('currentValue')}
              value={`$${integerVal.toLocaleString('en-US')}`}
              decimals={`.${decimalPart}`}
              delta={`+$${you.deltaAbs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${you.deltaPct}%) ${t('sinceDeposit')}`}
              size="lg"
              stackOnMobile
            />
          </div>
          {pendingClaimsTotal > 0 && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-caption)',
                color: 'var(--ink-60)',
                marginTop: 4,
              }}
            >
              Includes ${pendingClaimsTotal.toLocaleString('en-US')} pending/escrow investments
              awaiting verification — total reflects settled + pending.
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <MemoizedHelio size={108} motes={you.backed} />
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" onClick={onWithdraw}>
              {t('withdraw')}
            </Button>
            <Button variant="primary" onClick={onDeposit}>
              {t('investMore')}
            </Button>
          </div>
        </div>
      </div>

      {/* three always-visible figures */}
      <div className="hb-figures-grid" style={{ margin: '28px 0' }}>
        <Card style={{ padding: 22 }}>
          <div data-testid="portfolio-shares">
            <StatBlock
              label={t('hbsHeld')}
              value={Math.floor(you.hbs).toLocaleString('en-US')}
              decimals={`.${(you.hbs % 1).toFixed(4).slice(2)}`}
              size="md"
            />
          </div>
        </Card>
        <Card style={{ padding: 22 }}>
          <div data-testid="portfolio-poolshare">
            <StatBlock
              label={t('poolShare')}
              value={formatDecimal(you.poolSharePct, 2)}
              unit="%"
              size="md"
            />
          </div>
        </Card>
        {totalAssets > 0 && (
          <Card style={{ padding: 22 }}>
            <MemoizedLiquidityMeter
              liquid={Math.round(totalAssets * 0.45)}
              total={Math.round(totalAssets)}
              currency="$"
              showExplanation={false}
            />
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-eyebrow)',
                color: 'var(--ink-60)',
                margin: '8px 0 0',
              }}
            >
              {t('liquidCaption')}
            </p>
          </Card>
        )}
      </div>

      <OnChainPosition />
      {address && <PortfolioPerformanceChart address={address} />}

      {/* Pending queued withdrawals */}
      <Card style={{ padding: 22, marginBottom: 28 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: pendingClaims.length > 0 ? 16 : 0,
          }}
        >
          <div>
            <h3 style={cardTitle}>Pending withdrawals</h3>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-small)',
                color: 'var(--ink-60)',
                margin: '4px 0 0',
              }}
            >
              {pendingClaims.length > 0
                ? `${pendingClaims.length} queued FIFO claim${pendingClaims.length > 1 ? 's' : ''} awaiting vault liquidity.`
                : 'No queued withdrawals. Immediate liquidity is available for standard payouts.'}
            </p>
          </div>
          {pendingClaims.length > 0 && (
            <Button variant="primary" size="sm" disabled={claiming} onClick={handleClaim}>
              {claiming ? 'Claiming...' : 'Claim available liquidity'}
            </Button>
          )}
        </div>
        {pendingClaims.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingClaims.map((claim) => (
              <div
                key={claim.id || claim.hash}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  background: 'var(--ink-04)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--ink-12)',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-data)',
                      fontSize: 'var(--type-small)',
                      fontWeight: 600,
                      color: 'var(--solar)',
                      background: 'rgba(234, 179, 8, 0.15)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-pill)',
                    }}
                  >
                    Queued
                  </span>
                  {claim.amount !== undefined && (
                    <span
                      style={{
                        fontFamily: 'var(--font-data)',
                        fontSize: 'var(--type-body)',
                        fontWeight: 600,
                        color: 'var(--ink)',
                      }}
                    >
                      ${formatDecimal(claim.amount, 2)} USDC
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--type-caption)',
                      color: 'var(--ink-60)',
                    }}
                  >
                    {formatDate(claim.timestamp, locale)}
                  </span>
                  <AddressChip value={claim.hash} label="transaction hash" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Portfolio risk indicator from bond ratings mix */}
      {hasRisk && (
        <Card style={{ padding: 22, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
            <StatBlock
              label="Portfolio risk"
              value={you.riskLevel![0].toUpperCase() + you.riskLevel!.slice(1)}
              size="md"
            />
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-small)',
                lineHeight: 1.55,
                color: 'var(--ink-60)',
                margin: 0,
              }}
            >
              Score: {you.riskScore}/100 based on bond ratings mix.
            </p>
          </div>
        </Card>
      )}

      {hasValidReferral && (
        <Card style={{ padding: 22, marginBottom: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <h3 style={cardTitle}>{t('referralProgram')}</h3>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-small)',
                  lineHeight: 1.55,
                  color: 'var(--ink-60)',
                  margin: '4px 0 0',
                }}
              >
                {t('referralCaption')}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                readOnly
                value={referralLink}
                style={{
                  flex: '1 1 280px',
                  padding: '10px 14px',
                  fontFamily: 'var(--font-data)',
                  fontSize: 'var(--type-small)',
                  background: 'var(--ink-04)',
                  border: '1px solid var(--ink-12)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink)',
                  outline: 'none',
                }}
              />
              <Button
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(referralLink ?? '')
                }}
              >
                {t('copyLink')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="hb-portfolio-grid">
        {/* Impact */}
        <Card style={{ padding: 22 }}>
          <h3 style={cardTitle}>{t('impactTitle')}</h3>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-small)',
              lineHeight: 1.55,
              color: 'var(--ink-60)',
              margin: '0 0 16px',
            }}
          >
            {t.rich('impactBody', {
              b: (c: ReactNode) => <b style={{ color: 'var(--ink)' }}>{c}</b>,
              count: you.backed,
            })}
          </p>
          <div style={{ display: 'flex', gap: 24 }}>
            <StatBlock label={t('projectsBacked')} value={String(you.backed)} size="sm" />
            <StatBlock label={t('weightedGreen')} value="88" size="sm" />
          </div>
        </Card>

        {/* Activity */}
        <Card style={{ minWidth: 0, padding: 22 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <h3 style={cardTitle}>{t('activityTitle')}</h3>
              <Link
                href="/portfolio/tax-reports"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-small)',
                  fontWeight: 600,
                  color: 'var(--ink-60)',
                  textDecoration: 'none',
                }}
              >
                {t('taxReports')} →
              </Link>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-caption)',
                color: 'var(--ink-40)',
              }}
            >
              {t('activityNote')}
            </span>
          </div>
          <div
            role="region"
            aria-label={`Portfolio activity, ${activity.length} items`}
            tabIndex={0}
            onScroll={(event) => setActivityScrollTop(event.currentTarget.scrollTop)}
            style={{
              maxHeight: ACTIVITY_VIEWPORT_HEIGHT,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
            }}
          >
            <div role="list" aria-live="polite">
              <div aria-hidden="true" style={{ height: activityRange.topPadding }} />
              {activity.slice(activityRange.start, activityRange.end).map((a, offset) => {
                const index = activityRange.start + offset
                return (
                  <div
                    key={a.hash}
                    role="listitem"
                    aria-posinset={index + 1}
                    aria-setsize={activity.length}
                    style={{
                      boxSizing: 'border-box',
                      height: ACTIVITY_ROW_HEIGHT,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      overflow: 'hidden',
                      borderTop: index ? '1px solid var(--ink-12)' : 'none',
                    }}
                  >
                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 'var(--type-small)',
                          fontWeight: 600,
                          color: 'var(--ink)',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {a.kind}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 'var(--type-caption)',
                          color: 'var(--ink-60)',
                        }}
                      >
                        {a.amount}
                        {a.shares ? ` · ${a.shares}` : ''}
                      </div>
                    </div>
                    <div style={{ flex: '0 0 auto', textAlign: 'end' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 'var(--type-caption)',
                          color: 'var(--ink-60)',
                        }}
                      >
                        {a.when}
                      </div>
                      <div
                        style={{
                          maxWidth: 140,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontFamily: 'var(--font-data)',
                          fontSize: 'var(--type-eyebrow)',
                          color: 'var(--ink-40)',
                        }}
                      >
                        {a.hash} ↗
                      </div>
                    </div>
                  </div>
                )
              })}
              <div aria-hidden="true" style={{ height: activityRange.bottomPadding }} />
            </div>
          </div>
        </Card>
      </div>
    </main>
  )
})

const cardTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 'var(--type-body-lg)',
  margin: '0 0 10px',
  color: 'var(--ink)',
}
