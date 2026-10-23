'use client'

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button, AmountInput, MemoInput, useToast } from '../components'
import { Helio } from '../brand/Helio'
import { submitDeposit } from '../wallet/vault'
import { useVault } from '../wallet/useVault'
import { useVaultLimits } from '../wallet/useVaultLimits'
import { useUsdcBalance } from '../wallet/useUsdcBalance'
import { TransactionPendingError } from '../wallet/transactions'
import { useTransactionFee } from '../wallet/useTransactionFee'
import { scrollToFirstError } from '../lib/scrollToError'
import { parseErrorCode } from '../lib/errorMessages'
import { validateMemoLength } from '../lib/stellarPayment'
import { translateContractError } from '../lib/contractErrors'
import { reportTransactionFailure } from '../lib/errorReporting'
import { isNetworkMismatchError } from '../wallet/networkGuard'
import { useWallet } from '../wallet/WalletProvider'
import { selectPoolSummary } from '../state/selectors'
import {
  roundToCents,
  formatDecimal,
  formatSharePrice,
  parseAmount,
  formatDateTime,
  formatTime,
} from '../lib/format'
import { projectedReturn } from '../lib/bondUtils'
import { useDepositGuard } from '../hooks/useDepositGuard'
import { useVisibleNow } from '../hooks/useVisibleNow'
import { RecurringInvestmentOptions } from '../components/RecurringInvestmentOptions'

const DEFAULT_DEPOSIT_USDC = '100'
const RATE_STALE_AFTER_SECONDS = 30
const DEFAULT_SLIPPAGE_TOLERANCE = 0.005 // 0.5%

type DepositStep = 'amount' | 'review' | 'pending' | 'success'

export interface DepositProps {
  onDone: () => void
}

const num = (chunks: ReactNode) => (
  <b className="hb-data" style={{ color: 'var(--ink)' }}>
    {chunks}
  </b>
)
const strong = (chunks: ReactNode) => <b style={{ color: 'var(--ink)' }}>{chunks}</b>

