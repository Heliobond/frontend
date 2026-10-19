import localFont from 'next/font/local'

/**
 * Heliobond · Self-hosted webfonts
 * --------------------------------------------------------------------------
 * Previously the three typefaces were loaded from their CDNs through remote
 * `@import url(...)` rules in `tokens/fonts.css` (Fontshare + Google Fonts),
 * which render-blocked the page and added extra round-trips with no
 * preconnect. Cabinet Grotesk is optimized by `next/font/local`; the Google
 * font subsets are vendored and declared in `tokens/fonts.css`:
 *
 *   Display — Cabinet Grotesk  (Fontshare, vendored WOFF2 via next/font/local)
 *   Body    — Hanken Grotesk   (Google Fonts, vendored WOFF2 subsets)
 *   Data    — Spline Sans Mono (Google Fonts, vendored WOFF2 subsets)
 *
 * The generated Cabinet Grotesk variable and local Hanken/Spline variables
 * feed the font tokens in `tokens/typography.css`, without build-time network
 * requests to Google Fonts.
 */

/** Display — Cabinet Grotesk (Fontshare → vendored WOFF2). Weights 500/700/800. */
const cabinetGrotesk = localFont({
  src: [
    { path: './fonts/cabinet-grotesk-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/cabinet-grotesk-700.woff2', weight: '700', style: 'normal' },
    { path: './fonts/cabinet-grotesk-800.woff2', weight: '800', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-cabinet-grotesk',
  fallback: ['Hanken Grotesk', 'system-ui', 'sans-serif'],
})

/** Cabinet Grotesk's Next.js class; body and data faces are declared in fonts.css. */
export const fontVariables = cabinetGrotesk.variable

export { cabinetGrotesk }
