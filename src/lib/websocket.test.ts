import { afterEach, beforeEach, describe, expect, it, vi } from '@/test/bun'
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

class Socket {
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  close = vi.fn()
}

function mockWebSocket() {
  const sockets: Socket[] = []
  const connect = vi.fn()
  vi.stubGlobal(
    'WebSocket',
    class extends Socket {
      constructor() {
        connect()
        super()
        sockets.push(this)
      }
    },
  )
  vi.stubEnv('NEXT_PUBLIC_WS_URL', 'wss://example.test/events')
  return { sockets, connect }
}

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
      const { sockets } = mockWebSocket()
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

  it('keeps fallback polling during reconnects and stops it when a socket opens', async () => {
    vi.useFakeTimers()
    const { sockets } = mockWebSocket()
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('RPC cancelled')))
        }),
    )
    const listener = vi.fn()
    stream.subscribe(listener)

    sockets[0].onclose!()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    sockets[1].onerror!()
    await vi.advanceTimersByTimeAsync(2000)
    sockets[2].onclose!()
    await vi.advanceTimersByTimeAsync(4000)
    sockets[3].onclose!()
    await vi.advanceTimersByTimeAsync(8000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const lastPoll = fetchMock.mock.calls[1][1]!.signal!

    sockets[4].onopen!()
    expect(lastPoll.aborted).toBe(true)
    sockets[4].onmessage!({ data: JSON.stringify({ type: 'Deposit', contractId }) })
    expect(listener).toHaveBeenCalledWith({ type: 'Deposit', contractId })
    await vi.advanceTimersByTimeAsync(30000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sockets).toHaveLength(5)

    sockets[4].onclose!()
    await vi.advanceTimersByTimeAsync(999)
    expect(sockets).toHaveLength(5)
    await vi.advanceTimersByTimeAsync(1)
    expect(sockets).toHaveLength(6)
  })

  it('caps reconnect backoff and retries when the socket constructor throws', async () => {
    vi.useFakeTimers()
    const { connect } = mockWebSocket()
    connect.mockImplementation(() => {
      throw new Error('Socket unavailable')
    })
    stream.subscribe(vi.fn())
    expect(fetchMock).toHaveBeenCalledTimes(1)

    for (const [i, delay] of [1000, 2000, 4000, 8000, 16000, 30000, 30000].entries()) {
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(connect).toHaveBeenCalledTimes(i + 1)
      await vi.advanceTimersByTimeAsync(1)
      expect(connect).toHaveBeenCalledTimes(i + 2)
    }
  })

  it.each(['hide', 'unsubscribe', 'destroy'] as const)(
    'cancels reconnect and fallback on %s',
    async (reason) => {
      vi.useFakeTimers()
      const { sockets } = mockWebSocket()
      const unsubscribe = stream.subscribe(vi.fn())
      sockets[0].onerror!()
      const signal = fetchMock.mock.calls[0][1]!.signal!

      if (reason === 'hide') visible(true)
      else if (reason === 'unsubscribe') unsubscribe()
      else stream.destroy()

      expect(signal.aborted).toBe(true)
      await vi.advanceTimersByTimeAsync(30000)
      expect(sockets).toHaveLength(1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      visible(false)
      expect(sockets).toHaveLength(reason === 'hide' ? 2 : 1)
    },
  )
})
