import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nativeToScVal } from '@stellar/stellar-sdk'
import { VaultEventStream } from './websocket'

const contractId = 'CVAULT1234567890'
const response = (result: object) => ({ ok: true, json: async () => ({ result }) }) as Response
const event = (type: string) => ({
  id: 'event-1',
  contractId,
  ledger: 200,
  topic: [nativeToScVal(type, { type: 'symbol' }).toXDR('base64')],
  value: 'AAAAAA==',
})
const visible = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
  document.dispatchEvent(new Event('visibilitychange'))
}
let stream: VaultEventStream
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_VAULT_CONTRACT_ID', contractId)
  vi.stubEnv('NEXT_PUBLIC_WS_URL', '')
  visible(false)
  fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response({ sequence: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  stream = new VaultEventStream()
})
afterEach(() => {
  stream.destroy()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  visible(false)
})

describe('vault event stream', () => {
  it('initializes a ledger, decodes actual XDR topics, and reuses the cursor', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ sequence: 200 }))
      .mockResolvedValueOnce(response({ cursor: 'cursor-1', events: [event('Deposit')] }))
      .mockResolvedValueOnce(response({ cursor: 'cursor-2', events: [event('YieldReceived')] }))
    expect((await stream.pollEvents())[0].type).toBe('Deposit')
    expect((await stream.pollEvents())[0].type).toBe('YieldReceived')
    const payloads = fetchMock.mock.calls.map(([, init]) => JSON.parse(init!.body as string))
    expect(payloads[0].method).toBe('getLatestLedger')
    expect(payloads[1].params.startLedger).toBe(200)
    expect(payloads[1].params.pagination.cursor).toBeUndefined()
    expect(payloads[2].params.startLedger).toBeUndefined()
    expect(payloads[2].params.pagination.cursor).toBe('cursor-1')
  })

  it('recovers from an expired cursor', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ sequence: 200 }))
      .mockResolvedValueOnce(response({ cursor: 'old', events: [] }))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: { code: -32602 } }),
      } as Response)
      .mockResolvedValueOnce(response({ sequence: 300 }))
      .mockResolvedValueOnce(response({ cursor: 'new', events: [] }))
    await stream.pollEvents()
    await stream.pollEvents()
    await stream.pollEvents()
    expect(JSON.parse(fetchMock.mock.calls[3][1]!.body as string).method).toBe('getLatestLedger')
    expect(JSON.parse(fetchMock.mock.calls[4][1]!.body as string).params.startLedger).toBe(300)
  })

  it('does not fetch while hidden and resumes on document visibilitychange', async () => {
    visible(true)
    const unsubscribe = stream.subscribe(vi.fn())
    await stream.pollEvents()
    expect(fetchMock).not.toHaveBeenCalled()
    visible(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const signal = fetchMock.mock.calls[0][1]!.signal!
    visible(true)
    expect(signal.aborted).toBe(true)
    unsubscribe()
  })

  it('prevents overlapping requests and discards cancelled responses', async () => {
    let resolve!: (response: Response) => void
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const pending = stream.pollEvents()
    expect(await stream.pollEvents()).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    stream.stop()
    resolve(response({ sequence: 200 }))
    expect(await pending).toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each(['onclose', 'onerror'] as const)(
    'falls back on WebSocket %s, without restarting after cleanup',
    async (handler) => {
      class Socket {
        onmessage: ((event: { data: string }) => void) | null = null
        onclose: (() => void) | null = null
        onerror: (() => void) | null = null
        close = vi.fn()
        constructor() {
          sockets.push(this)
        }
      }
      const sockets: Socket[] = []
      vi.stubGlobal('WebSocket', Socket)
      vi.stubEnv('NEXT_PUBLIC_WS_URL', 'wss://example.test/events')
      const listener = vi.fn()
      const unsubscribe = stream.subscribe(listener)
      sockets[0].onmessage!({ data: JSON.stringify({ type: 'Deposit', contractId: 'other' }) })
      expect(listener).not.toHaveBeenCalled()
      sockets[0].onmessage!({ data: JSON.stringify({ type: 'Deposit', contractId }) })
      expect(listener).toHaveBeenCalledTimes(1)
      const staleHandler = sockets[0][handler]!
      staleHandler()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      unsubscribe()
      staleHandler()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(sockets[0].close).toHaveBeenCalled()
    },
  )
})
