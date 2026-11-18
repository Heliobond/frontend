import { describe, expect, it } from 'vitest'
import { xdr, scValToNative } from '@stellar/stellar-sdk'
import {
  CreateProjectError,
  buildCreateProjectArgs,
  classifyCreateProjectError,
  computeMetadataHash,
  maturityDateToUnixSeconds,
  metadataHashHex,
  serializeProjectMetadata,
  validateMaturityDate,
  validateMetadataUri,
} from './createProject'

const CREATOR = 'GCOQ4JRRUC7SBUXLKYXFCZPJWTKDFTULI6DOGB75DZNAVGIST3BNC6UX'
const URI = 'ipfs://bafyreiexample/project.json'

const metadataInput = {
  name: '  Arequipa rooftop solar  ',
  location: 'Arequipa, Peru',
  type: 'Solar' as const,
  story: ' A community array. ',
  fundingGoal: 250000,
}

describe('validateMetadataUri', () => {
  it('accepts every allowed scheme', () => {
    expect(validateMetadataUri('ipfs://bafyproject')).toBeNull()
    expect(validateMetadataUri('https://example.com/project.json')).toBeNull()
    expect(validateMetadataUri('ar://txid')).toBeNull()
  })

  it('accepts the 8 and 512 character boundaries', () => {
    expect(validateMetadataUri('ipfs://a')).toBeNull()
    expect(validateMetadataUri(`https://${'a'.repeat(504)}`)).toBeNull()
  })

  it('rejects a URI shorter than 8 characters', () => {
    expect(validateMetadataUri('ipfs://')).toBe('tooShort')
    expect(validateMetadataUri('')).toBe('tooShort')
  })

  it('rejects a URI longer than 512 characters', () => {
    expect(validateMetadataUri(`https://${'a'.repeat(505)}`)).toBe('tooLong')
  })

  it('rejects schemes the contract does not accept', () => {
    expect(validateMetadataUri('http://example.com/project.json')).toBe('invalidScheme')
    expect(validateMetadataUri('ftp://example.com/project.json')).toBe('invalidScheme')
    expect(validateMetadataUri('example.com/project.json')).toBe('invalidScheme')
  })

  it('ignores surrounding whitespace', () => {
    expect(validateMetadataUri('  ipfs://bafyproject  ')).toBeNull()
  })
})

describe('validateMaturityDate', () => {
  const now = 1_800_000_000

  it('treats 0 as open-ended', () => {
    expect(validateMaturityDate(0, now)).toBeNull()
  })

  it('accepts a future date and rejects a past one', () => {
    expect(validateMaturityDate(now + 86_400, now)).toBeNull()
    expect(validateMaturityDate(now - 1, now)).toBe('inPast')
    expect(validateMaturityDate(now, now)).toBe('inPast')
  })

  it('rejects negative and non-integer values', () => {
    expect(validateMaturityDate(-1, now)).toBe('invalid')
    expect(validateMaturityDate(1.5, now)).toBe('invalid')
    expect(validateMaturityDate(Number.NaN, now)).toBe('invalid')
  })

  it('accepts the contract uint64 through a bigint', () => {
    expect(validateMaturityDate(BigInt(now + 1), now)).toBeNull()
    expect(validateMaturityDate(BigInt(now - 1), now)).toBe('inPast')
  })
})

describe('maturityDateToUnixSeconds', () => {
  it('reads a date input as midnight UTC', () => {
    expect(maturityDateToUnixSeconds('2030-01-01')).toBe(Date.UTC(2030, 0, 1) / 1000)
  })

  it('returns null for an empty or impossible date', () => {
    expect(maturityDateToUnixSeconds('')).toBeNull()
    expect(maturityDateToUnixSeconds('01/01/2030')).toBeNull()
    expect(maturityDateToUnixSeconds('2030-02-31')).toBeNull()
  })
})

