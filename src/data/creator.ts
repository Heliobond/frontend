// Heliobond — fake creator-space data for the click-through. Stands in for live
// reads from the ProjectRegistry + WhitelistController + oracle. No Math.random,
// no live calls: stable, typed fixtures so the creator screens render the same
// every time.

export type ApplicationStage = 'submitted' | 'in_review' | 'approved'

export interface DraftProject {
  name: string
  location: string
  type: ProjectType
  /** The narrative a creator tells — shown in the builder textarea. */
  story: string
  /** Capital the creator is asking the pool to deploy, as a plain number. */
  fundingGoal: number
}

/** A single named stage in the application tracker. */
export interface ApplicationStep {
  id: ApplicationStage
  label: string
  hint: string
}
export type ProjectType = 'Solar' | 'Wind' | 'Hydro' | 'Geothermal' | 'Storage'

/** The ordered project types offered to creators as selectable pills. */
export const PROJECT_TYPES: readonly ProjectType[] = [
  'Solar',
  'Wind',
  'Hydro',
  'Geothermal',
  'Storage',
] as const

export interface CreatorApplication {
  /** Where the applicant sits in the named-stage review pipeline. */
  stage: ApplicationStage
  orgName: string
  projectType: ProjectType
  location: string
  /** Public link the reviewer can verify the org against. */
  website: string
  /** When the application was submitted, human-readable. */
  submittedOn: string
  /** Stated, honest review window shown to the applicant. */
  reviewWindow: string
}

/** Ordered stepper model: Submitted → In review → Decision. */
export const APPLICATION_STEPS: readonly ApplicationStep[] = [
  { id: 'submitted', label: 'Submitted', hint: 'We have your application.' },
  { id: 'in_review', label: 'In review', hint: 'A reviewer is verifying your org and project.' },
  { id: 'approved', label: 'Decision', hint: 'You hear back, approved or with next steps.' },
] as const

/** The plain criteria a creator must meet — shown as an ink checklist. */
export const WHITELIST_CRITERIA: readonly string[] = [
  'A registered organization with a verifiable public presence.',
  'A green energy project at or past the permitting stage.',
  'A named location and a contact who can answer reviewer questions.',
  'Willingness to share metering or production data for oracle scoring.',
  'No outstanding regulatory actions against the organization.',
] as const

/** One oracle update in the dashboard feed. */
export interface OracleUpdate {
  date: string
  metric: 'credit' | 'green'
  /** Score before this update. */
  from: number
  /** Score after this update. */
  to: number
  /** Truncated Stellar tx hash, links to the explorer. */
  tx: string
}

/** One factor the oracle weighs — so the path to a better score is legible. */
export interface OracleFactor {
  metric: 'credit' | 'green'
  factor: string
  detail: string
}

export interface CreatorDashboard {
  projectName: string
  location: string
  /** Capital deployed to this project from the pool so far. */
  fundingReceived: number
  /** Stated funding goal, for the funded-of-goal read. */
  fundingGoal: number
  /** Current oracle-verified Credit Quality, 0–100. */
  creditScore: number
  /** Current oracle-verified Green Impact, 0–100. */
  greenScore: number
  /** When the scores were last verified, human-readable. */
  verifiedAgo: string
  /** Small history series for the credit sparkline, oldest → newest. */
  creditHistory: readonly number[]
  /** Small history series for the green sparkline, oldest → newest. */
  greenHistory: readonly number[]
  recentUpdates: readonly OracleUpdate[]
  oracleFactors: readonly OracleFactor[]
}

export const CREATOR_APPLICATION: CreatorApplication = {
  stage: 'in_review',
  orgName: 'Andes Light Cooperative',
  projectType: 'Solar',
  location: 'Arequipa, Peru',
  website: 'https://andeslight.coop',
  submittedOn: 'Jun 9, 2026',
  reviewWindow: 'within 3 business days',
}

export const DRAFT_PROJECT: DraftProject = {
  name: 'Arequipa rooftop solar',
  location: 'Arequipa, Peru',
  type: 'Solar',
  story:
    'A community-owned array across 40 rooftops in Arequipa, replacing diesel backup and selling surplus to the local grid. Built and metered by the cooperative.',
  fundingGoal: 250000,
}

export const CREATOR_DASHBOARD: CreatorDashboard = {
  projectName: 'Cauca run-of-river hydro',
  location: 'Cauca, Colombia',
  fundingReceived: 184500,
  fundingGoal: 300000,
  creditScore: 82,
  greenScore: 91,
  verifiedAgo: '6h ago',
  creditHistory: [74, 76, 75, 78, 80, 82],
  greenHistory: [85, 86, 88, 89, 89, 91],
  recentUpdates: [
    { date: 'Jun 13, 2026', metric: 'green', from: 89, to: 91, tx: 'e7a1…4b90' },
    { date: 'Jun 10, 2026', metric: 'credit', from: 80, to: 82, tx: '3c12…df05' },
    { date: 'Jun 4, 2026', metric: 'green', from: 88, to: 89, tx: 'a9f4…1c77' },
    { date: 'May 28, 2026', metric: 'credit', from: 78, to: 80, tx: '5b03…9e21' },
  ],
  oracleFactors: [
    {
      metric: 'green',
      factor: 'Verified generation',
      detail: 'Metered clean output against the baseline it displaces.',
    },
    {
      metric: 'green',
      factor: 'Additionality',
      detail: 'Capacity that would not exist without this funding.',
    },
    {
      metric: 'credit',
      factor: 'Revenue coverage',
      detail: 'Power-purchase income measured against obligations.',
    },
    {
      metric: 'credit',
      factor: 'Operating history',
      detail: 'Uptime and consistency of reported production.',
    },
    {
      metric: 'credit',
      factor: 'Governance',
      detail: 'Clear ownership and a reachable, accountable operator.',
    },
  ],
}
