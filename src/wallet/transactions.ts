import { SOROBAN_RPC_URL, STELLAR_NETWORK } from '../config/network'

export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'timeout_pending'
export type TransactionKind = string
export interface TransactionItem {
  hash: string
  kind: TransactionKind
  amount?: number
  status: TransactionStatus
  submittedAt: number
  /** Simulated maximum fee, in XLM; not the final charged fee. */
  fee?: number
  resourceFee?: number
  inclusionFee?: number
  error?: string
  network?: 'testnet' | 'public'
  rpcUrl?: string
  address?: string
}
export const TRANSACTIONS_KEY = 'hb-pending-transactions'
const empty: TransactionItem[] = []
let items: TransactionItem[] = []
const listeners = new Set<() => void>()
export const isPending = (item: TransactionItem) =>
  item.status === 'pending' || item.status === 'timeout_pending'

function readPending(): TransactionItem[] {
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(TRANSACTIONS_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((item): item is TransactionItem => {
      if (!item || typeof item !== 'object') return false
      const t = item as TransactionItem
      return (
        typeof t.hash === 'string' &&
        typeof t.kind === 'string' &&
        (t.error === undefined || typeof t.error === 'string') &&
        (t.address === undefined || typeof t.address === 'string') &&
        (t.rpcUrl === undefined || typeof t.rpcUrl === 'string') &&
        Number.isFinite(t.submittedAt) &&
        isPending(t) &&
        (t.network === undefined || t.network === 'testnet' || t.network === 'public') &&
        ['fee', 'resourceFee', 'inclusionFee', 'amount'].every((key) => {
          const value = t[key as keyof TransactionItem]
          return (
            value === undefined ||
            (typeof value === 'number' && Number.isFinite(value) && value >= 0)
          )
        })
      )
    })
  } catch {
    return []
  }
}
function publish() {
  try {
    sessionStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(items.filter(isPending)))
  } catch {
    /* Storage may be disabled. */
  }
  listeners.forEach((listener) => listener())
}
export function subscribeTransactions(listener: () => void) {
  if (!listeners.size) items = readPending()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export const getTransactions = () => items
export const getServerTransactions = () => empty

export function recordTransaction(
  tx: Omit<TransactionItem, 'submittedAt'> & { submittedAt?: number },
) {
  if (!listeners.size) {
    const saved = readPending()
    items = [...items, ...saved.filter((item) => !items.some((old) => old.hash === item.hash))]
  }
  const old = items.find((item) => item.hash === tx.hash)
  // Background and foreground checks may complete in either order.
  if (old && !isPending(old) && isPending(tx as TransactionItem)) return
  const next = {
    network: STELLAR_NETWORK,
    rpcUrl: SOROBAN_RPC_URL,
    submittedAt: Date.now(),
    ...old,
    ...tx,
  }
  items = old ? items.map((item) => (item.hash === tx.hash ? next : item)) : [next, ...items]
  if (next.kind === 'deposit' && !isPending(next)) {
    try {
      const guard = JSON.parse(sessionStorage.getItem('hb_pending_deposit') ?? 'null')
      if (
        guard?.address === next.address &&
        guard?.amount === next.amount &&
        guard?.startedAt <= next.submittedAt
      ) {
        sessionStorage.removeItem('hb_pending_deposit')
      }
    } catch {
      /* Ignore unavailable or invalid guard storage. */
    }
  }
  publish() // Persist synchronously, before the next RPC await or browser reload.
}
export function updateTransaction(
  hash: string,
  status: TransactionStatus,
  extra?: Partial<TransactionItem>,
) {
  const item = items.find((tx) => tx.hash === hash)
  if (!item || (!isPending(item) && status !== item.status)) return
  recordTransaction({ ...item, ...extra, hash, status })
}
export function clearCompletedTransactions() {
  items = items.filter(isPending)
  publish()
}
export class TransactionPendingError extends Error {
  constructor(public readonly hash: string) {
    super("Still pending — we'll keep checking")
    this.name = 'TransactionPendingError'
  }
}
