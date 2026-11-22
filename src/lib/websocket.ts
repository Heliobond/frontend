/** Shared, visibility-aware vault event subscription with RPC fallback. */
import { SOROBAN_RPC_URL } from '../config/network'

export interface VaultEvent {
  type: string
  contractId: string
  ledger?: number
  topic?: string[]
  value?: unknown
  id?: string
}
export type VaultEventListener = (event: VaultEvent) => void
interface EventPage {
  cursor?: string
  events?: Array<Omit<VaultEvent, 'type'> & { topic: string[] }>
}

const INITIAL_RECONNECT_DELAY = 1000
const MAX_RECONNECT_DELAY = 30000

export class VaultEventStream {
  private listeners = new Set<VaultEventListener>()
  private ws: WebSocket | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = INITIAL_RECONNECT_DELAY
  private request: AbortController | null = null
  private cursor: string | null = null
  private source = ''

  public subscribe(listener: VaultEventListener): () => void {
    this.listeners.add(listener)
    if (this.listeners.size === 1 && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange)
      this.start()
    }
    return () => {
      this.listeners.delete(listener)
      if (!this.listeners.size) this.destroy()
    }
  }

  public emit(event: VaultEvent): void {
    if (typeof document !== 'undefined' && document.hidden) return
    if (event.contractId !== process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID) return
    this.listeners.forEach((listener) => {
      try {
        listener(event)
      } catch {
        /* Isolate subscriber failures. */
      }
    })
  }

  public start(): void {
    if (typeof document === 'undefined' || document.hidden || !this.listeners.size) return
    if (this.ws || this.reconnectTimer !== null) return
    if (!process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID) return
    const url = process.env.NEXT_PUBLIC_WS_URL
    if (!url) return this.startRpcPolling()
    try {
      const ws = new WebSocket(url)
      this.ws = ws
      ws.onopen = () => {
        if (this.ws !== ws) return
        this.reconnectDelay = INITIAL_RECONNECT_DELAY
        this.stopRpcPolling()
      }
      ws.onmessage = ({ data }) => {
        if (this.ws !== ws) return
        try {
          const event = JSON.parse(data) as VaultEvent
          if (typeof event?.type === 'string') this.emit(event)
        } catch {
          /* Ignore malformed frames. */
        }
      }
      const fallback = () => {
        if (this.ws !== ws) return
        this.closeSocket()
        this.fallBackToRpc()
      }
      ws.onerror = fallback
      ws.onclose = fallback
    } catch {
      this.fallBackToRpc()
    }
  }

  private fallBackToRpc(): void {
    this.startRpcPolling()
    if (this.reconnectTimer !== null || !this.listeners.size || document.hidden) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.start()
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY)
  }

  private closeSocket(): void {
    const ws = this.ws
    this.ws = null
    if (!ws) return
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
    try {
      ws.close()
    } catch {
      /* Already closed. */
    }
  }

  public stop(): void {
    this.closeSocket()
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.reconnectDelay = INITIAL_RECONNECT_DELAY
    this.stopRpcPolling()
  }

  private stopRpcPolling(): void {
    if (this.pollTimer !== null) clearInterval(this.pollTimer)
    this.pollTimer = null
    this.request?.abort()
    this.request = null
  }

  private startRpcPolling(): void {
    if (this.pollTimer !== null || !this.listeners.size || document.hidden) return
    void this.pollEvents()
    this.pollTimer = setInterval(() => void this.pollEvents(), 10000)
  }

  public async pollEvents(): Promise<VaultEvent[]> {
    const contractId = process.env.NEXT_PUBLIC_VAULT_CONTRACT_ID
    if (!contractId || typeof document === 'undefined' || document.hidden || this.request) return []
    const url = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || SOROBAN_RPC_URL
    if (this.source !== `${url}:${contractId}`) {
      this.cursor = null
      this.source = `${url}:${contractId}`
    }
    const controller = new AbortController()
    this.request = controller
    const timeout = setTimeout(() => controller.abort(), 8000)
    const call = async <T>(method: string, params: object): Promise<T> => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      })
      if (!response.ok) throw new Error('RPC unavailable')
      const data = (await response.json()) as { result?: T; error?: { code: number } }
      if (controller.signal.aborted) throw new Error('Request cancelled')
      if (data.error || !data.result) {
        // An expired cursor must not trap polling in a permanent error loop.
        if (method === 'getEvents' && data.error?.code === -32602) this.cursor = null
        throw new Error('RPC request failed')
      }
      return data.result
    }
    try {
      const startLedger = this.cursor
        ? undefined
        : (await call<{ sequence: number }>('getLatestLedger', {})).sequence
      if (!this.cursor && (!Number.isInteger(startLedger) || startLedger! < 1)) return []
      const { scValToNative, xdr } = await import('@stellar/stellar-sdk')
      if (controller.signal.aborted) return []
      const collected: VaultEvent[] = []
      // Drain bursts without allowing an unbounded request loop.
      for (let page = 0; page < 10; page++) {
        const previousCursor = this.cursor
        const result: EventPage = await call<EventPage>('getEvents', {
          ...(this.cursor ? {} : { startLedger }),
          filters: [{ type: 'contract', contractIds: [contractId] }],
          pagination: { limit: 100, ...(this.cursor ? { cursor: this.cursor } : {}) },
        })
        for (const event of result.events ?? []) {
          try {
            const type: unknown = scValToNative(xdr.ScVal.fromXDR(event.topic[0], 'base64'))
            if (typeof type !== 'string' || event.contractId !== contractId) continue
            const decoded = { ...event, type }
            collected.push(decoded)
            this.emit(decoded)
          } catch {
            /* Skip malformed event topics. */
          }
        }
        this.cursor = result.cursor ?? this.cursor
        if ((result.events?.length ?? 0) < 100 || !this.cursor || this.cursor === previousCursor)
          break
      }
      return collected
    } catch {
      return []
    } finally {
      clearTimeout(timeout)
      if (this.request === controller) this.request = null
    }
  }

  private handleVisibilityChange = (): void => {
    if (document.hidden) this.stop()
    else this.start()
  }

  public destroy(): void {
    this.stop()
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    this.listeners.clear()
  }
}

export const vaultEventStream = new VaultEventStream()
export function subscribeVaultEvents(listener: VaultEventListener): () => void {
  return vaultEventStream.subscribe(listener)
}
