export type Screen =
  | 'landing' // /
  | 'connect' // /connect
  | 'explore' // /explore
  | 'project' // /project/[id]
  | 'deposit' // /deposit
  | 'portfolio' // /portfolio/
  | 'withdraw' // /withdraw

export interface Project {
  id: string
  name: string
  location: string
  type: string
  referralLink: string | null
}

export interface ProjectFilters {
  search: string
  type: string
}

export type RiskScore = 'conservative' | 'moderate' | 'aggressive'

export type BondRating = 'AAA' | 'AA' | 'A' | 'BBB' | 'BB' | 'B' | 'CCC'

export interface BondPricePoint {
  date: string; // ISO Date string (YYYY-MM-DD)
  price: number;
  yield: number;
}

export interface Bond {
  id: string;
  rating: BondRating;
  amount: number;
  history: BondPricePoint[];
}

export interface Portfolio {
  id: string
  name: string
  holdings: Bond[]
  riskScore: RiskScore
  referralLink: string | null
}

export const KYC_ALLOWED_DOCUMENT_TYPES = ['image/jpeg', 'application/pdf'] as const
export type KYC_AllowedDocumentType = (typeof KYC_ALLOWED_DOCUMENT_TYPES)[number]

export function isKycAllowedDocumentType(fileType: string): fileType is KYC_AllowedDocumentType {
  const normalized = fileType.trim().toLowerCase()
  return (KYC_ALLOWED_DOCUMENT_TYPES as readonly string[]).some(
    (allowed) => allowed.toLowerCase() === normalized
  );
}