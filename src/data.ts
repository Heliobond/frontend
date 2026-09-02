// Heliobond — fake data for the click-through. Not production: these stand in
 // for live reads from the InvestmentVault + ProjectRegistry Soroban contracts.

export type ProjectType = 'Solar' | 'Wind' | 'Hydro'

/**
 * Whether a project ("bond", in investor-facing copy) is currently open for
 * funding from the pool. Used by the watchlist to tell people which of their
 * saved bonds they can act on now. `upcoming` = not yet available;
 * `funded` = fully funded, no further capacity.
 */
type BondStatus = 'open' | 'upcoming' | 'funded'

export interface PricePoint {
  date: string
  /** Price as percentage of par, e.g. 102.5 */
  price: number
  /** Yield to maturity, as a percentage, e.g. 6.8 */
  yield: number
}

export interface Project {
  id: number
  name: string
  location: string
  type: ProjectType
  /** Credit Quality, oracle-verified, 0–100. */
  credit: number
  /** Green Impact, oracle-verified, 0–100. */
  green: number
  /** Capital deployed to this project from the pool (display string). */
  funded: string
  /** Capital deployed, as a number. */
  fundedAmount: number
  /** Stated funding goal. */
  fundingGoal: number
  /**
   * Funding availability. Optional so remote API rows without it stay valid;
   * `getBondStatus()` in `src/lib/watchlist.ts` derives a fallback from the
   * funding numbers.
   */
  status?: BondStatus
  /** Historical price/yield points for trend charts */
  priceHistory: PricePoint[]
}

export interface Activity {
  kind: 'Deposit' | 'Withdrawal' | 'Score update'
  amount: string
  shares: string
  when: string
  hash: string
}

