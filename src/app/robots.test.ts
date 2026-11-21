import { afterEach, describe, it, expect, vi } from 'vitest'
import * as api from '../lib/api'
import { selectProjects } from '../state/selectors'
import robots from './robots'
import sitemap from './sitemap'
import { DEV_ROUTES, devRoutesEnabled } from '../lib/devRoutes'
import { PRIVATE_ROUTES, CANONICAL_ORIGIN, PUBLIC_ROUTES } from '../lib/routeMetadata'

function rules() {
  const value = robots().rules
  return Array.isArray(value) ? value[0] : value
}

describe('dev-only routes (#606)', () => {
  it('are disallowed in robots.txt', () => {
    for (const route of DEV_ROUTES) expect(rules().disallow).toContain(route)
  })

  it('are not listed in the sitemap', async () => {
    const urls = (await sitemap()).map((entry) => new URL(entry.url).pathname)
    for (const route of DEV_ROUTES) {
      expect(urls.some((path) => path.startsWith(route))).toBe(false)
    }
  })

  it('are enabled in development and disabled in production', () => {
    expect(devRoutesEnabled('development', undefined)).toBe(true)
    expect(devRoutesEnabled('test', undefined)).toBe(true)
    expect(devRoutesEnabled('production', undefined)).toBe(false)
  })

  it('honour the NEXT_PUBLIC_ENABLE_DEV_ROUTES override', () => {
    expect(devRoutesEnabled('production', 'true')).toBe(true)
    expect(devRoutesEnabled('development', 'false')).toBe(false)
  })
})

describe('indexing rules (#657)', () => {
  it('disallows every wallet-private route in robots.txt', () => {
    for (const route of PRIVATE_ROUTES) expect(rules().disallow).toContain(route)
  })

  it('allows every public route in robots.txt', () => {
    for (const route of PUBLIC_ROUTES) expect(rules().allow).toContain(route)
  })

  it('never both allows and disallows the same route', () => {
    const overlap = PRIVATE_ROUTES.filter((route) => rules().allow?.includes(route))
    expect(overlap).toEqual([])
  })

  it('points at the sitemap on the canonical origin', () => {
    expect(robots().sitemap).toBe(`${CANONICAL_ORIGIN}/sitemap.xml`)
  })
})

describe('sitemap (#657)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps project URLs already read when a later page fails', async () => {
    const project = selectProjects()[0]
    const load = vi
      .spyOn(api, 'getProjectsPaginated')
      .mockResolvedValueOnce({
        projects: [project],
        total: 2,
        page: 1,
        pageSize: 100,
        hasMore: true,
      })
      .mockRejectedValueOnce(new Error('page unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const urls = (await sitemap()).map((entry) => entry.url)
    expect(urls).toContain(`${CANONICAL_ORIGIN}/project/${project.id}`)
    expect(load.mock.calls).toEqual([
      [1, 100],
      [2, 100],
    ])
  })

  it('keeps static URLs when the first project page fails', async () => {
    vi.spyOn(api, 'getProjectsPaginated').mockRejectedValueOnce(new Error('page unavailable'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const urls = (await sitemap()).map((entry) => new URL(entry.url).pathname)
    expect(urls).toEqual(PUBLIC_ROUTES)
  })

  it('lists the public content pages, including /risk, /verify and /learn', async () => {
    const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname)
    for (const route of ['/', '/explore', '/creator', '/risk', '/verify', '/learn']) {
      expect(paths).toContain(route)
    }
  })

  it('omits the per-user watchlist and the other wallet-private routes', async () => {
    const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname)
    expect(paths).not.toContain('/watchlist')
    for (const route of PRIVATE_ROUTES) {
      expect(paths).not.toContain(route)
      // A disallowed prefix must not sneak back in as a nested URL either.
      expect(paths.some((path) => path.startsWith(`${route}/`))).toBe(false)
    }
  })

  it('uses the canonical base URL for every entry', async () => {
    for (const entry of await sitemap()) {
      expect(new URL(entry.url).origin).toBe(CANONICAL_ORIGIN)
    }
  })

  it('gives every entry a priority and change frequency', async () => {
    for (const entry of await sitemap()) {
      expect(entry.priority).toBeGreaterThan(0)
      expect(entry.changeFrequency).toBeDefined()
    }
  })

  it('uses a stable lastModified for static routes and omits it for projects (#822)', async () => {
    const first = await sitemap()
    const second = await sitemap()
    for (const [i, entry] of first.entries()) {
      expect(entry.lastModified).toEqual(second[i].lastModified)
      if (new URL(entry.url).pathname.startsWith('/project/')) {
        expect(entry.lastModified).toBeUndefined()
      } else {
        expect(entry.lastModified).toBeInstanceOf(Date)
      }
    }
  })

  it('lists project URLs from the same data layer the project page reads', async () => {
    const { selectProjects } = await import('../state/selectors')
    const { getProjects } = await import('../lib/api')
    const projects = await getProjects()
    const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname)
    for (const project of projects) {
      expect(paths).toContain(`/project/${project.id}`)
    }
    // In demo mode the data layer is the fixture set, so the counts must match.
    if (projects.length === selectProjects().length) {
      expect(paths.filter((path) => path.startsWith('/project/'))).toHaveLength(projects.length)
    }
  })
})
