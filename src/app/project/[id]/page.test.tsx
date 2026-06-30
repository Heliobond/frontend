import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@/test/render'

const mockPush = vi.fn()
let mockId = '1'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useParams: () => ({
    id: mockId,
  }),
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
import ProjectDetailPage from './page'
const mockGetProject = vi.mocked(getProject)

describe('ProjectDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockId = '1'
  })

  it('renders not-found for unknown id', async () => {
    mockGetProject.mockResolvedValue(null)
    render(<ProjectDetailPage />)
    await waitFor(() => {
      expect(screen.getByText(/project not found/i)).toBeInTheDocument()
    })
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
      },
      detail: {
        heroGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        creator: { name: 'Test Creator', verified: true, since: '2025' },
        story: 'Test story',
        scoreHistory: { credit: [], green: [] },
        fundingTimeline: [],
      },
    })
    render(<ProjectDetailPage />)
    await waitFor(() => {
      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })
  })

  it('shows loading state initially', () => {
    mockGetProject.mockReturnValue(new Promise(() => {}))
    render(<ProjectDetailPage />)
    expect(screen.getByLabelText(/loading project/i)).toBeInTheDocument()
  })
})
