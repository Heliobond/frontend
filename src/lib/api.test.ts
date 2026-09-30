import { describe, it, expect } from 'vitest'
import { getProjects, getProject } from './api'

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
})
