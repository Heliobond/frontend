import { describe, it, expect, vi } from '@/test/bun'
import { getProjects, getProject, shouldShowDemoBadge } from './api'
import * as registry from '../wallet/registry'

describe('api', () => {
  it('returns mock data for getProjects', async () => {
    expect(await getProjects()).toBeDefined()
  })

  it('rejects invalid project ids to prevent injection', async () => {
    await expect(getProject(-1)).resolves.toBeNull()
    await expect(getProject(NaN)).resolves.toBeNull()
    await expect(getProject(1.5)).resolves.toBeNull()
    await expect(getProject(0)).resolves.toBeNull()
  })

  describe('shouldShowDemoBadge and source resolution', () => {
    it('returns false for registry and backend sources, true for demo source', () => {
      expect(shouldShowDemoBadge('registry')).toBe(false)
      expect(shouldShowDemoBadge('backend')).toBe(false)
      expect(shouldShowDemoBadge('demo')).toBe(true)
    })

    it('attaches source: "demo" when falling back to demo project details', async () => {
      const res = await getProject(1)
      expect(res).not.toBeNull()
      expect(res?.source).toBe('demo')
    })

    it('attaches source: "registry" when reading from on-chain registry', async () => {
      vi.spyOn(registry, 'isRegistryConfigured').mockReturnValue(true)
      vi.spyOn(registry, 'fetchProjectWithDetails').mockResolvedValueOnce({
        project: {
          id: 1,
          name: 'Live On-Chain Solar',
          location: 'Atacama, Chile',
          type: 'Solar',
          credit: 95,
          green: 98,
          funded: '$1,000,000',
          fundedAmount: 1000000,
          fundingGoal: 1000000,
          priceHistory: [],
        },
        detail: {
          name: 'Live On-Chain Solar',
          location: 'Atacama, Chile',
          heroGradient:
            'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(16,185,129,0.2) 100%)',
          creator: { name: 'Solar Corp', verified: true, since: '2025' },
          story: 'Live project details',
          scoreHistory: { credit: [], green: [] },
          priceHistory: [],
          fundingGoal: 1000000,
          fundedAmount: 1000000,
          fundingTimeline: [],
        },
        verifiedMetadata: 'verified',
      })

      const res = await getProject(1)
      expect(res).not.toBeNull()
      expect(res?.source).toBe('registry')
      expect(shouldShowDemoBadge(res?.source)).toBe(false)
    })
  })
})
