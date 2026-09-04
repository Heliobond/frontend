import { Hanken_Grotesk, Spline_Sans_Mono } from 'next/font/google'
import localFont from 'next/font/local'

/**
 * Heliobond · Self-hosted webfonts (via next/font)
 * --------------------------------------------------------------------------
 * Previously the three typefaces were loaded from their CDNs through remote
 * `@import url(...)` rules in `tokens/fonts.css` (Fontshare + Google Fonts),
 * which render-blocked the page and added extra round-trips with no
 * preconnect. All three are now fetched/optimized by `next/font` at build
 * time and served from the app's own origin:
 *
 *   Display — Cabinet Grotesk  (Fontshare, vendored WOFF2 via next/font/local)
 *   Body    — Hanken Grotesk   (Google, self-hosted via next/font/google)
 *   Data    — Spline Sans Mono (Google, self-hosted via next/font/google)
 *
 * The `variable` options emit CSS custom properties that `tokens/typography.css`
 * consumes (`--font-display`, `--font-body`, `--font-data`), so every
 * `font-family: var(--font-*)` in the design system resolves to the loaded,
 * hashed, preloaded face instead of a CDN name.
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

/** Body — Hanken Grotesk (Google). Weights 400/500/600/700. */
const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-hanken-grotesk',
  fallback: ['system-ui', '-apple-system', 'sans-serif'],
})

/** Data — Spline Sans Mono (Google). Weights 400/500/600. */
const splineSansMono = Spline_Sans_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-spline-sans-mono',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
})

/** Concatenated className applied to <html> so all three variables are set. */
export const fontVariables = [
  cabinetGrotesk.variable,
  hankenGrotesk.variable,
  splineSansMono.variable,
].join(' ')

export { cabinetGrotesk, hankenGrotesk, splineSansMono }
