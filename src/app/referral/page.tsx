/**
 * Referral page — the main entry point for the referral program.
 *
 * This page shows:
 * - A referral dashboard with stats, share link, and history (when wallet connected)
 * - A call-to-action to connect wallet (when not connected)
 * - Referral code from URL query param (for referred users landing here)
 */

'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState, useEffect } from 'react'
import { ReferralDashboard } from '@/components/ReferralDashboard'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'

function ReferralPageContent() {
  const searchParams = useSearchParams()
  const refCode = searchParams.get('ref')
  const [walletAddress, setWalletAddress] = useState<string>('')

  useEffect(() => {
    // Try to get the wallet address from localStorage or a wallet provider
    // For now, this is a placeholder — in production this would connect to
    // the WalletProvider context.
    const stored = typeof window !== 'undefined'
      ? window.localStorage.getItem('heliobond_wallet_address')
      : null
    if (stored) setWalletAddress(stored)
  }, [])

  return (
    <div className="referral-page">
      {/* Hero section */}
      <section className="referral-page__hero">
        <h1>Referral Program</h1>
        <p className="referral-page__hero-sub">
          Earn USDC rewards by sharing Heliobond with your friends.
        </p>
        {refCode && (
          <Card className="referral-page__ref-banner">
            <p>
              🎉 You were referred by a friend! Sign up and make your first
              deposit to earn your reward.
            </p>
            <p className="referral-page__ref-code">
              Referral code: <strong>{refCode}</strong>
            </p>
          </Card>
        )}
      </section>

      {/* Dashboard */}
      <section className="referral-page__dashboard">
        {walletAddress ? (
          <ReferralDashboard walletAddress={walletAddress} />
        ) : (
          <Card>
            <div className="referral-page__connect-prompt">
              <h2>Start Earning Rewards</h2>
              <p>
                Connect your Stellar wallet to get your unique referral link and
                start earning USDC for every friend who joins.
              </p>
              <Button disabled reason="Wallet connection coming soon">
                Connect Wallet
              </Button>
            </div>
          </Card>
        )}
      </section>

      {/* Rewards info */}
      <section className="referral-page__info">
        <Card>
          <h2>Reward Details</h2>
          <ul>
            <li>
              <strong>$5 USDC</strong> reward per successful referral
            </li>
            <li>
              Referred user must make a minimum deposit of <strong>$10</strong>
            </li>
            <li>
              Rewards are paid directly to your Stellar wallet via the Heliobond
              vault contract
            </li>
            <li>
              No limit on the number of referrals — earn as much as you share!
            </li>
          </ul>
        </Card>
      </section>
    </div>
  )
}

export default function ReferralPage() {
  return (
    <Suspense
      fallback={
        <div className="referral-page" aria-busy="true">
          <Card>
            <p>Loading referral program...</p>
          </Card>
        </div>
      }
    >
      <ReferralPageContent />
    </Suspense>
  )
}
