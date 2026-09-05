import { describe, it, expect, beforeEach } from 'vitest'
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
