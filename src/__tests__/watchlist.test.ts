import { describe, it, expect, beforeEach } from '@/test/bun'
import {
  readWatchlist,
  writeWatchlist,
  getBondStatus,
  isBondAvailable,
  WATCHLIST_STORAGE_KEY,
} from '@/lib/watchlist'
import type { Project } from '@/data'

const bond = (over: Partial<Project> = {}): Project => ({
  id: 1,
  name: 'Sokoto community solar',
  location: 'Sokoto, Nigeria',
  type: 'Solar',
  credit: 82,
  green: 91,
  funded: '$420,000',
  fundedAmount: 420000,
  fundingGoal: 600000,
  priceHistory: [],
  ...over,
})

describe('watchlist storage', () => {
  beforeEach(() => localStorage.clear())

  it('returns an empty list when nothing is stored', () => {
    expect(readWatchlist()).toEqual([])
  })

  it('round-trips saved ids', () => {
    writeWatchlist([3, 1, 5])
    expect(readWatchlist()).toEqual([3, 1, 5])
    expect(localStorage.getItem(WATCHLIST_STORAGE_KEY)).toBe('[3,1,5]')
  })

  it('ignores malformed or non-numeric stored values', () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, 'not json')
    expect(readWatchlist()).toEqual([])

    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(['1', 2, null, 3]))
    expect(readWatchlist()).toEqual([2, 3])
  })

  it('filters out negative project IDs', () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([-1, 1, -5, 2]))
    expect(readWatchlist()).toEqual([1, 2])
  })

  it('filters out zero project IDs', () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([0, 1, 2]))
    expect(readWatchlist()).toEqual([1, 2])
  })

  it('filters out fractional project IDs', () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([1.5, 2, 3.7, 4]))
    expect(readWatchlist()).toEqual([2, 4])
  })

  it('filters out project IDs exceeding 2^32 - 1', () => {
    const maxValid = 0xffffffff // 2^32 - 1 = 4294967295
    const tooLarge = 0x100000000 // 2^32 = 4294967296
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([1, maxValid, tooLarge, 2]))
    expect(readWatchlist()).toEqual([1, maxValid, 2])
  })

  it('deduplicates project IDs', () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([1, 2, 1, 3, 2, 4]))
    expect(readWatchlist()).toEqual([1, 2, 3, 4])
  })

  it('handles mixed invalid and duplicate IDs', () => {
    localStorage.setItem(
      WATCHLIST_STORAGE_KEY,
      JSON.stringify([-1, 1, 1.5, 2, 0, 2, 3, -5, 3, 0xffffffff, 0x100000000]),
    )
    expect(readWatchlist()).toEqual([1, 2, 3, 0xffffffff])
  })

  it('filters out NaN and Infinity', () => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify([1, NaN, 2, Infinity, 3, -Infinity]))
    expect(readWatchlist()).toEqual([1, 2, 3])
  })
})

describe('getBondStatus / isBondAvailable', () => {
  it('uses an explicit status when present', () => {
    expect(getBondStatus(bond({ status: 'upcoming' }))).toBe('upcoming')
    expect(isBondAvailable(bond({ status: 'open' }))).toBe(true)
    expect(isBondAvailable(bond({ status: 'upcoming' }))).toBe(false)
  })

  it('derives from funding when status is absent', () => {
    expect(getBondStatus(bond({ fundedAmount: 420000, fundingGoal: 600000 }))).toBe('open')
    expect(getBondStatus(bond({ fundedAmount: 600000, fundingGoal: 600000 }))).toBe('funded')
  })
})
