/**
 * ReferralDashboard — displays complete referral program stats, share link,
 * and referral history for the authenticated user.
 *
 * Requires a connected Stellar wallet to fetch referral data.
 *
 * Usage:
 *   <ReferralDashboard walletAddress="GABC..." />
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  fetchReferralStats,
  fetchReferralHistory,
} from '@/lib/referral'
import type { ReferralStats, ReferralRecord } from '@/lib/referral'
import { ReferralShareLink } from './ReferralShareLink'
import { StatBlock } from './StatBlock'
import { Card } from './Card'

export interface ReferralDashboardProps {
  /** The user's Stellar wallet address */
  walletAddress: string
  /** Optional class name */
  className?: string
}

type LoadState = 'loading' | 'loaded' | 'error' | 'empty'

export function ReferralDashboard({
  walletAddress,
  className,
}: ReferralDashboardProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [stats, setStats] = useState<ReferralStats | null>(null)
  const [history, setHistory] = useState<ReferralRecord[]>([])

  const loadData = useCallback(async () => {
    if (!walletAddress) {
      setLoadState('empty')
      return
    }

    setLoadState('loading')
    try {
      const [s, h] = await Promise.all([
        fetchReferralStats(walletAddress),
        fetchReferralHistory(walletAddress),
      ])
      setStats(s)
      setHistory(h)
      setLoadState('loaded')
    } catch (err) {
      console.error('Failed to load referral data:', err)
      setLoadState('error')
    }
  }, [walletAddress])

  useEffect(() => {
    loadData()
  }, [loadData])

  // --- Loading state ---
  if (loadState === 'loading') {
    return (
      <div className={`referral-dashboard ${className ?? ''}`} aria-busy="true">
        <Card>
          <div className="referral-dashboard__skeleton">
            <div className="skeleton-line skeleton-line--lg" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
        </Card>
      </div>
    )
  }

  // --- Empty state ---
  if (loadState === 'empty' || !stats) {
    return (
      <div className={`referral-dashboard ${className ?? ''}`}>
        <Card>
          <div className="referral-dashboard__empty">
            <h3>Referral Program</h3>
            <p>
              Connect your Stellar wallet to view your referral link and start
              earning rewards.
            </p>
            <p className="referral-dashboard__reward-note">
              Earn ${String(5)} USDC for every friend who signs up and makes their
              first deposit.
            </p>
          </div>
        </Card>
      </div>
    )
  }

  // --- Error state ---
  if (loadState === 'error') {
    return (
      <div className={`referral-dashboard ${className ?? ''}`}>
        <Card>
          <div className="referral-dashboard__error">
            <h3>Referral Program</h3>
            <p>Unable to load referral data. Please try again later.</p>
            <button onClick={loadData} className="referral-dashboard__retry-btn">
              Retry
            </button>
          </div>
        </Card>
      </div>
    )
  }

  // --- Loaded state ---
  return (
    <div className={`referral-dashboard ${className ?? ''}`}>
      {/* Stats overview */}
      <section className="referral-dashboard__stats">
        <StatBlock
          label="Total Referrals"
          value={String(stats.totalReferred)}
        />
        <StatBlock label="Rewards Earned" value={`$${stats.rewardsEarned}`} />
        <StatBlock label="Pending" value={`$${stats.rewardsPending}`} />
      </section>

      {/* Share link section */}
      <Card>
        <h3 className="referral-dashboard__section-title">
          Your Referral Link
        </h3>
        <p className="referral-dashboard__section-desc">
          Share this link with friends. When they sign up and make their first
          deposit, you both earn USDC rewards.
        </p>
        <ReferralShareLink referralCode={stats.referralCode} />
      </Card>

      {/* Referral history */}
      <Card>
        <h3 className="referral-dashboard__section-title">
          Referral History
        </h3>
        {history.length === 0 ? (
          <p className="referral-dashboard__empty-history">
            No referrals yet. Share your link to get started!
          </p>
        ) : (
          <div className="referral-dashboard__history">
            <div className="referral-dashboard__history-header">
              <span>Referred Address</span>
              <span>Status</span>
              <span>Reward</span>
              <span>Date</span>
            </div>
            {history.map((record, i) => (
              <div key={i} className="referral-dashboard__history-row">
                <span className="referral-dashboard__address">
                  {record.refereeAddress.slice(0, 8)}...
                  {record.refereeAddress.slice(-4)}
                </span>
                <span>
                  {record.completed ? (
                    <span className="referral-dashboard__status--completed">
                      Completed
                    </span>
                  ) : (
                    <span className="referral-dashboard__status--pending">
                      Pending
                    </span>
                  )}
                </span>
                <span>
                  {record.completed ? `$${record.rewardAmount}` : '—'}
                </span>
                <span>
                  {new Date(record.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* How it works */}
      <Card>
        <h3 className="referral-dashboard__section-title">How It Works</h3>
        <ol className="referral-dashboard__how-it-works">
          <li>
            <strong>Share</strong> your unique referral link with friends
          </li>
          <li>
            <strong>They sign up</strong> and connect their Stellar wallet
          </li>
          <li>
            <strong>First deposit</strong> — once they make their first green
            bond investment
          </li>
          <li>
            <strong>Both earn</strong> — you each receive USDC rewards directly
            to your wallets
          </li>
        </ol>
      </Card>
    </div>
  )
}
