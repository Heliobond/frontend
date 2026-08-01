# Heliobond Referral Program

> Earn USDC rewards by sharing Heliobond with your friends. Both you and your
> referred friend earn rewards when they make their first green bond investment.

## Overview

The Heliobond referral program is built directly into the application and
integrated with the Stellar network. Every user gets a unique referral code
generated from their wallet address — no database required, fully deterministic.

## How It Works

1. **Get your link** — Connect your Stellar wallet and visit the Referral page
   (`/referral`). Your unique referral link is generated automatically.

2. **Share** — Send your link to friends via Twitter/X, Telegram, email, or
   copy it to your clipboard.

3. **They invest** — When a referred user signs up and makes their first deposit
   (minimum $10 USDC), the referral is recorded on-chain.

4. **Both earn** — You and your friend each receive **$5 USDC** directly to
   your Stellar wallets via the Heliobond vault smart contract.

## Reward Structure

| Action | Reward |
|---|---|
| Successful referral (first deposit ≥ $10) | **$5 USDC** each |
| Maximum referrals | **Unlimited** |
| Reward source | Heliobond vault contract |
| Network | Stellar (testnet or mainnet) |

## Technical Details

### Referral Code Generation

Referral codes are 8-character alphanumeric strings generated deterministically
from the user's Stellar wallet address (G...). The algorithm:

```typescript
// src/lib/referral.ts
function generateReferralCode(address: string): string
```

- Uses a hash of the wallet address
- Excludes ambiguous characters (I, O, 0, 1)
- Same address always produces the same code
- No database or server-side storage needed

### Share Links

Share links are pre-configured for four platforms:

| Platform | Format |
|---|---|
| Twitter/X | `https://twitter.com/intent/tweet?text=...` |
| Telegram | `https://t.me/share/url?url=...` |
| Email | `mailto:?subject=...&body=...` |
| Clipboard | Plain URL copied to clipboard |

### On-Chain Integration

When `NEXT_PUBLIC_VAULT_CONTRACT_ID` is configured:

- Referral stats are fetched from the Stellar Horizon API
- Reward payments are tracked via on-chain transaction history
- The Heliobond vault contract handles reward distribution

In **demo mode** (no contract ID), mock data is returned for development and
testing.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_REFERRAL_REWARD_USDC` | `5` | USDC reward per successful referral |
| `NEXT_PUBLIC_APP_URL` | `https://heliobond.vercel.app` | Base URL for share links |
| `NEXT_PUBLIC_VAULT_CONTRACT_ID` | _(none)_ | Soroban contract ID for on-chain mode |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` | Stellar network (`public`, `testnet`, `futurenet`) |

## Components

### `ReferralDashboard`

The main dashboard component showing:
- Referral stats (total referrals, rewards earned, pending)
- Share link with copy-to-clipboard
- Social sharing buttons
- Referral history table
- "How It Works" guide

```tsx
import { ReferralDashboard } from '@/components/ReferralDashboard'

<ReferralDashboard walletAddress="GABC..." />
```

### `ReferralShareLink`

A standalone share link component with copy button and social sharing:

```tsx
import { ReferralShareLink } from '@/components/ReferralShareLink'

<ReferralShareLink referralCode="ABCDEFGH" />
```

### Library Functions

| Function | Description |
|---|---|
| `generateReferralCode(address)` | Generate a referral code from a wallet address |
| `buildReferralLink(code)` | Build the full referral URL |
| `extractReferralCode(url)` | Extract referral code from a URL |
| `isValidReferralCode(code)` | Validate referral code format |
| `generateShareLinks(code)` | Generate share links for all platforms |
| `fetchReferralStats(address)` | Fetch referral stats (mock or on-chain) |
| `fetchReferralHistory(address)` | Fetch referral history records |
| `getReferralReward()` | Get the configured reward amount |

## Testing

```bash
# Run all referral tests
bun run test -- src/lib/referral src/components/Referral

# Run with coverage
bun run test -- --coverage src/lib/referral src/components/Referral

# Run E2E tests
bunx playwright test referral/
```

## Security Considerations

- Referral codes are derived from public wallet addresses — no private keys
  involved
- Share links use standard web intents (Twitter, Telegram) — no API tokens
  needed
- Rewards are distributed via audited Soroban smart contracts
- All on-chain interactions require wallet signature confirmation
- Referral codes cannot be used to reverse-engineer wallet addresses

## Future Enhancements

- [ ] Real-time referral notifications via Stellar WebSocket
- [ ] Referral leaderboard
- [ ] Multi-tier rewards (more for power referrers)
- [ ] Referral analytics dashboard
- [ ] Email invitation system with tracking
