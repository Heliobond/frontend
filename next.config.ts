import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { STATIC_SECURITY_HEADERS } from './src/lib/securityHeaders'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Opt-in: ship browser source maps so errors in the telemetry sink can be
  // symbolicated (#609). Off by default because it publishes the source.
  productionBrowserSourceMaps: process.env.SOURCE_MAPS === 'true',
  async headers() {
    // Content-Security-Policy is set per request in src/proxy.ts (it needs a nonce).
    return [{ source: '/:path*', headers: STATIC_SECURITY_HEADERS }]
  },
  webpack(config) {
    const splitChunks = config.optimization.splitChunks || {}
    config.optimization.splitChunks = {
      ...splitChunks,
      cacheGroups: {
        ...(splitChunks.cacheGroups || {}),
        three: {
          test: /[\\/]node_modules[\\/](?:three|@react-three\/fiber)(?:[\\/]|$)/,
          name: 'three',
          chunks: 'async',
          priority: 40,
          enforce: true,
        },
      },
    }
    return config
  },
}

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

export default withNextIntl(nextConfig)
