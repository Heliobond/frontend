// Tests for the flat state selectors (see src/state/selectors.ts).
// Guards the two contracts the refactor relies on:
//   1. values match the underlying store roots exactly, and
//   2. every summary result is FLAT — no nested object values, so consumers
//      never drill more than one level past a selector call.

import { describe, expect, it } from 'vitest'
import { HB_DATA } from '../data'
import { PROJECT_DETAILS } from '../data/projectDetails'
import {
  selectActivity,
  selectCounters,
  selectCreator,
  selectCreditHistory,
  selectFundingTimeline,
  selectGreenHistory,
  selectLiquid,
  selectPoolSummary,
  selectPriceHistory,
  selectProjectById,
  selectProjectDetail,
  selectProjects,
  selectProjectsFunded,
  selectProjectedRate,
  selectScoreHistory,
  selectScoreValueHistory,
  selectSharePrice,
  selectTotalAssets,
  selectYou,
  searchProjects,
} from './selectors'

/** Fails if any value in the object is an object/array (i.e. not flat). */
function expectFlat(obj: object): void {
  for (const [key, value] of Object.entries(obj)) {
    const flat =
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    if (!flat) throw new Error(`selector result is not flat at key "${key}"`)
  }
}

describe('pool (vault accounting) selectors', () => {
  it('expose scalars without drilling into HB_DATA.pool', () => {
    expect(selectTotalAssets()).toBe(HB_DATA.pool.totalAssets)
    expect(selectSharePrice()).toBe(HB_DATA.pool.sharePrice)
    expect(selectProjectedRate()).toBe(HB_DATA.pool.projectedRate)
    expect(selectLiquid()).toBe(HB_DATA.pool.liquid)
    expect(selectProjectsFunded()).toBe(HB_DATA.pool.projectsFunded)
  })

  it('selectPoolSummary returns one flat object with derived deployed capital', () => {
    const pool = selectPoolSummary()
    expectFlat(pool)
    expect(pool.totalAssets).toBe(HB_DATA.pool.totalAssets)
    expect(pool.sharePrice).toBe(HB_DATA.pool.sharePrice)
    expect(pool.liquid).toBe(HB_DATA.pool.liquid)
    expect(pool.deployed).toBe(HB_DATA.pool.totalAssets - HB_DATA.pool.liquid)
  })

  it('selectCounters returns a flat copy, not the nested branch itself', () => {
    const counters = selectCounters()
    expectFlat(counters)
    expect(counters).toEqual(HB_DATA.counters)
    expect(counters).not.toBe(HB_DATA.counters)
  })
})

describe('investor position selectors', () => {
  it('selectYou returns a flat copy of the position', () => {
    const you = selectYou()
    expectFlat(you)
    expect(you.value).toBe(HB_DATA.you.value)
    expect(you.deltaAbs).toBe(HB_DATA.you.deltaAbs)
    expect(you.riskScore).toBe(HB_DATA.you.riskScore)
    expect(you.riskLevel).toBe(HB_DATA.you.riskLevel)
    expect(you).not.toBe(HB_DATA.you)
  })

  it('selectActivity exposes the activity feed one level deep', () => {
    expect(selectActivity()).toEqual(HB_DATA.activity)
  })
})

describe('project (registry) selectors', () => {
  it('selectProjects exposes the registry list', () => {
    expect(selectProjects()).toEqual(HB_DATA.projects)
  })

  it('selectProjectById finds a project by id and undefined for unknown ids', () => {
    expect(selectProjectById(1)?.id).toBe(1)
    expect(selectProjectById(9999)).toBeUndefined()
  })

  it('searchProjects delegates to the store search', () => {
    const query = HB_DATA.projects[0].name.split(' ')[0]
    expect(searchProjects(query).length).toBeGreaterThan(0)
  })
})

describe('project-detail selectors (the former 5-level drills)', () => {
  it('selectScoreHistory flattens detail.scoreHistory to one level', () => {
    const detail = PROJECT_DETAILS[1]
    expect(selectScoreHistory(1).credit).toEqual(detail.scoreHistory.credit)
    expect(selectScoreHistory(1).green).toEqual(detail.scoreHistory.green)
  })

  it('selectScoreValueHistory returns plain number series — no .map drilling in UI', () => {
    const { credit, green } = selectScoreValueHistory(1)
    expect(credit.every((v) => typeof v === 'number')).toBe(true)
    expect(credit).toEqual(PROJECT_DETAILS[1].scoreHistory.credit.map((p) => p.value))
    expect(green).toEqual(PROJECT_DETAILS[1].scoreHistory.green.map((p) => p.value))
  })

  it('selectCreditHistory / selectGreenHistory expose single series', () => {
    expect(selectCreditHistory(1)).toEqual(PROJECT_DETAILS[1].scoreHistory.credit)
    expect(selectGreenHistory(1)).toEqual(PROJECT_DETAILS[1].scoreHistory.green)
  })

  it('selectFundingTimeline / selectPriceHistory expose flat arrays', () => {
    expect(selectFundingTimeline(1)).toEqual(PROJECT_DETAILS[1].fundingTimeline)
    expect(selectPriceHistory(1)).toEqual(PROJECT_DETAILS[1].priceHistory)
  })

  it('selectCreator flattens detail.creator to one level', () => {
    const creator = selectCreator(1)
    expectFlat(creator)
    expect(creator).toEqual({
      name: PROJECT_DETAILS[1].creator.name,
      verified: PROJECT_DETAILS[1].creator.verified,
      since: PROJECT_DETAILS[1].creator.since,
    })
  })

  it('return safe empties for unknown ids instead of throwing', () => {
    expect(selectProjectDetail(4242)).toBeUndefined()
    expect(selectScoreHistory(4242)).toEqual({ credit: [], green: [] })
    expect(selectScoreValueHistory(4242)).toEqual({ credit: [], green: [] })
    expect(selectCreditHistory(4242)).toEqual([])
    expect(selectGreenHistory(4242)).toEqual([])
    expect(selectFundingTimeline(4242)).toEqual([])
    expect(selectPriceHistory(4242)).toEqual([])
    expect(selectCreator(4242)).toEqual({ name: 'Unknown creator', verified: false, since: '' })
  })
})
