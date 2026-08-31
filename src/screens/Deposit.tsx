'use client'

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button, AmountInput, useToast } from '../components'
import { Helio } from '../brand/Helio'
import { submitDeposit } from '../wallet/vault'
import { useVault } from '../wallet/useVault'
import { scrollToFirstError } from '../lib/scrollToError'
import { getFriendlyErrorMessage } from '../lib/errorMessages'
import { useWallet } from '../wallet/WalletProvider'
import { HB_DATA } from '../data'
import { roundToCents, formatDecimal, parseAmount } from '../lib/format'
import { projectedReturn } from '../lib/bondUtils'
import { useDepositGuard } from '../hooks/useDepositGuard'

/**
 * Deposit — the flow that must be perfect. One column, one decision per step:
 * amount (live preview from the vault) -> review in plain words -> pending (hash
 * from second zero) -> success (impact, not hype). Errors name cause + fix.
 */
export interface DepositProps {
  onDone: () => void
}

type DepositStep = 'amount' | 'review' | 'pending' | 'success'

const num = (chunks: ReactNode) => (
  <b className="hb-data" style={{ color: 'var(--ink)' }}>
    {chunks}
  </b>
)
const strong = (chunks: ReactNode) => <b style={{ color: 'var(--ink)' }}>{chunks}</b>

