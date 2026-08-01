'use client'

import { Card } from '@/components/Card'
import Link from 'next/link'

export default function ReferralError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="referral-page">
      <Card>
        <div className="referral-page__error">
          <h2>Something went wrong</h2>
          <p>
            We couldn&apos;t load the referral program right now. Please try again.
          </p>
          <div className="referral-error__actions">
            <button onClick={reset} className="referral-error__retry">
              Try again
            </button>
            <Link href="/">Go home</Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
