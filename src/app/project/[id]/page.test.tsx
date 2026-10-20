import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/render'

const mockPush = vi.fn()
const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
let mockId = '1'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useParams: () => ({
    id: mockId,
  }),
  notFound: () => mockNotFound(),
}))

vi.mock('@/lib/api', () => ({
  getProject: vi.fn(),
}))

vi.mock('@/screens/ProjectDetail', () => ({
  ProjectDetail: ({ project }: { project: { name: string } }) => (
    <div data-testid="project-detail">{project.name}</div>
  ),
}))

import { getProject } from '@/lib/api'
import en from '../../../../messages/en.json'
import ProjectDetailPage, { generateMetadata, parseProjectId } from './page'
import { ProjectDetailClient } from './ProjectDetailClient'

const mockGetProject = vi.mocked(getProject)

describe('ProjectDetailPage & generateMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockId = '1'
  })

  describe('parseProjectId', () => {
    it('parses valid positive integer strings', () => {
      expect(parseProjectId('1')).toBe(1)
      expect(parseProjectId('42')).toBe(42)
      expect(parseProjectId('0')).toBe(0)
    })

    it('rejects malformed, non-numeric, decimal, negative, or exponential strings', () => {
      expect(parseProjectId('abc')).toBeNull()
      expect(parseProjectId('1.5')).toBeNull()
      expect(parseProjectId('-3')).toBeNull()
      expect(parseProjectId('1e2')).toBeNull()
      expect(parseProjectId('0x10')).toBeNull()
      expect(parseProjectId(' 1 ')).toBeNull()
      expect(parseProjectId('')).toBeNull()
    })

    it('rejects non-string values', () => {
      expect(parseProjectId(null)).toBeNull()
      expect(parseProjectId(undefined)).toBeNull()
      expect(parseProjectId(123)).toBeNull()
    })

    it('rejects integers that exceed Number.MAX_SAFE_INTEGER', () => {
      expect(parseProjectId('9007199254740992')).toBeNull()
    })
  })

  it('calls notFound() for unknown id when project is missing in registry', async () => {
    mockGetProject.mockResolvedValue(null)
    await expect(ProjectDetailPage({ params: Promise.resolve({ id: '999' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(mockNotFound).toHaveBeenCalled()
    expect(mockGetProject).toHaveBeenCalledWith(999)
  })

  it('calls notFound() for malformed id "abc" without querying registry', async () => {
    await expect(ProjectDetailPage({ params: Promise.resolve({ id: 'abc' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(mockNotFound).toHaveBeenCalled()
    expect(mockGetProject).not.toHaveBeenCalled()
  })

  it('calls notFound() for decimal id "1.5" without querying registry', async () => {
    await expect(ProjectDetailPage({ params: Promise.resolve({ id: '1.5' }) })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    )
    expect(mockNotFound).toHaveBeenCalled()
    expect(mockGetProject).not.toHaveBeenCalled()
  })

  it('renders detail for known id', async () => {
    mockGetProject.mockResolvedValue({
      project: {
        id: 1,
        name: 'Test Project',
        location: 'Test Location',
        type: 'Solar',
        credit: 80,
        green: 90,
        funded: '$100,000',
        fundedAmount: 100000,
        fundingGoal: 200000,
        priceHistory: [],
      },
      detail: {
        name: 'Test Project',
        location: 'Test Location',
        heroGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        creator: { name: 'Test Creator', verified: true, since: '2025' },
        story: 'Test story',
        scoreHistory: { credit: [], green: [] },
        fundingTimeline: [],
        fundedAmount: 100000,
        fundingGoal: 200000,
        priceHistory: [],
      },
    })
    const pageElement = await ProjectDetailPage({ params: Promise.resolve({ id: '1' }) })
    render(pageElement)
    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })
  })

  it('generates dynamic SEO metadata', async () => {
    mockGetProject.mockResolvedValue({
      project: {
        id: 1,
        name: 'Solar Park Alpha',
        location: 'Provence, France',
        type: 'Solar',
        credit: 92,
        green: 95,
        funded: '$500,000',
        fundedAmount: 500000,
        fundingGoal: 1000000,
        priceHistory: [],
      },
      detail: {
        name: 'Solar Park Alpha',
        location: 'Provence, France',
        heroGradient: '',
        creator: { name: 'EcoCorp', verified: true, since: '2025' },
        story: 'Story',
        scoreHistory: { credit: [], green: [] },
        fundingTimeline: [],
        fundedAmount: 500000,
        fundingGoal: 1000000,
        priceHistory: [],
      },
    })
    const meta = await generateMetadata({ params: Promise.resolve({ id: '1' }) })
    // The root layout's template appends the brand, so the page title doesn't.
    expect(meta.title).toBe('Solar Park Alpha — Green Bond Details')
    expect(meta.description).toContain('Provence, France')
  })

  it('noindexes a project that does not exist', async () => {
    mockGetProject.mockResolvedValue(null)
    const meta = await generateMetadata({ params: Promise.resolve({ id: '999' }) })
    expect(meta.title).toEqual({
      absolute: `${en.Metadata.projectNotFound.title} | Heliobond`,
    })
    expect(meta.description).toBe(en.Metadata.projectNotFound.description)
    expect(meta.robots).toEqual({ index: false, follow: false })
  })

  it('noindexes a non-numeric project id', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ id: 'not-a-number' }) })
    expect(mockGetProject).not.toHaveBeenCalled()
    expect(meta.robots).toEqual({ index: false, follow: false })
  })

  it('noindexes a decimal project id', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ id: '1.5' }) })
    expect(mockGetProject).not.toHaveBeenCalled()
    expect(meta.robots).toEqual({ index: false, follow: false })
  })

  it('renders ProjectDetailClient with initial null data', () => {
    render(<ProjectDetailClient id={1} initialData={null} />)
    expect(screen.getByText(/project not found/i)).toBeInTheDocument()
  })
})