export function Deposit({ onDone }: DepositProps) {
  const t = useTranslations('Deposit')
  const { toast } = useToast()
  const { address, sign } = useWallet()
  const {
    sharePrice: livePrice,
    loading: vaultLoading,
    error: vaultError,
    fetchedAt,
    refresh: refreshVault,
  } = useVault()
  const [step, setStep] = useState<DepositStep>('amount')
  const [amount, setAmount] = useState('100')
  const [investmentId, setInvestmentId] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const priceFetchedAt = fetchedAt ?? new Date()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const rateAgeSeconds = Math.floor((now - priceFetchedAt.getTime()) / 1000)
  const isRateStale = rateAgeSeconds > 30

  const mountedRef = useRef(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Idempotency guard: detect if a prior deposit is still in-flight (#433).
  const { markPending, clearPending, getPending } = useDepositGuard()
  const pendingDeposit = getPending()

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const changeStep = (newStep: DepositStep) => {
    // auto-scroll to first error when navigating to amount with error
    if (newStep === 'amount' && txError) {
      setTimeout(() => scrollToFirstError(document), 100)
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (mountedRef.current) {
      setStep(newStep)
    }
  }

  const handleDone = () => {
    setAmount('')
    setInvestmentId(null)
    setTxError(null)
    changeStep('amount')
    onDone()
  }

  // Consolidate amount parsing with parseAmount helper (#417).
  const n = parseAmount(amount)
  const price = livePrice
  const balance = 240

  const renderStep = (currentStep: DepositStep) => {
    switch (currentStep) {
      case 'amount':
        return (
          <Panel>
            <h1 style={h1Style}>{t('amountH1')}</h1>
            {txError && (
              <div
                role="alert"
                style={{
                  marginBottom: 14,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-input)',
                  background: 'rgba(179,54,27,0.07)',
                  border: '1px solid rgba(179,54,27,0.18)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-small)',
                  color: 'var(--ember)',
                }}
              >
                {getFriendlyErrorMessage(txError)}
              </div>
            )}
            <AmountInput
              value={amount}
              onChange={setAmount}
              label={t('amountLabel')}
              currency="USDC"
              balanceLabel={t('balanceLabel')}
              balance="240.00"
              chips={[25, 50, 100]}
              cap={balance}
              capMessage={t('capMessage', { cap: balance })}
              maxChipLabel={t('maxChip')}
              capActionLabel={t('depositMaxAvailable')}
              preview={
                vaultLoading ? (
                  <span
                    aria-busy="true"
                    style={{
                      display: 'inline-block',
                      height: 14,
                      width: 160,
                      borderRadius: 6,
                      background: 'var(--ink-06)',
                      animation: 'hb-pulse 1.4s ease-in-out infinite',
                    }}
                  />
                ) : (
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--type-small)',
                      lineHeight: 1.55,
                      color: 'var(--ink-60)',
                    }}
                  >
                    {vaultError && (
                      <span
                        style={{
                          display: 'block',
                          fontSize: 'var(--type-eyebrow)',
                          color: 'var(--ink-40)',
                          marginBottom: 2,
                        }}
                      >
                        Using estimated rate
                      </span>
                    )}
                    {t.rich('preview', { shares: formatDecimal(n / price, 4), price, num })}
                    <span
                      style={{
                        display: 'block',
                        marginTop: 4,
                        fontSize: 'var(--type-caption)',
                        color: 'var(--ink-60)',
                      }}
                    >
                      Fee: &lt; $0.01 · Net proceeds: ≈ {formatDecimal(roundToCents(n - 0.01), 2)}{' '}
                      USDC worth {formatDecimal(n / price, 4)} HBS (real-time)
                    </span>
                    {n >= 1 && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          marginTop: 8,
                          paddingTop: 8,
                          borderTop: '1px solid var(--ink-12)',
                        }}
                      >
                        <span style={{ fontSize: 'var(--type-eyebrow)', color: 'var(--ink-40)' }}>
                          Projected returns:
                        </span>
                        {[1, 5, 10].map((years) => (
                          <span
                            key={years}
                            style={{
                              fontSize: 'var(--type-caption)',
                              color: 'var(--ink-60)',
                            }}
                          >
                            {years === 1 ? '1 year:' : `${years} years:`} ≈ $
                            {formatDecimal(
                              roundToCents(projectedReturn(n, HB_DATA.pool.projectedRate, years)),
                              2,
                            )}{' '}
                            @ {HB_DATA.pool.projectedRate}% annual
                          </span>
                        ))}
                      </div>
                    )}
                  </span>
                )
              }
            />
            <p style={liqLine}>{t.rich('liquidLine', { b: strong })}</p>
            <Button
              variant="primary"
              size="lg"
              style={{ width: '100%', marginTop: 20 }}
              disabled={n < 1 || n > balance}
              reason={n > balance ? t('reasonExceeds') : n < 1 ? t('reasonMin') : undefined}
              onClick={() => {
                if (n < 1 || n > balance) {
                  setTxError(n > balance ? 'amount_exceeds_balance' : 'amount_too_low')
                  setTimeout(() => scrollToFirstError(document), 50)
                  return
                }
                changeStep('review')
              }}
            >
              {n >= 1 && n <= balance ? t('investCta', { amount: n }) : t('investCtaEmpty')}
            </Button>
          </Panel>
        )
      case 'review':
        return (
          <Panel>
            <h1 style={h1Style}>{t('reviewH1', { amount: n })}</h1>
            {/* Warn if a prior deposit submission may still be processing (#433) */}
            {pendingDeposit && (
              <div
                role="alert"
                style={{
                  marginBottom: 16,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-input)',
                  background: 'rgba(255, 176, 0, 0.08)',
                  border: '1px solid rgba(255, 176, 0, 0.30)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-small)',
                  color: 'var(--ink)',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ display: 'block', marginBottom: 4 }}>
                  ⚠ Previous deposit may still be processing
                </strong>
                Your last deposit of{' '}
                <span style={{ fontFamily: 'var(--font-data)', fontWeight: 600 }}>
                  {formatDecimal(pendingDeposit.amount, 2)} USDC
                </span>{' '}
                (started{' '}
                {Math.floor((Date.now() - pendingDeposit.startedAt) / 1000)}s ago) has not yet
                confirmed. Submitting again before it settles may result in a duplicate investment.
                Check your portfolio before proceeding.{' '}
                <button
                  type="button"
                  onClick={clearPending}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--type-small)',
                    color: 'var(--ink)',
                    fontWeight: 600,
                    textDecoration: 'underline',
                  }}
                >
                  Dismiss warning
                </button>
              </div>
            )}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                background: 'var(--ink-12)',
                borderRadius: 'var(--radius-input)',
                overflow: 'hidden',
                margin: '6px 0 20px',
              }}
            >
              <Row k={t('rowPay')} v={`${formatDecimal(n, 2)} USDC`} />
              <Row k={t('rowReceive')} v={`≈ ${formatDecimal(n / price, 4)} HBS`} />
              <Row k={t('rowPrice')} v={`${price}`} />
              <Row k="Price fetched" v={priceFetchedAt.toLocaleString()} />
              <Row k={t('rowFee')} v="< $0.01" />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                margin: '-12px 0 16px',
                flexWrap: 'wrap',
              }}
            >
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-caption)',
                  color: isRateStale ? 'var(--ember)' : 'var(--ink-40)',
                  margin: 0,
                  flex: 1,
                }}
              >
                {isRateStale
                  ? `Rate updated ${rateAgeSeconds}s ago — may be outdated. Refresh before confirming.`
                  : `Live rate — updated ${rateAgeSeconds}s ago at ${priceFetchedAt.toLocaleTimeString()}`}
              </p>
              <button
                type="button"
                onClick={() => refreshVault()}
                aria-label="Refresh exchange rate"
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-caption)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  background: 'var(--ink-06)',
                  border: '1px solid var(--ink-12)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                Refresh rate
              </button>
            </div>
            {isRateStale && (
              <div
                role="alert"
                style={{
                  marginBottom: 12,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-input)',
                  background: 'rgba(179,54,27,0.07)',
                  border: '1px solid rgba(179,54,27,0.18)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-caption)',
                  color: 'var(--ember)',
                }}
              >
                Exchange rate is more than 30 seconds old — please refresh to get the latest price
                before confirming.
              </div>
            )}
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-small)',
                lineHeight: 1.55,
                color: 'var(--ink-60)',
                margin: '0 0 20px',
              }}
            >
              {t('reviewBody', { count: HB_DATA.pool.projectsFunded })}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="ghost" onClick={() => changeStep('amount')}>
                {t('back')}
              </Button>
              <Button
                variant="primary"
                size="lg"
                style={{ flex: 1 }}
                onClick={async () => {
                  changeStep('pending')
                  setTxError(null)
                  // Mark this submission as in-flight so a retry after
                  // timeout/abort shows a "still processing" warning (#433).
                  markPending(n, address ?? '')
                  const controller = new AbortController()
                  abortControllerRef.current = controller
                  try {
                    const hash = await submitDeposit(n, address ?? '', sign, controller.signal)
                    if (mountedRef.current) {
                      setInvestmentId(hash)
                      // Confirmed success — safe to clear the pending guard.
                      clearPending()
                      changeStep('success')
                      toast({
                        tone: 'success',
                        title: 'Deposit confirmed',
                        message: `Successfully invested ${n} USDC in the pool.`,
                      })
                    }
                  } catch (e) {
                    if (mountedRef.current) {
                      if (e instanceof Error && e.message === 'Aborted') {
                        // User cancelled or tab navigated away — the tx may
                        // still be processing on-chain. Do NOT clear the guard
                        // so the warning appears if they try again.
                        return
                      }
                      // A confirmed on-chain failure — safe to clear.
                      clearPending()
                      setTxError(
                        e instanceof Error
                          ? getFriendlyErrorMessage(e.message)
                          : 'Transaction failed — please try again.',
                      )
                      changeStep('amount')
                    }
                  } finally {
                    if (abortControllerRef.current === controller) {
                      abortControllerRef.current = null
                    }
                  }
                }}
              >
                {t('confirm')}
              </Button>
            </div>
          </Panel>
        )
      case 'pending':
        return (
          <Panel>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                padding: '12px 0',
              }}
            >
              {/* aria-live region announces pending state to screen readers (#80) */}
              <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  overflow: 'hidden',
                  clip: 'rect(0,0,0,0)',
                  whiteSpace: 'nowrap',
                }}
              >
                {t('pendingH1')}. {t('pendingSub')}
              </div>
              <PendingDot />
              <h1 style={{ ...h1Style, textAlign: 'center', marginTop: 18 }} aria-hidden="true">
                {t('pendingH1')}
              </h1>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-data)',
                  color: 'var(--ink-60)',
                  margin: '0 0 14px',
                }}
                aria-hidden="true"
              >
                {t('pendingSub')}
              </p>
              <span
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 'var(--type-caption)',
                  color: 'var(--ink-40)',
                }}
              >
                {t('pendingTx')}
              </span>
            </div>
          </Panel>
        )
      case 'success':
        return (
          <Panel>
            {/* Announce success to screen readers (#80) */}
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                overflow: 'hidden',
                clip: 'rect(0,0,0,0)',
                whiteSpace: 'nowrap',
              }}
            >
              {t('successH1')}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 6px' }}>
              <Helio size={160} motes={HB_DATA.pool.projectsFunded} />
            </div>
            <h1 style={{ ...h1Style, textAlign: 'center' }}>{t('successH1')}</h1>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-data)',
                lineHeight: 1.55,
                color: 'var(--ink-60)',
                textAlign: 'center',
                margin: '0 0 22px',
              }}
            >
              {t.rich('successBody', {
                shares: formatDecimal(n / price, 4),
                num,
                b: strong,
                count: HB_DATA.pool.projectsFunded,
              })}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <a
                href={investmentId ? `/investments/${investmentId}` : undefined}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 44,
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid var(--ink-12)',
                  background: 'transparent',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-data)',
                  fontWeight: 500,
                  color: 'var(--ink)',
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                View investment
              </a>
              <Button variant="primary" style={{ flex: 1 }} onClick={handleDone}>
                {t('goPortfolio')}
              </Button>
            </div>
          </Panel>
        )
      default: {
        const _exhaustiveCheck: never = currentStep
        return _exhaustiveCheck
      }
    }
  }

  return (
    <main id="main-content" style={{ maxWidth: 520, margin: '0 auto', padding: '48px 24px 80px' }}>
      <Stepper step={step} />
      {renderStep(step)}
    </main>
  )
}

