import { describe, it, expect } from '@/test/bun'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import en from '../../messages/en.json'
import {
  ROUTES,
  PRIVATE_ROUTES,
  PUBLIC_ROUTES,
  SITE_TITLE,
  TITLE_TEMPLATE,
  buildRouteMetadata,
  isPrivateRoute,
  absoluteTitle,
} from './routeMetadata'

const APP_DIR = path.resolve(__dirname, '..', 'app')

/** Translator standing in for `getTranslations('Metadata')` in tests. */
const t = (key: string): string => {
  const [group, field] = key.split('.')
  const value = (en.Metadata as Record<string, Record<string, string>>)[group]?.[field]
  if (typeof value !== 'string') throw new Error(`Missing message: Metadata.${key}`)
  return value
}

/**
 * Every static, non-dev `page.tsx` under src/app, as a route path. Dynamic
 * segments (`project/[id]`) are skipped — they resolve their own title per
 * record through `generateMetadata` rather than from this table.
 */
function pageRoutes(dir = APP_DIR, prefix = ''): string[] {
  return readdirSync(dir).flatMap((entry) => {
    // Route groups don't add a URL segment, and (dev) holds internal tooling.
    if (entry === '(dev)' || (entry.startsWith('(') && entry !== '(dev)')) return []
    const full = path.join(dir, entry)
    if (!statSync(full).isDirectory()) {
      return entry === 'page.tsx' ? [prefix || '/'] : []
    }
    if (entry.startsWith('[')) return []
    return pageRoutes(full, `${prefix}/${entry}`.replace(/\/$/, ''))
  })
}

/** The `robots` directive for a route, or undefined when it is indexable. */
function robotsOf(path: string): unknown {
  const robots = buildRouteMetadata(path, t)?.robots
  return typeof robots === 'object' ? robots : undefined
}

/** The title a browser tab shows, after the root layout applies the template. */
function renderedTitle(path: string): string {
  const title = buildRouteMetadata(path, t)?.title
  if (typeof title === 'string') return TITLE_TEMPLATE.replace('%s', title)
  if (title && typeof title === 'object' && !('absolute' in title)) {
    return TITLE_TEMPLATE.replace('%s', title.default)
  }
  return String(title)
}

describe('route metadata (#657)', () => {
  it('registers exactly the routes that render a page (dev routes excluded)', () => {
    const registered = ROUTES.map((r) => r.path).sort()
    expect(pageRoutes().sort()).toEqual(registered)
  })

  it.each(ROUTES.map((r) => [r.path, r.key] as const))(
    'gives %s a localized title and description',
    (route, key) => {
      const metadata = buildRouteMetadata(route, t)
      expect(metadata?.title).toMatchObject({ default: t(`${key}.title`) })
      expect(metadata?.description).toBe(t(`${key}.description`))
    },
  )

  it('resolves a unique, non-default <title> for every route', () => {
    const titles = ROUTES.map((r) => renderedTitle(r.path))
    expect(new Set(titles).size).toBe(titles.length)
    for (const title of titles) {
      expect(title).not.toBe(SITE_TITLE)
      expect(title.endsWith(' | Heliobond')).toBe(true)
    }
  })

  it('leaves the brand suffix to the template instead of hand-writing it', () => {
    for (const route of ROUTES) {
      const title = buildRouteMetadata(route.path, t)?.title
      // Each entry restates the template, so the suffix is never typed by hand.
      expect(title).toMatchObject({ template: TITLE_TEMPLATE })
      expect(String((title as { default: string }).default)).not.toMatch(/\s\|\s*Heliobond$/)
    }
  })

  it('composes absolute titles from the same template, for the root page', () => {
    expect(absoluteTitle('Sunlight made financial')).toBe('Sunlight made financial | Heliobond')
    expect(absoluteTitle('Home')).not.toContain('%s')
  })

  it('marks wallet-private routes noindex and leaves public routes indexable', () => {
    for (const route of ROUTES) {
      const isPrivate = PRIVATE_ROUTES.includes(route.path)
      expect(isPrivate).toBe(route.private)
      expect(robotsOf(route.path)).toEqual(isPrivate ? { index: false, follow: false } : undefined)
    }
    expect(PUBLIC_ROUTES.some((route) => PRIVATE_ROUTES.includes(route))).toBe(false)
  })

  it('covers every wallet-private route the issue calls out', () => {
    for (const path of [
      '/portfolio',
      '/portfolio/tax-reports',
      '/connect',
      '/deposit',
      '/withdraw',
      '/watchlist',
    ]) {
      expect(PRIVATE_ROUTES).toContain(path)
      expect(buildRouteMetadata(path, t)?.robots).toEqual({ index: false, follow: false })
    }
  })

  it('returns undefined for routes that resolve their own metadata', () => {
    expect(buildRouteMetadata('/project/[id]', t)).toBeUndefined()
    expect(buildRouteMetadata('/nowhere', t)).toBeUndefined()
  })

  it('answers isPrivateRoute from the same table', () => {
    for (const route of PRIVATE_ROUTES) expect(isPrivateRoute(route)).toBe(true)
    for (const route of PUBLIC_ROUTES) expect(isPrivateRoute(route)).toBe(false)
    expect(isPrivateRoute('/nowhere')).toBe(false)
  })

  it('wires a metadata source for client-component pages, which cannot export any', () => {
    for (const route of [
      '/connect',
      '/creator',
      '/deposit',
      '/learn',
      '/portfolio',
      '/risk',
      '/verify',
      '/watchlist',
      '/withdraw',
    ]) {
      const dir = path.join(APP_DIR, route)
      expect(existsSync(path.join(dir, 'page.tsx'))).toBe(true)
      const layout = path.join(dir, 'layout.tsx')
      const source = existsSync(layout)
        ? readFileSync(layout, 'utf8')
        : readFileSync(path.join(dir, 'page.tsx'), 'utf8')
      expect(source).toContain(`routeMetadata('${route}')`)
    }
  })

  it('keeps the home page metadata on the server-rendered page, not a client one', () => {
    const page = readFileSync(path.join(APP_DIR, 'page.tsx'), 'utf8')
    expect(page).not.toContain("'use client'")
    expect(page).toContain("routeMetadata('/')")
  })
})
