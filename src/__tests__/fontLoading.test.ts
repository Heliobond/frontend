import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd())
const fontsCssPath = resolve(root, 'src/styles/tokens/fonts.css')
const fontsModulePath = resolve(root, 'src/theme/fonts.ts')
const layoutPath = resolve(root, 'src/app/layout.tsx')

function readFile(path: string) {
  return readFileSync(path, 'utf8')
}

/** Origins the old webfont CDNs served from. None should be referenced now
 * that all typefaces are self-hosted. */
const LEGACY_FONT_ORIGINS = [
  'https://api.fontshare.com',
  'https://cdn.fontshare.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
]

describe('webfont loading strategy', () => {
  it('uses local font assets instead of remote font imports', () => {
    const source = readFile(fontsModulePath)
    const css = readFile(fontsCssPath)

    expect(source).toContain("from 'next/font/local'")
    expect(source).not.toContain("from 'next/font/google'")
    expect(css).toContain('hanken-grotesk-latin.woff2')
    expect(css).toContain('spline-sans-mono-latin.woff2')
  })

  it('self-hosts Cabinet Grotesk with the display weights (500/700/800)', () => {
    const source = readFile(fontsModulePath)

    expect(source).toContain('cabinet-grotesk-500.woff2')
    expect(source).toContain('cabinet-grotesk-700.woff2')
    expect(source).toContain('cabinet-grotesk-800.woff2')
  })

  it('removes the render-blocking CDN @imports from fonts.css', () => {
    const css = readFile(fontsCssPath)

    expect(css).not.toContain('@import url(')
    for (const origin of LEGACY_FONT_ORIGINS) {
      expect(css).not.toContain(origin)
    }
  })

  it('applies the font variables from the root layout and drops CDN preconnects', () => {
    const layout = readFile(layoutPath)

    expect(layout).toContain("import { fontVariables } from '../theme/fonts'")
    expect(layout).toMatch(/className=\{fontVariables\}/)

    for (const origin of LEGACY_FONT_ORIGINS) {
      expect(layout).not.toContain(`href="${origin}`)
    }
  })
})