export function formatCurrency(n: number): string {
  return '$' + Math.floor(n).toLocaleString('en-US')
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export function formatFixed(n: number, digits: number = 1): string {
  return n.toFixed(digits)
}

export interface HeliobondData {
  pool: {
    totalAssets: number
    sharePrice: number
    projectedRate: number
    liquid: number
    projectsFunded: number
  }
  counters: {
    totalAssets: string
    projectsFunded: string
    projectedRate: string
  }
  you: {
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
  projects: Project[]
  activity: Activity[]
  search: (query: string) => Project[]
}

const INITIAL_PROJECTS: Project[] = [
  {
    id: 1,
    name: 'Sokoto community solar',
    location: 'Sokoto, Nigeria',
    type: 'Solar',
    credit:82,
    green: 91,
    funded: '$420,000',
    fundedAmount: 420000,
    fundingGoal: 600000,
    status: 'open',
    priceHistory: [
      { date: '2024-09-15', price: 98.5, yield: 8.0 },
      { date: '2024-10-15', price: 99.1, yield: 7.9 },
      { date: '2024-11-15', price: 99.8, yield: 7.7 },
      { date: '2024-12-15', price: 100.4, yield: 7.5 },
      { date: '2025-01-15', price: 101.2, yield: 7.3 },
      { date: '2025-02-15', price: 102.0, yield: 7.2 },
    ],
  },
  {
    id: 2,
    name: 'Ría de Vigo tidal array',
    location: 'Galicia, Spain',
    type: 'Hydro',
    credit:74,
    green: 88,
    funded: '$1,180,000',
    fundedAmount: 1180000,
    fundingGoal: 1500000,
    status: 'upcoming',
    priceHistory: [
      { date: '2024-09-15', price: 100.2, yield: 6.6 },
      { date: '2024-10-15', price: 101.0, yield: 6.5 },
      { date: '2024-11-15', price: 101.8, yield: 6.3 },
      { date: '2024-12-15', price: 102.5, yield: 6.2 },
      { date: '2025-01-15', price: 103.3, yield: 6.0 },
      { date: '2025-02-15', price: 104.0, yield: 5.9 },
    ],
  },
  {
    id: 3,
    name: 'Atacama agrivoltaics',
    location: 'Antofagasta, Chile',
    type: 'Solar',
    credit:88,
    green: 79,
    funded: '$640,000',
    fundedAmount: 640000,
    fundingGoal: 800000,
    status: 'open',
    priceHistory: [
      { date: '2024-09-15', price: 96.8, yield: 8.4 },
      { date: '2024-10-15', price: 97.6, yield: 8.2 },
      { date: '2024-11-15', price: 98.5, yield: 8.0 },
      { date: '2024-12-15', price: 99.3, yield: 7.8 },
      { date: '2025-01-15', price: 100.2, yield: 7.6 },
      { date: '2025-02-15', price: 101.0, yield: 7.5 },
    ],
  },
  {
    id: 4,
    name: 'Jämtland wind co-op',
    location: 'Östersund, Sweden',
    type: 'Wind',
    credit:91,
    green: 84,
    funded: '$960,000',
    fundedAmount: 960000,
    fundingGoal: 1200000,
    status: 'open',
    priceHistory: [
      { date: '2024-09-15', price: 100.8, yield: 5.9 },
      { date: '2024-10-15', price: 101.6, yield: 5.8 },
      { date: '2024-11-15', price: 102.5, yield: 5.7 },
      { date: '2024-12-15', price: 103.4, yield: 5.5 },
      { date: '2025-01-15', price: 104.2, yield: 5.4 },
      { date: '2025-02-15', price: 105.0, yield: 5.2 },
    ],
  },
  {
    id: 5,
    name: 'Kerala micro-hydro',
    location: 'Idukki, India',
    type: 'Hydro',
    credit:69,
    green: 93,
    funded: '$310,000',
    fundedAmount: 310000,
    fundingGoal: 400000,
    status: 'upcoming',
    priceHistory: [
      { date: '2024-09-15', price: 93.5, yield: 9.6 },
      { date: '2024-10-15', price: 94.3, yield: 9.4 },
      { date: '2024-11-15', price: 95.0, yield: 9.3 },
      { date: '2024-12-15', price: 95.8, yield: 9.1 },
      { date: '2025-01-15', price: 96.6, yield: 9.0 },
      { date: '2025-02-15', price: 97.4, yield: 8.8 },
    ],
  },
  {
    id: 6,
    name: 'Oaxaca roottop network',
    location: 'Oaxaca, Mexico',
    type: 'Solar',
    credit:77,
    green: 86,
    funded: '$520,000',
    fundedAmount: 520000,
    fundingGoal: 700000,
    status: 'open',
    priceHistory: [
      { date: '2024-09-15', price: 99.0, yield: 7.6 },
      { date: '2024-10-15', price: 99.8, yield: 7.4 },
      { date: '2024-11-15', price: 100.5, yield: 7.2 },
      { date: '2024-12-15', price: 101.3, yield: 7.0 },
      { date: '2025-01-15', price: 102.1, yield: 6.9 },
      { date: '2025-02-15', price: 103.0, yield: 6.8 },
    ],
  },
]

// The pool has 14 funded projects in total: 6 active demo projects in the local registry,
// plus 8 historical or off-screen projects funded in the past.
export const OFF_SCREEN_PROJECTS_COUNT = 8

const INITIAL_FUNDED_COUNT = INITIAL_PROJECTS.filter((p) => {
  const n = Number(p.funded.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0
}).length

// Helper to derive the portfolio risk indicator from the bond mix.
// Credit scores are 0–100; higher credit = lower risk.
// The risk score is inverted so a higher number means higher risk, and the
// risk level is determined by the share of holdings in each credit band.
function getRiskIndicator(projects: Project[]): { riskScore: number; riskLevel: 'conservative' | 'moderate' | 'aggressive' } {
  const totalFunded = projects.reduce((sum, p) => sum + p.fundedAmount, 0)
  if (totalFunded === 0) {
    return { riskScore: 0, riskLevel: 'conservative' }
  }

  const weightedCredit = projects.reduce((sum, p) => sum + p.credit * p.fundedAmount, 0) / totalFunded
  const riskScore = Math.round((100 - weightedCredit) * 10) / 10

  // Determine the mix of holdings by rating class.
  let highGradeShare = 0 // credit >= 80
  let lowGradeShare = 0 // credit < 70

  for (const p of projects) {
    if (p.fundedAmount <= 0) continue
    const share = p.fundedAmount / totalFunded
    if (p.credit >= 80) highGradeShare += share
    else if (p.credit < 70) lowGradeShare += share
  }

  let riskLevel: 'conservative' | 'moderate' | 'aggressive'
  if (lowGradeShare > 0.2 || highGradeShare < 0.5) {
    riskLevel = 'aggressive'
  } else if (highGradeShare >= 0.7 && lowGradeShare <= 0.1) {
    riskLevel = 'conservative'
  } else {
    riskLevel = 'moderate'
  }

  return { riskScore, riskLevel }
}

const PROJECTS_FUNDED = INITIAL_PROJECTS.length + OFF_SCREEN_PROJECTS_COUNT

// Helper to derive the portfolio risk indicator from the bond mix.
// Credit scores are 0–100; higher credit = lower risk.
// The risk score is inverted so a higher number means higher risk, and the
// risk level is determined by the share of holdings in each credit band.
function getRiskIndicator(projects: Project[]): { riskScore: number; riskLevel: 'conservative' | 'moderate' | 'aggressive' } {
  const totalFunded = projects.reduce((sum, p) => sum + p.fundedAmount, 0)
  if (totalFunded === 0) {
    return { riskScore: 0, riskLevel: 'conservative' }
  }

  const weightedCredit = projects.reduce((sum, p) => sum + p.credit * p.fundedAmount, 0) / totalFunded
  const riskScore = Math.round((100 - weightedCredit) * 10) / 10

  // Determine the mix of holdings by rating class.
  let highGradeShare = 0 // credit >= 80
  let lowGradeShare = 0 // credit < 70

  for (const p of projects) {
    if (p.fundedAmount <= 0) continue
    const share = p.fundedAmount / totalFunded
    if (p.credit >= 80) highGradeShare += share
    else if (p.credit < 70) lowGradeShare += share
  }

  let riskLevel: 'conservative' | 'moderate' | 'aggressive'
  if (lowGradeShare > 0.2 || highGradeShare < 0.5) {
    riskLevel = 'aggressive'
  } else if (highGradeShare >= 0.7 && lowGradeShare <= 0.1) {
    riskLevel = 'conservative'
  } else {
    riskLevel = 'moderate'
  }

  return { riskScore, riskLevel }
}

const { riskScore, riskLevel } = getRiskIndicator(INITIAL_PROJECTS)

const POOL = {
  totalAssets: 4862014.55,
  sharePrice: 1.0058,
  projectedRate: 7.4,
  liquid: 1420300,
  projectsFunded: PROJECTS_FUNDED,
}

const POOL_COUNTERS = formatPoolCounters(POOL)

export const HB_DATA: HeliobondData = {
  pool: POOL,
  counters: POOL_COUNTERS,
  you: {
    value: 24180.45,
    deltaAbs: 612.18,
    deltaPct: 2.6,
    hbs: 24041.231,
    poolSharePct: 0.49,
    weightedGreen: 88,
    backed: PROJECTS_FUNDED,
    riskScore,
    riskLevel,
    referralLink: 'https://heliobond.fi/ref/HB24041',
  },
  projects: INITIAL_PROJECTS,
  activity: [],
  search: (_query: string) => INITIAL_PROJECTS,
}