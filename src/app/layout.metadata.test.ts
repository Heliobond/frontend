import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Metadata } from 'next'
import en from '../../messages/en.json'
import fr from '../../messages/fr.json'
import ar from '../../messages/ar.json'
import { generateMetadata } from '../lib/routeMetadata.server'
import manifest from './manifest'

type Catalog = typeof en
const catalogs: Record<string, Catalog> = {
  en: en as Catalog,
  fr: fr as Catalog,
  ar: ar as Catalog,
}

function lookup(catalog: Catalog, key: string): string {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], catalog)
  if (typeof value !== 'string') throw new Error(`Missing message: ${key}`)
  return value
}

/**
 * Overrides the shared `next-intl/server` mock from vitest.setup.ts so these
 * cases can flip the active locale and assert cookie-driven copy (#902).
 */
const localeState = vi.hoisted(() => ({ current: 'en' }))

vi.mock('next-intl/server', () => ({
  getLocale: async () => localeState.current,
  getMessages: async () => catalogs[localeState.current],
  getTranslations: async (namespace?: string) => {
    const catalog = catalogs[localeState.current]
    return namespace
      ? (key: string) => lookup(catalog, `${namespace}.${key}`)
      : (key: string) => lookup(catalog, key)
  },
}))

function firstOgImage(meta: Metadata) {
  const images = meta.openGraph?.images
  return Array.isArray(images) ? images[0] : images
}

describe('root generateMetadata locale (#902)', () => {
  beforeEach(() => {
    localeState.current = 'en'
  })

  it('renders English title, description and OG tags by default', async () => {
    const meta = await generateMetadata()
    expect(meta.title).toMatchObject({ default: en.Metadata.site.title })
    expect(meta.description).toBe(en.Metadata.site.description)
    expect(meta.openGraph?.title).toBe(en.Metadata.site.title)
    expect(meta.openGraph?.description).toBe(en.Metadata.site.description)
    expect(meta.openGraph?.locale).toBe('en_US')
    expect(meta.twitter?.title).toBe(en.Metadata.site.title)
    expect(meta.twitter?.description).toBe(en.Metadata.site.description)
    expect(firstOgImage(meta)).toMatchObject({ alt: en.Metadata.site.previewAlt })
  })

  it.each([
    ['fr', fr, 'fr_FR'],
    ['ar', ar, 'ar_AR'],
  ] as const)(
    'follows the %s cookie locale for title, description and OG tags',
    async (locale, catalog, og) => {
      localeState.current = locale
      const meta: Metadata = await generateMetadata()
      expect(meta.title).toMatchObject({ default: catalog.Metadata.site.title })
      expect(meta.description).toBe(catalog.Metadata.site.description)
      expect(meta.openGraph?.title).toBe(catalog.Metadata.site.title)
      expect(meta.openGraph?.description).toBe(catalog.Metadata.site.description)
      expect(meta.openGraph?.locale).toBe(og)
      expect(firstOgImage(meta)).toMatchObject({ alt: catalog.Metadata.site.previewAlt })
      expect(meta.twitter?.title).toBe(catalog.Metadata.site.title)
      expect(meta.twitter?.description).toBe(catalog.Metadata.site.description)
    },
  )
})

describe('manifest description locale (#902)', () => {
  it.each([
    ['en', en],
    ['fr', fr],
    ['ar', ar],
  ] as const)('localizes the manifest description for %s', async (locale, catalog) => {
    localeState.current = locale
    const route = await manifest()
    expect(route.description).toBe(catalog.Metadata.site.manifestDescription)
  })
})
