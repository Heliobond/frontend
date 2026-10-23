import type { MetadataRoute } from 'next'
import { getTranslations } from 'next-intl/server'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  // Description follows the cookie locale (#902), same source as generateMetadata.
  const t = await getTranslations('Metadata')
  return {
    name: 'Heliobond',
    short_name: 'Heliobond',
    description: t('site.manifestDescription'),
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f5f1', // --canvas
    theme_color: '#f3f5f1', // --canvas (matches light mode theme color)
    icons: [
      {
        src: '/assets/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/assets/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
