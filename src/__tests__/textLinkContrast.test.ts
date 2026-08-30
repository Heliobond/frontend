import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd())
const colorsPath = resolve(root, 'src/styles/tokens/colors.css')
const appCssPath = resolve(root, 'src/styles/app.css')

function readFile(path: string) {
  return readFileSync(path, 'utf8')
}

describe('text link contrast styling', () => {
  it('defines semantic link tokens for both light and dark themes', () => {
    const css = readFile(colorsPath)

    expect(css).toContain('--text-link: var(--ink-60);')
    expect(css).toContain('--text-link-hover: var(--ink);')
    expect(css).toContain('--border-link-underline: var(--ink-40);')
    expect(css).toContain(':root[data-theme=\'dark\']')
    expect(css).toContain('--text-link: var(--ink-60);')
    expect(css).toContain('--text-link-hover: var(--ink);')
    expect(css).toContain('--border-link-underline: var(--ink-40);')
  })

  it('keeps hb-textlink underlined with visible hover and focus states', () => {
    const css = readFile(appCssPath)

    expect(css).toContain('.hb-textlink {')
    expect(css).toContain('color: var(--text-link);')
    expect(css).toContain('text-decoration: underline;')
    expect(css).toContain('text-decoration-color: var(--border-link-underline);')
    expect(css).toContain('text-underline-offset: 0.25em;')
    expect(css).toContain('.hb-textlink:focus-visible {')
    expect(css).toContain('outline: 2px solid var(--focus-ring);')
    expect(css).toContain('@media (hover: hover) and (pointer: fine)')
    expect(css).toContain('.hb-textlink:hover {')
    expect(css).toContain('color: var(--text-link-hover);')
    expect(css).toContain('text-decoration-color: var(--text-link-hover);')
  })
})