describe('serializeProjectMetadata', () => {
  it('writes canonical JSON with a fixed key order and trimmed values', () => {
    expect(serializeProjectMetadata(metadataInput)).toBe(
      [
        '{',
        '  "name": "Arequipa rooftop solar",',
        '  "description": "A community array.",',
        '  "location": "Arequipa, Peru",',
        '  "type": "Solar",',
        '  "story": "A community array.",',
        '  "fundingGoal": 250000',
        '}',
      ].join('\n'),
    )
  })

  it('round-trips through JSON.parse', () => {
    expect(JSON.parse(serializeProjectMetadata(metadataInput))).toEqual({
      name: 'Arequipa rooftop solar',
      description: 'A community array.',
      location: 'Arequipa, Peru',
      type: 'Solar',
      story: 'A community array.',
      fundingGoal: 250000,
    })
  })

  it('produces the same bytes regardless of object construction order', () => {
    const reordered = {
      fundingGoal: 250000,
      story: ' A community array. ',
      type: 'Solar' as const,
      location: 'Arequipa, Peru',
      name: '  Arequipa rooftop solar  ',
    }
    expect(serializeProjectMetadata(reordered)).toBe(serializeProjectMetadata(metadataInput))
  })
})

describe('computeMetadataHash', () => {
  it('is the SHA-256 of the exact JSON bytes', async () => {
    const json = serializeProjectMetadata(metadataInput)
    const hash = await computeMetadataHash(json)
    expect(hash).toHaveLength(32)
    expect(metadataHashHex(hash)).toBe(
      '78da59ebb41aa42b46e5ac0eb0d82d932168576d80d3d37b72c6d3968d6b63cb',
    )
  })

  it('changes when any metadata field changes', async () => {
    const base = serializeProjectMetadata(metadataInput)
    const changed = serializeProjectMetadata({ ...metadataInput, fundingGoal: 250001 })
    const [baseHash, changedHash] = await Promise.all([
      computeMetadataHash(base),
      computeMetadataHash(changed),
    ])
    expect(metadataHashHex(baseHash)).not.toBe(metadataHashHex(changedHash))
  })

  it('renders lowercase 64-character hex', async () => {
    const hex = metadataHashHex(await computeMetadataHash('{}'))
    expect(hex).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('buildCreateProjectArgs', () => {
  it('encodes Address, String, u64 and BytesN<32> in contract order', async () => {
    const hash = await computeMetadataHash(serializeProjectMetadata(metadataInput))
    const args = await buildCreateProjectArgs(CREATOR, URI, 1_893_456_000, hash)

    expect(args).toHaveLength(4)
    expect(args.map((arg) => arg.switch().name)).toEqual([
      'scvAddress',
      'scvString',
      'scvU64',
      'scvBytes',
    ])

    expect(scValToNative(args[0])).toBe(CREATOR)
    expect(scValToNative(args[1])).toBe(URI)
    expect(scValToNative(args[2])).toBe(BigInt(1_893_456_000))
    expect(Array.from(scValToNative(args[3]) as Uint8Array)).toEqual(Array.from(hash))
    expect(args[3].bytes()).toHaveLength(32)
    expect(args[3].switch()).toEqual(xdr.ScValType.scvBytes())
  })

  it('rejects a hash that is not 32 bytes', async () => {
    await expect(
      buildCreateProjectArgs(CREATOR, URI, 1_893_456_000, new Uint8Array(31)),
    ).rejects.toThrow()
  })

  it('rejects a maturity date in the past before encoding', async () => {
    const hash = new Uint8Array(32)
    const past = Math.floor(Date.now() / 1000) - 86_400
    await expect(buildCreateProjectArgs(CREATOR, URI, past, hash)).rejects.toMatchObject({
      name: 'CreateProjectError',
      problem: 'maturity',
    })
  })
})

describe('classifyCreateProjectError', () => {
  it.each([
    ['Error(Contract, #1)', 'notWhitelisted'],
    ['Error(Contract, #2)', 'uri'],
    ['Error(Contract, #3)', 'uri'],
    ['Error(Contract, #4)', 'maturity'],
    ['Error(Contract, #29)', 'uri'],
    ['Error(Contract, #35)', 'contract'],
    ['failed to fetch', 'contract'],
  ])('maps %s to %s', (message, problem) => {
    expect(classifyCreateProjectError(message)).toBe(problem)
  })

  it('keeps a CreateProjectError problem and code intact', () => {
    const error = new CreateProjectError('notWhitelisted', 'Error(Contract, #1)', 1)
    expect(classifyCreateProjectError(error)).toBe('notWhitelisted')
    expect(error.code).toBe(1)
  })
})
