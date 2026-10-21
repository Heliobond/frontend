import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  fetchTotalProjects,
  fetchProjectsPage,
  fetchProjectWithDetails,
  fetchScoreHistory,
  clearRegistryCache,
  isRegistryConfigured,
  computeSha256,
  normalizeHash,
  setSimulateRegistryCall,
  resetSimulateRegistryCall,
  resolveMetadataUri,
  validateOffChainMetadata,
  MAX_METADATA_SIZE_BYTES,
  withSimulationTimeout,
  withFetchTimeout,
  mapOnChainProject,
  type OnChainProjectRaw,
} from './registry'

describe('registry client', () => {
  beforeEach(() => {
    clearRegistryCache()
    resetSimulateRegistryCall()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    clearRegistryCache()
    resetSimulateRegistryCall()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('falls back gracefully to fixtures when registry contract is unset', async () => {
    expect(isRegistryConfigured()).toBe(false)

    const total = await fetchTotalProjects()
    expect(total).toBeGreaterThan(0)

    const page = await fetchProjectsPage(0, 3)
    expect(page.projects).toHaveLength(3)
    expect(page.total).toBe(total)

    const detail = await fetchProjectWithDetails(1)
    expect(detail).not.toBeNull()
    expect(detail?.project.id).toBe(1)
    expect(detail?.verifiedMetadata).toBe('unverified')

    const scores = await fetchScoreHistory(1)
    expect(scores.credit.length).toBeGreaterThan(0)
    expect(scores.green.length).toBeGreaterThan(0)
  })

  describe('computeSha256 and normalizeHash helpers', () => {
    it('computes expected lowercase SHA-256 hex string from ArrayBuffer or Uint8Array', async () => {
      const raw = new TextEncoder().encode('heliobond metadata test string')
      const hashFromArrayBuffer = await computeSha256(raw.buffer)
      const hashFromUint8 = await computeSha256(raw)
      expect(hashFromArrayBuffer).toBe(hashFromUint8)
      expect(hashFromArrayBuffer).toMatch(/^[0-9a-f]{64}$/)
    })

    it('returns null if crypto.subtle is unavailable', async () => {
      const raw = new TextEncoder().encode('test')
      const subtleSpy = vi
        .spyOn(globalThis.crypto, 'subtle', 'get')
        .mockReturnValue(undefined as unknown as SubtleCrypto)
      try {
        const res = await computeSha256(raw)
        expect(res).toBeNull()
      } finally {
        subtleSpy.mockRestore()
      }
    })

    it('normalizes valid 64-char hex strings and 32-byte arrays', () => {
      const hex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
      expect(normalizeHash(hex)).toBe(hex)
      expect(normalizeHash(`0x${hex.toUpperCase()}`)).toBe(hex)

      const bytes = new Uint8Array(32).fill(0xab)
      expect(normalizeHash(bytes)).toBe('ab'.repeat(32))
      expect(normalizeHash(Array.from(bytes))).toBe('ab'.repeat(32))

      expect(normalizeHash('')).toBeNull()
      expect(normalizeHash(undefined)).toBeNull()
      expect(normalizeHash(null)).toBeNull()
      expect(normalizeHash('invalid-hex')).toBeNull()
      expect(normalizeHash('1234')).toBeNull()
      expect(normalizeHash(new Uint8Array(16))).toBeNull()
    })
  })

  describe('fail-closed metadata verification (fetchProjectWithDetails)', () => {
    const TEST_CONTRACT_ID = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'

    const validMetadata = {
      location: 'Ouarzazate, Morocco',
      type: 'Solar' as const,
      story: 'Verified solar farm project.',
    }
    const validBytes = new TextEncoder().encode(JSON.stringify(validMetadata))

    const baseRawProject: OnChainProjectRaw = {
      owner: 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX',
      uri: 'https://metadata.example.com/project-1.json',
      metadata_hash: '',
      credit_quality: 92,
      green_impact: 95,
      maturity_date: 0,
      certification_status: 0,
      last_update_timestamp: 1_700_000_000,
      status: 1,
      created_at: 1_600_000_000,
    }

    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_REGISTRY_CONTRACT_ID', TEST_CONTRACT_ID)
      expect(isRegistryConfigured()).toBe(true)
    })

    it('returns "verified" when SHA-256 of fetched raw bytes matches on-chain hash', async () => {
      const matchingHash = (await computeSha256(validBytes))!
      expect(matchingHash).toBeDefined()

      const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
        if (method === 'get_project') {
          return { ...baseRawProject, metadata_hash: matchingHash }
        }
        if (method === 'get_score_history') {
          return []
        }
        return null
      })
      setSimulateRegistryCall(mockSimulate)

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => validBytes.buffer,
      })
      vi.stubGlobal('fetch', mockFetch)

      const res = await fetchProjectWithDetails(1)
      expect(res).not.toBeNull()
      expect(res?.verifiedMetadata).toBe('verified')
      expect(res?.project.location).toBe('Ouarzazate, Morocco')
      expect(mockSimulate).not.toHaveBeenCalledWith(
        'verify_metadata_hash',
        expect.anything(),
        expect.anything(),
      )
    })

    it('returns "verified" when on-chain hash is a 32-byte Uint8Array that matches', async () => {
      const matchingHash = (await computeSha256(validBytes))!
      const bytesArray = new Uint8Array(
        matchingHash.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
      )

      const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
        if (method === 'get_project') {
          return { ...baseRawProject, metadata_hash: bytesArray }
        }
        if (method === 'get_score_history') {
          return []
        }
        return null
      })
      setSimulateRegistryCall(mockSimulate)

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => validBytes.buffer,
      })
      vi.stubGlobal('fetch', mockFetch)

      const res = await fetchProjectWithDetails(1)
      expect(res).not.toBeNull()
      expect(res?.verifiedMetadata).toBe('verified')
    })

    it('returns "mismatch" when computed hash differs from on-chain hash', async () => {
      const mismatchHash = 'f'.repeat(64)

      const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
        if (method === 'get_project') {
          return { ...baseRawProject, metadata_hash: mismatchHash }
        }
        if (method === 'get_score_history') {
          return []
        }
        return null
      })
      setSimulateRegistryCall(mockSimulate)

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => validBytes.buffer,
      })
      vi.stubGlobal('fetch', mockFetch)

      const res = await fetchProjectWithDetails(1)
      expect(res).not.toBeNull()
      expect(res?.verifiedMetadata).toBe('mismatch')
      expect(mockSimulate).not.toHaveBeenCalledWith(
        'verify_metadata_hash',
        expect.anything(),
        expect.anything(),
      )
    })

    it('returns "unverified" on fetch failure (network error)', async () => {
      const matchingHash = (await computeSha256(validBytes))!

      const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
        if (method === 'get_project') {
          return { ...baseRawProject, metadata_hash: matchingHash }
        }
        return []
      })
      setSimulateRegistryCall(mockSimulate)

      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error or connection refused'))
      vi.stubGlobal('fetch', mockFetch)

      const res = await fetchProjectWithDetails(1)
      expect(res).not.toBeNull()
      expect(res?.verifiedMetadata).toBe('unverified')
      expect(mockSimulate).not.toHaveBeenCalledWith(
        'verify_metadata_hash',
        expect.anything(),
        expect.anything(),
      )
    })

    it('returns "unverified" on fetch failure (HTTP 404 or 500 status)', async () => {
      const matchingHash = (await computeSha256(validBytes))!

      const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
        if (method === 'get_project') {
          return { ...baseRawProject, metadata_hash: matchingHash }
        }
        return []
      })
      setSimulateRegistryCall(mockSimulate)

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        arrayBuffer: async () => new ArrayBuffer(0),
      })
      vi.stubGlobal('fetch', mockFetch)

      const res = await fetchProjectWithDetails(1)
      expect(res).not.toBeNull()
      expect(res?.verifiedMetadata).toBe('unverified')
      expect(mockSimulate).not.toHaveBeenCalledWith(
        'verify_metadata_hash',
        expect.anything(),
        expect.anything(),
      )
    })

    it('returns "unverified" when on-chain metadata_hash is missing or empty', async () => {
      const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
        if (method === 'get_project') {
          return { ...baseRawProject, metadata_hash: undefined }
        }
        return []
      })
      setSimulateRegistryCall(mockSimulate)

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => validBytes.buffer,
      })
      vi.stubGlobal('fetch', mockFetch)

      const res = await fetchProjectWithDetails(1)
      expect(res).not.toBeNull()
      expect(res?.verifiedMetadata).toBe('unverified')
      expect(mockSimulate).not.toHaveBeenCalledWith(
        'verify_metadata_hash',
        expect.anything(),
        expect.anything(),
      )
    })

    it('returns "unverified" when the metadata uri is missing', async () => {
      const matchingHash = (await computeSha256(validBytes))!

      const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
        if (method === 'get_project') {
          return { ...baseRawProject, uri: '', metadata_hash: matchingHash }
        }
        return []
      })
      setSimulateRegistryCall(mockSimulate)

      const mockFetch = vi.fn()
      vi.stubGlobal('fetch', mockFetch)

      const res = await fetchProjectWithDetails(1)
      expect(res).not.toBeNull()
      expect(res?.verifiedMetadata).toBe('unverified')
      expect(mockFetch).not.toHaveBeenCalled()
      expect(mockSimulate).not.toHaveBeenCalledWith(
        'verify_metadata_hash',
        expect.anything(),
        expect.anything(),
      )
    })

    it('returns "unverified" when crypto.subtle is unavailable', async () => {
      const matchingHash = (await computeSha256(validBytes))!

      const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
        if (method === 'get_project') {
          return { ...baseRawProject, metadata_hash: matchingHash }
        }
        return []
      })
      setSimulateRegistryCall(mockSimulate)

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => validBytes.buffer,
      })
      vi.stubGlobal('fetch', mockFetch)

      const subtleSpy = vi
        .spyOn(globalThis.crypto, 'subtle', 'get')
        .mockReturnValue(undefined as unknown as SubtleCrypto)
      try {
        const res = await fetchProjectWithDetails(1)
        expect(res).not.toBeNull()
        expect(res?.verifiedMetadata).toBe('unverified')
        expect(mockSimulate).not.toHaveBeenCalledWith(
          'verify_metadata_hash',
          expect.anything(),
          expect.anything(),
        )
      } finally {
        subtleSpy.mockRestore()
      }
    })

    it('returns "unverified" on parse failure with a matching hash (fail closed)', async () => {
      const corruptBytes = new TextEncoder().encode('{ invalid json payload: ')
      const matchingHash = (await computeSha256(corruptBytes))!

      const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
        if (method === 'get_project') {
          return { ...baseRawProject, metadata_hash: matchingHash }
        }
        return []
      })
      setSimulateRegistryCall(mockSimulate)

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => corruptBytes.buffer,
      })
      vi.stubGlobal('fetch', mockFetch)

      const res = await fetchProjectWithDetails(1)
      expect(res).not.toBeNull()
      expect(res?.verifiedMetadata).toBe('unverified')
      expect(mockSimulate).not.toHaveBeenCalledWith(
        'verify_metadata_hash',
        expect.anything(),
        expect.anything(),
      )
    })

    it('returns "mismatch" on parse failure with a non-matching hash', async () => {
      const corruptBytes = new TextEncoder().encode('{ invalid json payload: ')
      const storedMismatchHash = 'a'.repeat(64)

      const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
        if (method === 'get_project') {
          return { ...baseRawProject, metadata_hash: storedMismatchHash }
        }
        return []
      })
      setSimulateRegistryCall(mockSimulate)

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => corruptBytes.buffer,
      })
      vi.stubGlobal('fetch', mockFetch)

      const res = await fetchProjectWithDetails(1)
      expect(res).not.toBeNull()
      expect(res?.verifiedMetadata).toBe('mismatch')
      expect(mockSimulate).not.toHaveBeenCalledWith(
        'verify_metadata_hash',
        expect.anything(),
        expect.anything(),
      )
    })

    it('returns "unverified" on registry RPC error with fallback fixture', async () => {
      const mockSimulate = vi.fn().mockRejectedValue(new Error('RPC connection timeout'))
      setSimulateRegistryCall(mockSimulate)

      const res = await fetchProjectWithDetails(1)
      expect(res).not.toBeNull()
      expect(res?.verifiedMetadata).toBe('unverified')
    })

    it('never calls verify_metadata_hash with stored on-chain hash when metadata fetch fails', async () => {
      const storedOnChainHash = 'e1e2e3e4'.repeat(16)

      const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
        if (method === 'get_project') {
          return { ...baseRawProject, metadata_hash: storedOnChainHash }
        }
        return null
      })
      setSimulateRegistryCall(mockSimulate)

      const mockFetch = vi.fn().mockRejectedValue(new Error('Host 503 Service Unavailable'))
      vi.stubGlobal('fetch', mockFetch)

      const res = await fetchProjectWithDetails(1)
      expect(res).not.toBeNull()
      expect(res?.verifiedMetadata).toBe('unverified')

      // Ensure verify_metadata_hash is NEVER called, especially with storedOnChainHash
      const verifyCalls = mockSimulate.mock.calls.filter(
        (call: unknown[]) => call[0] === 'verify_metadata_hash',
      )
      expect(verifyCalls).toHaveLength(0)
      expect(mockSimulate).not.toHaveBeenCalledWith(
        'verify_metadata_hash',
        [1, storedOnChainHash],
        expect.anything(),
      )
    })

    describe('URI allowlist and unsafe scheme blocking (#832)', () => {
      it('never fetches http:, data:, file:, or javascript: URIs', async () => {
        const matchingHash = (await computeSha256(validBytes))!
        const unsafeUris = [
          'http://malicious.example.com/metadata.json',
          'data:application/json;base64,eyJuYW1lIjoiZXZpbCJ9',
          'file:///etc/passwd',
          'javascript:alert(1)',
          'ftp://files.example.com/meta.json',
        ]

        for (const uri of unsafeUris) {
          clearRegistryCache()
          const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
            if (method === 'get_project') {
              return { ...baseRawProject, uri, metadata_hash: matchingHash }
            }
            return []
          })
          setSimulateRegistryCall(mockSimulate)

          const mockFetch = vi.fn()
          vi.stubGlobal('fetch', mockFetch)

          const res = await fetchProjectWithDetails(1)
          expect(res).not.toBeNull()
          expect(res?.verifiedMetadata).toBe('unverified')
          expect(mockFetch).not.toHaveBeenCalled()
        }
      })

      it('resolves ipfs:// and ipfs: URIs via HTTPS gateway and fetches securely', async () => {
        const matchingHash = (await computeSha256(validBytes))!
        const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
          if (method === 'get_project') {
            return {
              ...baseRawProject,
              uri: 'ipfs://bafybeic56projectmetadata/project.json',
              metadata_hash: matchingHash,
            }
          }
          return []
        })
        setSimulateRegistryCall(mockSimulate)

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          arrayBuffer: async () => validBytes.buffer,
        })
        vi.stubGlobal('fetch', mockFetch)

        const res = await fetchProjectWithDetails(1)
        expect(res).not.toBeNull()
        expect(res?.verifiedMetadata).toBe('verified')
        expect(mockFetch).toHaveBeenCalledWith(
          'https://ipfs.io/ipfs/bafybeic56projectmetadata/project.json',
        )
      })

      it('resolveMetadataUri helper rejects unsafe protocols and path traversal', () => {
        expect(resolveMetadataUri('http://example.com')).toBeNull()
        expect(resolveMetadataUri('data:application/json,{}')).toBeNull()
        expect(resolveMetadataUri('file:///etc/hosts')).toBeNull()
        expect(resolveMetadataUri('javascript:void(0)')).toBeNull()
        expect(resolveMetadataUri('ipfs://../escape')).toBeNull()
        expect(resolveMetadataUri('')).toBeNull()
        expect(resolveMetadataUri(null)).toBeNull()
        expect(resolveMetadataUri('https://example.com/meta.json')).toBe(
          'https://example.com/meta.json',
        )
      })
    })

    describe('Metadata schema validation & dropping invalid fields (#832)', () => {
      it('drops string fundingGoal and non-array priceHistory', async () => {
        const malformedFields = {
          name: 'Real Solar Farm',
          location: 'Nevada, USA',
          type: 'Solar' as const,
          fundingGoal: '5000000', // string instead of number
          priceHistory: 'not-an-array', // non-array
        }
        const malformedBytes = new TextEncoder().encode(JSON.stringify(malformedFields))
        const matchingHash = (await computeSha256(malformedBytes))!

        const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
          if (method === 'get_project') {
            return { ...baseRawProject, metadata_hash: matchingHash }
          }
          return []
        })
        setSimulateRegistryCall(mockSimulate)

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          arrayBuffer: async () => malformedBytes.buffer,
        })
        vi.stubGlobal('fetch', mockFetch)

        const res = await fetchProjectWithDetails(1)
        expect(res).not.toBeNull()
        expect(res?.verifiedMetadata).toBe('verified')
        // Valid fields are retained
        expect(res?.project.name).toBe('Real Solar Farm')
        expect(res?.project.location).toBe('Nevada, USA')
        // Invalid string fundingGoal was dropped, falling back to typed number default 1000000
        expect(res?.project.fundingGoal).toBe(1000000)
        expect(typeof res?.project.fundingGoal).toBe('number')
        // Invalid non-array priceHistory was dropped to empty array
        expect(res?.project.priceHistory).toEqual([])
      })

      it('validateOffChainMetadata helper drops invalid types and keeps valid ones', () => {
        const validated = validateOffChainMetadata({
          name: 'Wind Project',
          fundingGoal: '100000', // string
          priceHistory: { invalid: true }, // object
          type: 'Wind',
          description: 'A clean wind project',
        })
        expect(validated).not.toBeNull()
        expect(validated?.name).toBe('Wind Project')
        expect(validated?.type).toBe('Wind')
        expect(validated?.description).toBe('A clean wind project')
        expect(validated?.fundingGoal).toBeUndefined()
        expect(validated?.priceHistory).toBeUndefined()

        // Root non-object returns null
        expect(validateOffChainMetadata('string')).toBeNull()
        expect(validateOffChainMetadata(123)).toBeNull()
        expect(validateOffChainMetadata(null)).toBeNull()
        expect(validateOffChainMetadata([])).toBeNull()
      })

      it('ignores oversized body exceeding MAX_METADATA_SIZE_BYTES with unverified result', async () => {
        const oversizedBytes = new Uint8Array(MAX_METADATA_SIZE_BYTES + 10)
        const matchingHash = (await computeSha256(oversizedBytes))!

        const mockSimulate = vi.fn().mockImplementation(async (method: string) => {
          if (method === 'get_project') {
            return { ...baseRawProject, metadata_hash: matchingHash }
          }
          return []
        })
        setSimulateRegistryCall(mockSimulate)

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: {
            get: (h: string) =>
              h.toLowerCase() === 'content-length' ? String(oversizedBytes.byteLength) : null,
          },
          arrayBuffer: async () => oversizedBytes.buffer,
        })
        vi.stubGlobal('fetch', mockFetch)

        const res = await fetchProjectWithDetails(1)
        expect(res).not.toBeNull()
        expect(res?.verifiedMetadata).toBe('unverified')
      })
    })

    describe('Registry simulation and fetch timeouts (#832)', () => {
      it('times out when simulation hangs', async () => {
        const hangingPromise = new Promise((resolve) => setTimeout(resolve, 500))
        await expect(withSimulationTimeout(hangingPromise, 50)).rejects.toThrow(
          'Registry simulation timed out',
        )
      })

      it('times out when metadata fetch hangs', async () => {
        const hangingFetch = new Promise((resolve) => setTimeout(resolve, 500))
        await expect(withFetchTimeout(hangingFetch, 50)).rejects.toThrow('Metadata fetch timed out')
      })
    })

    describe('No fixture merging into on-chain projects (#832)', () => {
      it('does not inherit fixture 1 data (name, fundedAmount, location) for on-chain project 1', () => {
        const rawOnChain: OnChainProjectRaw = {
          owner: 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX',
          uri: 'https://metadata.example.com/p1.json',
          metadata_hash: '',
          credit_quality: 85,
          green_impact: 88,
          maturity_date: 0,
          certification_status: 0,
          last_update_timestamp: 1_700_000_000,
          status: 1,
          created_at: 1_600_000_000,
        }

        const mapped = mapOnChainProject(rawOnChain, 1)
        expect(mapped.id).toBe(1)
        expect(mapped.name).toBe('Bond Project #1')
        expect(mapped.location).toBe('Stellar Network')
        expect(mapped.fundedAmount).toBe(0)
        expect(mapped.funded).toBe('$0')
        expect(mapped.fundingGoal).toBe(1000000)
        expect(mapped.priceHistory).toEqual([])
      })
    })

    describe('No fixture fallback on mainnet (#832)', () => {
      beforeEach(() => {
        vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'public')
      })

      it('throws on RPC error during fetchTotalProjects on mainnet', async () => {
        const mockSimulate = vi.fn().mockRejectedValue(new Error('Mainnet RPC simulation error'))
        setSimulateRegistryCall(mockSimulate)

        await expect(fetchTotalProjects()).rejects.toThrow('Mainnet RPC simulation error')
      })

      it('throws on RPC error during fetchProjectsPage on mainnet', async () => {
        const mockSimulate = vi.fn().mockRejectedValue(new Error('Mainnet RPC simulation error'))
        setSimulateRegistryCall(mockSimulate)

        await expect(fetchProjectsPage(0, 10)).rejects.toThrow('Mainnet RPC simulation error')
      })

      it('throws on RPC error during fetchProjectWithDetails on mainnet', async () => {
        const mockSimulate = vi.fn().mockRejectedValue(new Error('Mainnet RPC simulation error'))
        setSimulateRegistryCall(mockSimulate)

        await expect(fetchProjectWithDetails(1)).rejects.toThrow('Mainnet RPC simulation error')
      })

      it('throws on RPC error during fetchScoreHistory on mainnet', async () => {
        const mockSimulate = vi.fn().mockRejectedValue(new Error('Mainnet RPC simulation error'))
        setSimulateRegistryCall(mockSimulate)

        await expect(fetchScoreHistory(1)).rejects.toThrow('Mainnet RPC simulation error')
      })
    })
  })
})
