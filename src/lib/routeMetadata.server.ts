import type { Metadata } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import {
  buildRootMetadata,
  buildRouteMetadata,
  CANONICAL_ORIGIN,
  TITLE_TEMPLATE,
} from './routeMetadata'

/**
 * Server-side helper for the per-route `metadata` / `generateMetadata` exports
 * (#657). Route segments that render client components can't export metadata
 * themselves, so they get a `layout.tsx` that delegates here; server-component
 * pages call `routeMetadata(path)` directly.
 *
 * Importing `next-intl/server` keeps this module server-only.
 */
export async function routeMetadata(path: string): Promise<Metadata> {
  const t = await getTranslations('Metadata')
  // The route table composes keys as `${routeKey}.title`; next-intl types the
  // translator against the literal union, so widen once here.
  const metadata = buildRouteMetadata(path, (key) => t(key as never))
  if (!metadata) {
    throw new Error(`No metadata registered for route "${path}" in src/lib/routeMetadata.ts`)
  }
  return metadata
}

/**
 * Locale-independent document chrome shared by every page: metadataBase so
 * relative OG/icon paths resolve absolutely (#656), the title template (#657),
 * and the canonical home URL.
 */
const ROOT_CHROME: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  // `default` is overwritten by generateMetadata's localized title (#902).
  title: { default: '', template: TITLE_TEMPLATE },
  alternates: { canonical: '/' },
  icons: {
    icon: '/assets/favicon.svg',
    apple: '/assets/apple-touch-icon.png',
  },
  openGraph: { url: CANONICAL_ORIGIN },
}

/**
 * Root document metadata for the cookie locale (#902): title, description and
 * OpenGraph/Twitter tags come from `Metadata.site.*`, so they follow the active
 * locale (and `og:locale`, already localized in #816). Lives here rather than
 * in `app/layout.tsx` so tests can exercise it without importing `next/font`.
 * The root layout re-exports this as its `generateMetadata`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  const t = await getTranslations('Metadata')
  const localized = buildRootMetadata((key) => t(key as never), locale)
  return {
    ...ROOT_CHROME,
    ...localized,
    title: localized.title,
    openGraph: { ...ROOT_CHROME.openGraph, ...localized.openGraph },
  }
}
