'use client'

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button, AmountInput, LiquidityMeter } from '../components'
import { submitWithdraw } from '../wallet/vault'
import { useWallet } from '../wallet/WalletProvider'

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
  const { address, sign } = useWallet()
  const liquid = 236 // your liquid share, $
  const [step, setStep] = useState<WithdrawStep>('amount')
  const [amount, setAmount] = useState('')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [txError, setTxError] = useState<string | null>(null)

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
  const n = parseFloat(amount) || 0

  return (
    <main id="main-content" style={{ maxWidth: 520, margin: '0 auto', padding: '48px 24px 80px' }}>
      {step === 'amount' && (
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
                fontSize: 13.5,
                color: 'var(--ember)',
              }}
            >
              {txError}
            </div>
          )}
          <div style={{ marginBottom: 18 }}>
            <LiquidityMeter liquid={liquid} total={482} currency="$" />
          </div>
          <AmountInput
            value={amount}
            onChange={setAmount}
            currency="USDC"
            balanceLabel={t('yourValue')}
            balance="482.00"
            chips={[25, 50, 100]}
            cap={liquid}
            capMessage={t('capMessage', { cap: liquid })}
          />
          <Button
            variant="primary"
            size="lg"
            style={{ width: '100%', marginTop: 20 }}
            disabled={n < 1 || n > liquid}
            reason={n > liquid ? t('reasonExceeds') : n < 1 ? t('reasonMin') : undefined}
            onClick={async () => {
              changeStep('pending')
              setTxError(null)
              const controller = new AbortController()
              abortControllerRef.current = controller
              try {
                const hash = await submitWithdraw(n, address ?? '', sign, controller.signal)
                if (mountedRef.current) {
                  setTxHash(hash)
                  changeStep('success')
                }
              } catch (e) {
                if (mountedRef.current) {
                  if (e instanceof Error && e.message === 'Aborted') {
                    return
                  }
                  setTxError(
                    e instanceof Error ? e.message : 'Transaction failed — please try again.',
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
            {n >= 1 && n <= liquid ? t('withdrawCta', { amount: n }) : t('withdrawCtaEmpty')}
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
              fontSize: 14,
              color: 'var(--ink-60)',
            }}
          >
            {t('cancel')}
          </button>
        </div>
      )}

      {step === 'pending' && (
        <div style={panel}>
          {/* Announce pending state to screen readers (#80) */}
          <div role="status" aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
            {t('pendingH1')}. {t('pendingSub')}
          </div>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <h1 style={hw} aria-hidden="true">{t('pendingH1')}</h1>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14.5,
                color: 'var(--ink-60)',
                margin: 0,
              }}
              aria-hidden="true"
            >
              {t('pendingSub')}
            </p>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div style={panel}>
          {/* Announce success to screen readers (#80) */}
          <div role="status" aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
            {t('successH1')}
          </div>
          <h1 style={{ ...hw, textAlign: 'center' }}>{t('successH1')}</h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              lineHeight: 1.55,
              color: 'var(--ink-60)',
              textAlign: 'center',
              margin: '0 0 22px',
            }}
          >
            {t.rich('successBody', {
              amount: n.toFixed(2),
              num: (c: ReactNode) => (
                <b className="hb-data" style={{ color: 'var(--ink)' }}>
                  {c}
                </b>
              ),
            })}
          </p>
          {txHash && (
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  fontFamily: 'var(--font-data)',
                  fontSize: 12.5,
                  color: 'var(--ink-40)',
                  textDecoration: 'none',
                }}
              >
                {txHash} ↗
              </a>
            </div>
          )}
          <Button variant="primary" size="lg" style={{ width: '100%' }} onClick={onDone}>
            {t('backToPortfolio')}
          </Button>
        </div>
      )}
    </main>
  )
}

const panel: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-modal)',
  padding: 28,
  boxShadow: 'var(--shadow-sm)',
}
const hw: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 23,
  lineHeight: 1.2,
  letterSpacing: '-0.01em',
  margin: '0 0 18px',
  color: 'var(--ink)',
}
