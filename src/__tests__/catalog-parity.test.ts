import { describe, it, expect } from 'vitest'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'

function getLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    const val = obj[key]
    if (typeof val === 'object' && val !== null) {
      keys.push(...getLeafKeys(val as Record<string, unknown>, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

describe('Message catalog parity', () => {
  it('en.json and fr.json have identical key sets', () => {
    const enKeys = getLeafKeys(en).sort()
    const frKeys = getLeafKeys(fr).sort()

    const missingInFr = enKeys.filter((k) => !frKeys.includes(k))
    const missingInEn = frKeys.filter((k) => !enKeys.includes(k))

    const missing = [...missingInFr.map((k) => `Missing in fr.json: ${k}`),
      ...missingInEn.map((k) => `Missing in en.json: ${k}`)]

    expect(missing).toEqual([])
  })
})