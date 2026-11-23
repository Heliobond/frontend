import { describe, it, expect } from '@/test/bun'
import en from '../../messages/en.json'
import { PRIVATE_ROUTES, PUBLIC_ROUTES, ROUTES, TITLE_TEMPLATE } from './routeMetadata'
import { routeMetadata } from './routeMetadata.server'

/**
 * The server helper every route segment's metadata goes through (#657). These
 * assertions cover the wiring — localized copy, the noindex split, and the
 * fail-loud path for a route that isn't in the table.
 */
describe('routeMetadata() server helper (#657)', () => {
  it.each(ROUTES.map((r) => [r.path, r.key] as const))(
    'resolves localized copy for %s',
    async (path, key) => {
      const metadata = await routeMetadata(path)
      const copy = en.Metadata[key as keyof typeof en.Metadata]
      expect(metadata.title).toMatchObject({ default: copy.title })
      expect(metadata.description).toBe(copy.description)
    },
  )

  it('applies the brand suffix through the root template, not by hand', async () => {
    const metadata = await routeMetadata('/portfolio')
    expect(metadata.title).toMatchObject({
      default: en.Metadata.portfolio.title,
      template: TITLE_TEMPLATE,
    })
  })

  it('noindexes every wallet-private route and nothing else', async () => {
    for (const path of PRIVATE_ROUTES) {
      expect((await routeMetadata(path)).robots).toEqual({ index: false, follow: false })
    }
    for (const path of PUBLIC_ROUTES) {
      expect((await routeMetadata(path)).robots).toBeUndefined()
    }
  })

  it('sets a matching openGraph title and description on every route', async () => {
    for (const { path } of ROUTES) {
      const metadata = await routeMetadata(path)
      const title = (metadata.title as { default: string }).default
      expect(metadata.openGraph?.title).toBe(title)
      expect<string | null | undefined>(metadata.openGraph?.description).toBe(metadata.description)
    }
  })

  it('throws for a route that is not in the table', async () => {
    await expect(routeMetadata('/project/[id]')).rejects.toThrow(/No metadata registered/)
  })
})
