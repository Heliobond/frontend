# Error Codes

This document explains the frontend error codes handled by
`src/lib/errorMessages.ts`, plus the API codes the frontend may receive from the
Heliobond backend.

## Frontend Codes

| Code | Meaning | Suggested action |
| --- | --- | --- |
| `insufficient_balance` | Wallet balance is too low for the requested amount. | Use a smaller amount or fund the wallet. |
| `insufficient_funds` | Alias for an insufficient wallet balance. | Use a smaller amount or fund the wallet. |
| `amount_too_low` | Deposit or withdrawal amount is below the minimum. | Enter at least the displayed minimum amount. |
| `amount_exceeds_balance` | Requested amount is greater than the available balance. | Use Max or enter a smaller amount. |
| `invalid_amount` | Amount input could not be parsed as a valid number. | Re-enter the amount using numeric characters. |
| `wallet_not_connected` | A wallet-only action was attempted without an active wallet session. | Connect a wallet and retry. |
| `timeout` | A network, wallet, or transaction confirmation request timed out. | Retry after checking network connectivity. |
| `network_error` | The frontend could not reach the API, RPC, or wallet provider. | Check connectivity and retry. |
| `simulation_failed` | Soroban transaction simulation failed before submission. | Retry; if it repeats, inspect the contract/RPC response. |
| `tx_failed` | Submitted transaction failed or was rejected. | Review wallet details and retry. |
| `slippage_limit_exceeded` | Price moved past the slippage tolerance. | Refresh the quote and retry. |

## API Codes

The backend documents API responses as
`{ "error": { "code": "<code>", "message": "<detail>" } }`. Common codes are:

| Code | Meaning | Suggested action |
| --- | --- | --- |
| `bad_request` | Request parameters or body failed validation. | Fix the request input shown in the message. |
| `unauthorized` | Missing or invalid admin/API bearer token. | Provide the expected token for protected routes. |
| `not_found` | Route or resource was not found. | Confirm the route and resource identifier. |
| `too_many_requests` | Rate limit exceeded. | Wait for the `Retry-After` window before retrying. |
| `payload_too_large` | Request body exceeded the configured size limit. | Reduce payload size. |
| `server_misconfigured` | Backend is missing required server-side configuration. | Configure the backend environment before retrying. |
| `INTERNAL_ERROR` | Unexpected backend exception. | Check server logs; do not expose stack traces to users. |

## Opaque `ERR_###` Codes

Codes such as `ERR_008` are not currently defined by the frontend mapper. Treat
them as backend, wallet, protocol, or provider-specific codes until their source
is identified.

When adding a new `ERR_###` code, update this file and add a mapping in
`src/lib/errorMessages.ts` so users see a friendly message instead of the raw
identifier.

## Soroban contract errors

Contract failures reach the browser as `Error(Contract, #N)` inside a
`HostError` or `Simulation failed: ...` string. `src/lib/contractErrors.ts`
parses `N` and looks it up in `src/lib/contractErrorCodes.ts`, which mirrors the
`VaultError` (`investment_vault`) and `RegistryError` (`project_registry`)
enums in [Heliobond/contracts](https://github.com/Heliobond/contracts). Codes
are stable on-chain, so the tables only ever grow.

Messages live in the `ContractErrors` namespace of `messages/{en,fr,es,pt,ar}.json`.
Common user-facing failures have their own message (`vault_<Variant>`,
`registry_<Variant>`); admin-only, configuration, input-validation, bridge and
governance failures share a category message (`category_admin`,
`category_unavailable`, `category_invalid`, `category_bridge`,
`category_governance`). An unmapped code falls back to `unknown`.
`WithdrawalExceedsLimit` and `InsufficientLiquid` add the pool utilization when
it can be read (`..._Util` keys).

### Vault (`VaultError`) - messages a user is likely to see

| Code | Variant | Message summary / suggested action |
| --- | --- | --- |
| 1 | `AmountNotPositive` | Enter an amount greater than zero. |
| 2 | `DepositExceedsMaximum` | Deposit is above the per-deposit maximum; use less. |
| 5 | `WithdrawalExceedsLimit` | Liquidity is limited; try a smaller amount (shows utilization). |
| 6 | `InsufficientLiquid` | Not enough liquid funds; try less or join the queue. |
| 31 | `DepositBelowMinimum` | Deposit is below the minimum. |
| 32 | `WithdrawBelowMinimum` | Withdrawal is below the minimum. |
| 33 | `SlippageLimitExceeded` | Refresh the quote or raise the slippage tolerance. |
| 34 | `Paused` | Vault paused for maintenance; retry later. |
| 35 | `RegistryPaused` | New investments paused; retry later. |
| 36 | `DepositLocked` | Recent deposit is still locked; withdraw after it ends. |
| 38 | `MaxSupplyExceeded` | Pool is at maximum size; try less or later. |
| 43 | `InvestmentCapExceeded` | Project hit its funding cap; pick less or another project. |
| 44 | `ExceedsMaxTransactionAmount` | Over the per-transaction limit; split it up. |

Every other `VaultError` code (1-61) maps to a category or specific message in
`src/lib/contractErrorCodes.ts`. A test (`contractErrors.test.ts`) fails if a
code has no message in any of the five locales.

### Registry (`RegistryError`)

Specific messages exist for `NotWhitelisted` (1), `ProjectNotFound` (7),
`ProjectNotMature` (20), `ProjectHasInvestments` (30), `ProjectArchived` (31),
`UpdateTooFrequent` (33) and `Paused` (35); all other codes (1-45) use a category
message. Registry errors are only resolved as such when the caller passes
`{ source: 'registry' }` - numbering overlaps with the vault, so the default is
`vault`.

### Adding a code

1. Add the variant to `contractErrorCodes.ts` with its message key.
2. Add the key to `ContractErrors` in every `messages/*.json` (or reuse a
   `category_*` key).
3. Add the code to the tables above if it is user-facing.
