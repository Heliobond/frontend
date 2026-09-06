// Heliobond — flat state selectors (the only sanctioned read API for app state).
//
// ISSUE: "Accessing state requires 5 levels of drilling. Flatten selectors."
// The app state lives in one nested singleton (`HB_DATA` in `src/data.ts`) plus
// the nested `PROJECT_DETAILS` map (`src/data/projectDetails.ts`). Consumers
// used to reach straight through the nested shape, e.g.
//   `d.you.deltaAbs.toLocaleString(...)`          (Portfolio)
//   `detail.scoreHistory.credit.map(...)`         (ProjectDetail)
//   `HB_DATA.pool.totalAssets - HB_DATA.pool.liquid` (data/admin)
// coupling every screen to up to five levels of nested structure.
//
// Every selector here is flat by contract: call it, destructure plain
// scalars/arrays — one level, never more. Consumers must not chain properties
// past a selector result. Derived values (e.g. `deployed`) are computed here so
// no consumer re-derives them from nested branches.

import { HB_DATA, type Activity, type Project } from '../data'
import {
  PROJECT_DETAILS,
  type FundingEvent,
  type PricePoint,
  type ProjectDetail,
  type ScorePoint,
} from '../data/projectDetails'

/** Flat pool accounting — the `HB_DATA.pool` branch, one level deep. */
export interface PoolSummary {
  /** USDC value of all assets the vault controls. */
  totalAssets: number
  /** total assets ÷ HBS supply. */
  sharePrice: number
  /** Projected annual rate, as a percentage. */
  projectedRate: number
  /** USDC idle in the vault, available to honour withdrawals. */
  liquid: number
  /** Count of projects with capital deployed. */
  projectsFunded: number
  /** Derived: totalAssets − liquid (capital working in funded projects). */
  deployed: number
}

/** Flat hero counters — the `HB_DATA.counters` branch, one level deep. */
export interface CountersSummary {
  totalAssets: string
  projectsFunded: string
  projectedRate: string
}

/** Flat investor position — the `HB_DATA.you` branch, one level deep. */
export interface YouSummary {
  value: number
  deltaAbs: number
  deltaPct: number
  hbs: number
  poolSharePct: number
  weightedGreen: number
  backed: number
  riskScore: number
  riskLevel: 'conservative' | 'moderate' | 'aggressive'
  referralLink?: string
}

/** Flat creator attribution — the `detail.creator` branch, one level deep. */
export interface CreatorSummary {
  name: string
  verified: boolean
  /** Year the creator was verified, e.g. '2025'. */
  since: string
}

/** Flat oracle score history — the `detail.scoreHistory` branch, one level deep. */
export interface ScoreHistory {
  credit: ScorePoint[]
  green: ScorePoint[]
}

/** Flat numeric score series — exactly what sparklines plot. */
export interface ScoreValueHistory {
  credit: number[]
  green: number[]
}

// —— Pool / vault accounting ———————————————————————————————————————————————

/** Current total vault assets (USDC), flat. */
export const selectTotalAssets = (): number => HB_DATA.pool.totalAssets

/** Current share price (USDC per HBS), flat. */
export const selectSharePrice = (): number => HB_DATA.pool.sharePrice

/** Projected annual rate (%), flat. */
export const selectProjectedRate = (): number => HB_DATA.pool.projectedRate

/** Liquid USDC available in the vault, flat. */
export const selectLiquid = (): number => HB_DATA.pool.liquid

/** Count of funded projects, flat. */
export const selectProjectsFunded = (): number => HB_DATA.pool.projectsFunded

/** One flat object with every pool figure, plus the derived `deployed`. */
export function selectPoolSummary(): PoolSummary {
  const { totalAssets, sharePrice, projectedRate, liquid, projectsFunded } = HB_DATA.pool
  return {
    totalAssets,
    sharePrice,
    projectedRate,
    liquid,
    projectsFunded,
    deployed: totalAssets - liquid,
  }
}

/** Flat copy of the landing hero counters. */
export function selectCounters(): CountersSummary {
  return { ...HB_DATA.counters }
}

// —— Investor position —————————————————————————————————————————————————————

/** Flat copy of the signed-in investor's position (value, deltas, risk, …). */
export function selectYou(): YouSummary {
  return { ...HB_DATA.you }
}

/** The investor's activity feed (deposits, withdrawals, score updates). */
export const selectActivity = (): Activity[] => HB_DATA.activity

// —— Projects (registry) ———————————————————————————————————————————————————

/** All registered bond projects. */
export const selectProjects = (): Project[] => HB_DATA.projects

/** One project by id, or undefined. */
export const selectProjectById = (id: number): Project | undefined =>
  HB_DATA.projects.find((p) => p.id === id)

/** Store-backed project search (name match). */
export const searchProjects = (query: string): Project[] => HB_DATA.search(query)

// —— Project detail (oracle history, funding, creator) —————————————————————

/** Full detail record for a project id, or undefined. */
export const selectProjectDetail = (id: number): ProjectDetail | undefined => PROJECT_DETAILS[id]

/** Flat `{ credit, green }` oracle histories for a project. */
export function selectScoreHistory(id: number): ScoreHistory {
  const detail = PROJECT_DETAILS[id]
  if (!detail) return { credit: [], green: [] }
  const { credit, green } = detail.scoreHistory
  return { credit, green }
}

/** Flat numeric score series — the `.map((p) => p.value)` done once, here. */
export function selectScoreValueHistory(id: number): ScoreValueHistory {
  const { credit, green } = selectScoreHistory(id)
  return {
    credit: credit.map((p) => p.value),
    green: green.map((p) => p.value),
  }
}

/** Credit-score history points for a project (empty for unknown ids). */
export const selectCreditHistory = (id: number): ScorePoint[] => selectScoreHistory(id).credit

/** Green-score history points for a project (empty for unknown ids). */
export const selectGreenHistory = (id: number): ScorePoint[] => selectScoreHistory(id).green

/** Capital events timeline for a project (empty for unknown ids). */
export const selectFundingTimeline = (id: number): FundingEvent[] =>
  PROJECT_DETAILS[id]?.fundingTimeline ?? []

/** Bond price/yield history for a project (empty for unknown ids). */
export const selectPriceHistory = (id: number): PricePoint[] =>
  PROJECT_DETAILS[id]?.priceHistory ?? []

/** Flat creator attribution for a project (neutral fallback for unknown ids). */
export function selectCreator(id: number): CreatorSummary {
  const creator = PROJECT_DETAILS[id]?.creator
  if (!creator) return { name: 'Unknown creator', verified: false, since: '' }
  return { name: creator.name, verified: creator.verified, since: creator.since }
}
