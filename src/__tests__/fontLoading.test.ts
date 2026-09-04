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

/** Origins the old webfont CDNs served from. None of these should still be
 *  referenced by the app now that fonts are self-hosted via `next/font`. */
const LEGACY_FONT_ORIGINS = [
  'https://api.fontshare.com',
  'https://cdn.fontshare.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
]

describe('webfont loading strategy', () => {
  it('loads fonts through next/font instead of remote CSS imports', () => {
    const module = readFile(fontsModulePath)

    expect(module).toContain("from 'next/font/google'")
    expect(module).toContain('Hanken_Grotesk(')
    expect(module).toContain('Spline_Sans_Mono(')
    expect(module).toContain("from 'next/font/local'")
  })

  it('self-hosts Cabinet Grotesk with the display weights (500/700/800)', () => {
    const module = readFile(fontsModulePath)

    expect(module).toContain('cabinet-grotesk-500.woff2')
    expect(module).toContain('cabinet-grotesk-700.woff2')
    expect(module).toContain('cabinet-grotesk-800.woff2')
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
