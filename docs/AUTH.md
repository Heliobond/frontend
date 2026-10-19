# Wallet-based sign-in (#603)

Watchlist, yield alerts and recurring-investment plans sync across devices for a
signed-in wallet. Without a configured backend, or while signed out, they stay in
`localStorage` exactly as before.

## Frontend

- `src/session/sessionClient.ts` — challenge / verify / refresh / logout calls.
- `src/session/SessionProvider.tsx` — `useSession()`: `status`, `isAuthenticated`,
  `signIn()`, `signOut()`, `authedFetch()`. The JWT lives in component memory only
  (never `localStorage`), is refreshed silently a minute before expiry, and is
  dropped when the wallet disconnects or the address changes. After connecting it
  first tries the refresh cookie, then asks for one signature; a declined or
  failed attempt is not repeated until the address changes (retry with `signIn()`).
- `src/session/challengeGuard.ts` — validates a challenge before the wallet is
  prompted: a `transaction` challenge must be a SEP-10 envelope (sequence 0, one
  manageData op signed by the server, near-future expiry, app passphrase) and a
  `message` challenge must be short and name the connected wallet (#834).
- `src/session/useRemoteSync.ts` — pulls `/me/<resource>` on sign-in, merges it
  with the local copy (union, so nothing saved while signed out is lost), then
  pushes later changes (debounced). Used by the watchlist, yield alerts and
  recurring-investment plans.
- Demo wallets never sign in.

Base URL: `NEXT_PUBLIC_AUTH_URL`, falling back to `NEXT_PUBLIC_API_URL`.

## Backend contract (companion backend issue)

All requests use `credentials: 'include'` so the HttpOnly refresh cookie is sent.

| Endpoint                                  | Body                                      | Response                                                                                                                                                                                                                 |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /auth/challenge`                    | `{ address }`                             | `{ type: 'message' \| 'transaction', challenge, networkPassphrase? }` — a SEP-53 message, or a SEP-10 challenge transaction XDR                                                                                          |
| `POST /auth/verify`                       | `{ address, type, challenge, signature }` | `{ token, expiresIn }` (seconds) and sets the refresh cookie. `signature` is the signed message, or the signed challenge XDR                                                                                             |
| `POST /auth/refresh`                      | `{}`                                      | `{ token, expiresIn, address }`, or `401` when there is no valid refresh cookie. The client also decodes the JWT `address`/`sub` claim, and discards + ends any refresh whose address is not the connected wallet (#835) |
| `POST /auth/logout`                       | `{}`                                      | `204`, clears the cookie                                                                                                                                                                                                 |
| `GET /me/watchlist` / `PUT /me/watchlist` | `number[]`                                | `number[]`                                                                                                                                                                                                               |
| `GET /me/alerts` / `PUT /me/alerts`       | `YieldAlert[]`                            | `YieldAlert[]`                                                                                                                                                                                                           |
| `GET /me/recurring` / `PUT /me/recurring` | `RecurringInvestmentPlan[]`               | `RecurringInvestmentPlan[]`                                                                                                                                                                                              |

`/me/*` requires `Authorization: Bearer <token>` and is scoped to the token's
G-address. A `401` triggers one silent refresh and retry.

Known limitation: an item deleted on one device while signed out reappears after
the union merge on next sign-in.
