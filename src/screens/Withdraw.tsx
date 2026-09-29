'use client'

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button, AmountInput, LiquidityMeter, AddressChip, useToast } from '../components'
import { fetchUtilizationBps, submitWithdraw } from '../wallet/vault'
import { reportTransactionFailure } from '../lib/errorReporting'
import { parseContractError, translateContractError } from '../lib/contractErrors'
import { useWallet } from '../wallet/WalletProvider'
import { formatDecimal, parseAmount } from '../lib/format'
import { addPendingClaim } from '../wallet/pendingClaims'
import { getExplorerTxUrl } from "../config/network"

const LIQUID_SHARE = 236
const TOTAL_LIQUID = 482
const TOTAL_LIQUID_BALANCE = '482.00'
const QUICK_WITHDRAW_AMOUNT_SMALL = 2000
const QUICK_WITHDRAW_AMOUNT_MEDIUM = 5000
const QUICK_WITHDRAW_AMOUNT_LARGE = 10000
const QUICK_WITHDRAW_AMOUNTS = [QUICK_WITHDRAW_AMOUNT_SMALL, QUICK_WITHDRAW_AMOUNT_MEDIUM, QUICK_WITHDRAW_AMOUNT_LARGE]
const MIN_WITHDRAWAL_AMOUNT = 1
const DISPLAY_DECIMALS = 2
const DEFAULT_SLIPPAGE_TOLERANCE = 0.005 // 0.5%

/**
 * Withdraw — designed with the most care of all. Capped at the live liquid
 * maximum; typing past it explains instead of erroring, with one-tap max.
 * No retention friction: exit is two taps and a signature.
 */
export interface WithdrawProps {
  onDone: () => void
  onBack: () => void
}

type WithdrawStep = 'amount' | 'pending' | 'success'