function Stepper({ step }: { step: DepositStep }) {
  const t = useTranslations('Deposit')
  const order: DepositStep[] = ['amount', 'review', 'pending', 'success']
  const labels: Record<DepositStep, string> = {
    amount: t('stepAmount'),
    review: t('stepReview'),
    pending: t('stepSign'),
    success: t('stepDone'),
  }
  const idx = order.indexOf(step)
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 24, justifyContent: 'center' }}>
      {order.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: i <= idx ? 'var(--solar)' : 'var(--ink-12)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--type-caption)',
              fontWeight: 600,
              color: i <= idx ? 'var(--ink)' : 'var(--ink-40)',
            }}
          >
            {labels[s]}
          </span>
          {i < order.length - 1 && (
            <span style={{ width: 20, height: 1, background: 'var(--ink-12)' }} />
          )}
        </div>
      ))}
    </div>
  )
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-modal)',
        padding: 28,
        boxShadow: 'var(--shadow-sm)',
        maxHeight: 'calc(100dvh - 32px)',
        overflowY: 'auto',
      }}
    >
      {children}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        background: 'var(--surface)',
        padding: '13px 16px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--type-small)',
          color: 'var(--ink-60)',
        }}
      >
        {k}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-data)',
          fontSize: 'var(--type-small)',
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        {v}
      </span>
    </div>
  )
}

function PendingDot() {
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: 56, height: 56 }}>
      <svg
        width="56"
        height="56"
        viewBox="0 0 56 56"
        className="hb-orbit"
        style={{ animation: 'hb-orbit 1.2s linear infinite', transformOrigin: '28px 28px' }}
      >
        <circle cx="28" cy="28" r="22" fill="none" stroke="var(--ink-12)" strokeWidth="3" />
        <circle cx="28" cy="6" r="5" fill="var(--solar)" />
      </svg>
    </div>
  )
}

const h1Style: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 'var(--type-h3)',
  lineHeight: 1.2,
  letterSpacing: '-0.01em',
  margin: '0 0 18px',
  color: 'var(--ink)',
}
const liqLine: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-caption)',
  color: 'var(--ink-60)',
  margin: '14px 0 0',
}