export function Deposit({ onDone }: DepositProps) {
  const t = useTranslations('Deposit')
  const tErr = useTranslations('ContractErrors')
  const tErrors = useTranslations('Errors')
  const locale = useLocale()
  const { toast } = useToast()
  const { address, sign } = useWallet()
  // Flat selector — pool figures in one level, no nested-state drilling.
  const { projectedRate, projectsFunded } = selectPoolSummary()
  const {
    sharePrice: livePrice,
    loading: vaultLoading,
    error: vaultError,
    fetchedAt,
    refresh: refreshVault,
  } = useVault()
  const { minDeposit, paused, maxTx } = useVaultLimits()
  const { balance } = useUsdcBalance()
  const quickDepositAmounts = Array.from(
    new Set(
      [
        minDeposit,
        balance !== null ? Math.min(250, balance) : 250,
        balance !== null ? Math.min(500, balance) : 500,
      ].filter((preset) => preset >= minDeposit),
    ),
  )
  const [step, setStep] = useState<DepositStep>('amount')
  const [amount, setAmount] = useState(DEFAULT_DEPOSIT_USDC)
  const [memo, setMemo] = useState('')
  const [investmentId, setInvestmentId] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const [recurring, setRecurring] = useState(false)
  const [recurrenceDay, setRecurrenceDay] = useState(1)
  const [slippageTolerance, setSlippageTolerance] = useState(DEFAULT_SLIPPAGE_TOLERANCE)
  const priceFetchedAt = fetchedAt ?? new Date()

  const n = parseAmount(amount)
  const isMemoValid = validateMemoLength(memo).valid
  const amountHasValidationError =
    txError !== null && txError !== 'memo_too_long' && txError !== 'vault_paused'

  const estimatedFee = useTransactionFee('deposit', n, address, slippageTolerance)
  const feeLabel =
    estimatedFee === null
      ? t('feeEstimateUnavailable')
      : t('feeLabelEstimated', { fee: formatDecimal(estimatedFee, 7) })

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
    setMemo('')
    setInvestmentId(null)
    setTxError(null)
    changeStep('amount')
    onDone()
  }

  async function handleSubmitDeposit() {
    changeStep('pending')
    setTxError(null)
    markPending(n, address ?? '')
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      await submitDeposit(n, address ?? '', sign, controller.signal, slippageTolerance, memo)

      if (mountedRef.current) {
        clearPending()
        changeStep('success')
        toast({
          tone: 'success',
          title: t('confirmedToastTitle'),
          message: t('confirmedToastBody', { amount: n }),
        })
      }
    } catch (e) {
      if (mountedRef.current) {
        if (e instanceof Error && e.message === 'Aborted') {
          return
        }
        const isTimeout = e instanceof TransactionPendingError
        if (isTimeout) {
          toast({
            tone: 'solar',
            title: t('pendingToastTitle'),
            message: t('pendingToastBody'),
          })
          changeStep('amount')
          return
        }

        clearPending()
        reportTransactionFailure(e, 'deposit')
        // A wallet/app network mismatch message is already user-facing (#611).
        const errorMessage = isNetworkMismatchError(e)
          ? e.message
          : (translateContractError(e, tErr) ?? tErrors(parseErrorCode(e) as never))
        changeStep('amount')
        toast({
          tone: 'error',
          title: t('failedToastTitle'),
          message: errorMessage,
          action: (
            <button
              type="button"
              onClick={handleSubmitDeposit}
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
              Retry
            </button>
          ),
        })
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }

  const isAmountDisabled =
    n < minDeposit ||
    (balance !== null && (n > balance || balance < minDeposit)) ||
    n > maxTx ||
    paused ||
    !isMemoValid

  const amountDisabledReason = paused
    ? t('vaultPaused')
    : balance !== null && (n > balance || balance < minDeposit)
      ? t('reasonExceeds')
      : n > maxTx
        ? t('amountExceedsPool')
        : n < minDeposit
          ? t('reasonMin', { min: formatDecimal(minDeposit, 2) })
          : !isMemoValid
            ? t('reasonMemoTooLong')
            : undefined

  const handleAmountSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (isAmountDisabled) {
      setTxError(
        paused
          ? 'vault_paused'
          : balance !== null && (n > balance || balance < minDeposit)
            ? 'amount_exceeds_balance'
            : n > maxTx
              ? 'amount_exceeds_max_tx'
              : !isMemoValid && n >= minDeposit
                ? 'memo_too_long'
                : 'amount_too_low',
      )
      setTimeout(() => scrollToFirstError(document), 50)
      return
    }
    changeStep('review')
  }

  const price = livePrice
  const renderStep = (currentStep: DepositStep) => {
    switch (currentStep) {
      case 'amount':
        return (
          <Panel>
            <form onSubmit={handleAmountSubmit} noValidate>
              <h1 style={h1Style}>{t('amountH1')}</h1>
              {txError && (
                <div
                  id="deposit-form-error"
                  role="alert"
                  tabIndex={-1}
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
                  {amountDisabledReason || txError}
                </div>
              )}
              <AmountInput
                value={amount}
                onChange={(value) => {
                  setAmount(value)
                  setTxError(null)
                }}
                invalid={amountHasValidationError}
                errorId={amountHasValidationError ? 'deposit-form-error' : undefined}
                label={t('amountLabel')}
                currency={balance !== null ? 'USDC' : ''}
                balanceLabel={balance !== null ? t('balanceLabel') : ''}
                balance={balance !== null ? formatDecimal(balance, 2) : 'Balance unavailable'}
                chips={quickDepositAmounts}
                min={minDeposit}
                max={balance !== null ? Math.min(balance, maxTx) : maxTx}
                cap={balance !== null ? balance : undefined}
                capMessage={balance !== null ? t('capMessage', { cap: balance }) : undefined}
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
                          {t('usingEstimatedRate')}
                        </span>
                      )}
                      {t.rich('preview', {
                        shares: formatDecimal(n / price, 4),
                        price: formatSharePrice(price),
                        num,
                      })}
                      <span
                        style={{
                          display: 'block',
                          marginTop: 4,
                          fontSize: 'var(--type-caption)',
                          color: 'var(--ink-60)',
                        }}
                      >
                        {t('feeBreakdown', {
                          fee: feeLabel,
                          amount: formatDecimal(n, 2),
                          shares: formatDecimal(n / price, 4),
                        })}
                      </span>
                      {n >= minDeposit && (
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
                              {t('projectionYears', { count: years })} ≈ $
                              {formatDecimal(
                                roundToCents(projectedReturn(n, projectedRate, years)),
                                2,
                              )}{' '}
                              @ {projectedRate}% annual
                            </span>
                          ))}
                        </div>
                      )}
                    </span>
                  )
                }
              />
              <p style={liqLine}>{t.rich('liquidLine', { b: strong })}</p>
              <MemoInput
                value={memo}
                onChange={(value) => {
                  setMemo(value)
                  setTxError(null)
                }}
                label={t('memoLabel')}
                placeholder={t('memoPlaceholder')}
              />
              <RecurringInvestmentOptions
                enabled={recurring}
                amount={n}
                dayOfMonth={recurrenceDay}
                onEnabledChange={setRecurring}
                onDayChange={setRecurrenceDay}
              />
              {isAmountDisabled && amountDisabledReason && (
                <p
                  id="deposit-submit-reason"
                  style={{
                    margin: '16px 0 -12px',
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--type-caption)',
                    color: 'var(--ink-60)',
                  }}
                >
                  {amountDisabledReason}
                </p>
              )}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                style={{
                  width: '100%',
                  marginTop: 20,
                  opacity: isAmountDisabled ? 0.45 : 1,
                  cursor: isAmountDisabled ? 'not-allowed' : 'pointer',
                }}
                aria-disabled={isAmountDisabled}
                aria-describedby={isAmountDisabled ? 'deposit-submit-reason' : undefined}
                onClick={handleAmountSubmit}
              >
                {n >= minDeposit &&
                (balance === null || (n <= balance && balance >= minDeposit)) &&
                n <= maxTx &&
                !paused
                  ? t('investCta', { amount: n })
                  : t('investCtaEmpty')}
              </Button>
            </form>
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
                  ⚠ {t('pendingDepositTitle')}
                </strong>
                {t.rich('pendingDepositBody', {
                  amount: formatDecimal(pendingDeposit.amount, 2),
                  age: <PendingDepositAge startedAt={pendingDeposit.startedAt} />,
                  amt: (chunks) => (
                    <span style={{ fontFamily: 'var(--font-data)', fontWeight: 600 }}>{chunks}</span>
                  ),
                })}{' '}
                {t('checkPortfolioFirst')}{' '}
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
                  {t('dismissWarning')}
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
              <Row k={t('rowPrice')} v={formatSharePrice(price)} />
              <Row k={t('priceFetched')} v={formatDateTime(priceFetchedAt, locale)} />
              <Row k={t('networkFee')} v={feeLabel} />
              {memo.trim() && <Row k={t('rowMemo')} v={memo.trim()} />}
            </div>
            <RateAge fetchedAt={priceFetchedAt} locale={locale} onRefresh={refreshVault} />
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-small)',
                  color: 'var(--ink-60)',
                  cursor: 'pointer',
                }}
              >
                <span>{t('slippageTolerance')}</span>
                <select
                  value={slippageTolerance}
                  onChange={(e) => setSlippageTolerance(Number(e.target.value))}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--type-small)',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--ink-12)',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                  }}
                >
                  <option value={0.001}>{t('slippageOption', { value: '0.001' })}</option>
                  <option value={0.005}>{t('slippageOption', { value: '0.005' })}</option>
                  <option value={0.01}>{t('slippageOption', { value: '0.01' })}</option>
                  <option value={0.02}>{t('slippageOption', { value: '0.02' })}</option>
                </select>
                <span style={{ color: 'var(--ink-40)', fontSize: 'var(--type-caption)' }}>
                  {t('minShares', {
                    amount: formatDecimal((n / price) * (1 - slippageTolerance), 4),
                  })}
                </span>
              </label>
            </div>
            <RecurringInvestmentOptions
              enabled={recurring}
              amount={n}
              dayOfMonth={recurrenceDay}
              onEnabledChange={setRecurring}
              onDayChange={setRecurrenceDay}
            />
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-small)',
                lineHeight: 1.55,
                color: 'var(--ink-60)',
                margin: '0 0 20px',
              }}
            >
              {t('reviewBody', { count: projectsFunded })}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="ghost" onClick={() => changeStep('amount')}>
                {t('back')}
              </Button>
              <Button variant="primary" size="lg" style={{ flex: 1 }} onClick={handleSubmitDeposit}>
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
              <Helio size={160} motes={projectsFunded} />
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
                count: projectsFunded,
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

function PendingDepositAge({ startedAt }: { startedAt: number }) {
  const now = useVisibleNow()
  return <>{Math.floor((now - startedAt) / 1000)}s</>
}

function RateAge({
  fetchedAt,
  locale,
  onRefresh,
}: {
  fetchedAt: Date
  locale: string
  onRefresh: () => void
}) {
  const t = useTranslations('Deposit')
  const now = useVisibleNow()
  const rateAgeSeconds = Math.floor((now - fetchedAt.getTime()) / 1000)
  const isRateStale = rateAgeSeconds > RATE_STALE_AFTER_SECONDS

  return (
    <>
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
            ? t('rateStale', { seconds: rateAgeSeconds })
            : t('rateLive', {
                seconds: rateAgeSeconds,
                time: formatTime(fetchedAt, locale),
              })}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          aria-label={t('refreshRateAria')}
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
          {t('refreshRateCta')}
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
          {t('rateStaleAlert', { seconds: RATE_STALE_AFTER_SECONDS })}
        </div>
      )}
    </>
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