export function Withdraw({ onDone, onBack }: WithdrawProps) {
  const t = useTranslations('Withdraw')
  const tErr = useTranslations('ContractErrors')
  const { toast } = useToast()
  const { address, sign } = useWallet()
  const liquid = LIQUID_SHARE // your liquid share, $
  const [step, setStep] = useState<WithdrawStep>('amount')
  const [amount, setAmount] = useState('')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)
  const [isQueued, setIsQueued] = useState(false)
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [estimatedAmount, setEstimatedAmount] = useState<number | null>(null)
  const [slippageTolerance, setSlippageTolerance] = useState(DEFAULT_SLIPPAGE_TOLERANCE)

  const mountedRef = useRef(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const changeStep = (newStep: WithdrawStep) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (mountedRef.current) {
      setStep(newStep)
    }
  }
  // Consolidate amount parsing with parseAmount helper (#417).
  const n = parseAmount(amount)

  const renderStep = (currentStep: WithdrawStep) => {
    const txExplorerUrl = txHash
      ? getExplorerTxUrl(txHash)
      : undefined

    switch (currentStep) {
      case 'amount':
        return (
          <div style={panel}>
            <h1 style={hw}>{t('h1')}</h1>
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
                {txError}
              </div>
            )}
            <div style={{ marginBottom: 18 }}>
              <LiquidityMeter liquid={liquid} total={TOTAL_LIQUID} currency="$" />
            </div>
            <AmountInput
              value={amount}
              onChange={setAmount}
              label={t('amountLabel')}
              currency="USDC"
              balanceLabel={t('yourValue')}
              balance={TOTAL_LIQUID_BALANCE}
              chips={QUICK_WITHDRAW_AMOUNTS}
              cap={liquid}
              capMessage={t('capMessage', { cap: liquid })}
              maxChipLabel={t('maxChip')}
              capActionLabel={t('withdrawMaxAvailable')}
            />
            {n > liquid && n <= TOTAL_LIQUID && (
              <div
                role="status"
                style={{
                  marginTop: 14,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-input)',
                  background: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-small)',
                  color: 'var(--ink)',
                }}
              >
                <strong>Warning:</strong> Requested amount exceeds immediately available liquid balance (${liquid}.00). Your withdrawal will be placed in the FIFO queue (WithdrawQueued) and will be claimable once vault liquidity is replenished.
              </div>
            )}
            {n > TOTAL_LIQUID && (
              <div
                role="alert"
                style={{
                  marginTop: 14,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-input)',
                  background: 'rgba(179,54,27,0.07)',
                  border: '1px solid rgba(179,54,27,0.18)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-small)',
                  color: 'var(--ember)',
                }}
              >
                Amount exceeds maximum graduated tier limit (${TOTAL_LIQUID}.00).
              </div>
            )}
            {n > 0 && (
              <div style={{ marginTop: 14, marginBottom: 14 }}>
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
                  <span>Slippage tolerance</span>
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
                    <option value={0.001}>0.1%</option>
                    <option value={0.005}>0.5% (default)</option>
                    <option value={0.01}>1%</option>
                    <option value={0.02}>2%</option>
                  </select>
                  <span style={{ color: 'var(--ink-40)', fontSize: 'var(--type-caption)' }}>
                    Min return: {formatDecimal(n * (1 - slippageTolerance), DISPLAY_DECIMALS)} USDC
                  </span>
                </label>
              </div>
            )}
            <Button
              variant="primary"
              size="lg"
              style={{ width: '100%', marginTop: 20, background: 'var(--primary)' }}
              disabled={n < MIN_WITHDRAWAL_AMOUNT || n > TOTAL_LIQUID}
              reason={n > TOTAL_LIQUID ? 'Amount exceeds pool limit' : n < MIN_WITHDRAWAL_AMOUNT ? t('reasonMin') : undefined}
              onClick={async () => {
                changeStep('pending')
                setTxError(null)
                const controller = new AbortController()
                abortControllerRef.current = controller
                try {
                  const result = await submitWithdraw(n, address ?? '', sign, controller.signal, slippageTolerance)
                  if (mountedRef.current) {
                    const hash = typeof result === 'string' ? result : result.hash
                    const queued = typeof result === 'object' ? Boolean(result.queued) : false
                    const position = typeof result === 'object' && result.position ? result.position : 1
                    const est = typeof result === 'object' && result.estimatedAmount ? result.estimatedAmount : n
                    setTxHash(hash)
                    setIsQueued(queued)
                    setQueuePosition(position)
                    setEstimatedAmount(est)
                    changeStep('success')

                    if (queued) {
                      addPendingClaim({
                        id: hash,
                        hash,
                        amount: est,
                        position,
                        timestamp: Date.now(),
                        address: address ?? undefined,
                      })
                      toast({
                        tone: 'solar',
                        title: 'Withdrawal queued',
                        message: `Position #${position}. Est. ${formatDecimal(est, DISPLAY_DECIMALS)} USDC queued for payout.`,
                      })
                    } else {
                      toast({
                        tone: 'success',
                        title: 'Withdrawal settled',
                        message: `${formatDecimal(n, DISPLAY_DECIMALS)} USDC is on its way to your wallet.`,
                      })
                    }
                  }
                } catch (e) {
                  if (mountedRef.current) {
                    if (e instanceof Error && e.message === 'Aborted') {
                      return
                    }
                    // Contract failures get a translated, actionable message (#610);
                    // liquidity errors also show current pool utilization when readable.
                    reportTransactionFailure(e, 'withdraw')
                    const contractError = parseContractError(e)
                    let utilization: number | undefined
                    if (
                      contractError?.name === 'WithdrawalExceedsLimit' ||
                      contractError?.name === 'InsufficientLiquid'
                    ) {
                      const bps = await fetchUtilizationBps(address ?? '').catch(() => 0)
                      if (bps > 0) utilization = bps / 100
                    }
                    if (!mountedRef.current) return
                    setTxError(
                      translateContractError(e, tErr, { utilization }) ??
                        (e instanceof Error ? e.message : 'Transaction failed — please try again.'),
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
              {n >= MIN_WITHDRAWAL_AMOUNT && n <= liquid
                ? t('withdrawCta', { amount: n })
                : n > liquid && n <= TOTAL_LIQUID
                  ? `Enqueue withdrawal for $${formatDecimal(n, DISPLAY_DECIMALS)}`
                  : t('withdrawCtaEmpty')}
            </Button>
            <button
              onClick={onBack}
              className="hb-textlink"
              style={{
                display: 'block',
                width: '100%',
                marginTop: 12,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-small)',
                color: 'var(--ink-60)',
              }}
            >
              {t('cancel')}
            </button>
          </div>
        )
      case 'pending':
        return (
          <div style={panel}>
            {/* Announce pending state to screen readers (#80) */}
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
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <h1 style={hw} aria-hidden="true">
                {t('pendingH1')}
              </h1>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-data)',
                  color: 'var(--ink-60)',
                  margin: 0,
                }}
                aria-hidden="true"
              >
                {t('pendingSub')}
              </p>
            </div>
          </div>
        )
      case 'success':
        return (
          <div style={panel}>
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
              {isQueued ? 'Withdrawal queued' : t('successH1')}
            </div>
            <h1 style={{ ...hw, textAlign: 'center' }}>
              {isQueued ? 'Withdrawal queued' : t('successH1')}
            </h1>
            {isQueued ? (
              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-pill)',
                    background: 'rgba(234, 179, 8, 0.15)',
                    border: '1px solid rgba(234, 179, 8, 0.4)',
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-data)',
                    fontWeight: 600,
                    fontSize: 'var(--type-small)',
                    marginBottom: 14,
                  }}
                >
                  Queued — position #{queuePosition ?? 1}, est. amount ${formatDecimal(estimatedAmount ?? n, DISPLAY_DECIMALS)} USDC
                </div>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--type-data)',
                    lineHeight: 1.55,
                    color: 'var(--ink-60)',
                    margin: 0,
                  }}
                >
                  Your withdrawal has been queued in the FIFO queue because immediate vault liquidity is limited. You can track and claim this withdrawal from your Portfolio once liquidity becomes available.
                </p>
              </div>
            ) : (
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
                  amount: formatDecimal(n, DISPLAY_DECIMALS),
                  num: (c: ReactNode) => (
                    <b className="hb-data" style={{ color: 'var(--ink)' }}>
                      {c}
                    </b>
                  ),
                })}
              </p>
            )}
            {txHash && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <AddressChip
                  value={txHash}
                  explorerUrl={txExplorerUrl}
                  label={t('transactionHashLabel')}
                />
              </div>
            )}
            <Button variant="primary" size="lg" style={{ width: '100%', background: 'var(--primary)' }} onClick={onDone}>
              {t('backToPortfolio')}
            </Button>
          </div>
        )
      default: {
        const _exhaustiveCheck: never = currentStep
        return _exhaustiveCheck
      }
    }
  }

  return (
    <main id="main-content" style={{ maxWidth: 520, margin: '0 auto', padding: '48px 24px 80px' }}>
      {renderStep(step)}
    </main>
  )
}

const panel: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-modal)',
  padding: 28,
  boxShadow: 'var(--shadow-sm)',
  maxHeight: 'calc(100dvh - 32px)',
  overflowY: 'auto',
}
const hw: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 'var(--type-h3)',
  lineHeight: 1.2,
  letterSpacing: '-0.01em',
  margin: '0 0 18px',
  color: 'var(--ink)',
}