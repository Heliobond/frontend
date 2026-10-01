import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@/test/render'
import { IconButton } from '@/components/IconButton'
import { YieldAlertModal } from '@/components/YieldAlertModal'
import { colors, lightPalette, darkPalette } from './colors'

const root = resolve(process.cwd())
const colorsCssPath = resolve(root, 'src/styles/tokens/colors.css')

function getLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '')
  const r = parseInt(cleanHex.slice(0, 2), 16) / 255
  const g = parseInt(cleanHex.slice(2, 4), 16) / 255
  const b = parseInt(cleanHex.slice(4, 6), 16) / 255

  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getLuminance(hex1)
  const lum2 = getLuminance(hex2)
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('Solar Contrast and --text-on-solar token parity (#708)', () => {
  const css = readFileSync(colorsCssPath, 'utf8')

  it('defines --on-solar and ensures --text-on-solar does not depend on --ink', () => {
    // Both blocks must declare --on-solar as #0b2b23 and point --text-on-solar to it
    expect(css).toMatch(/--on-solar:\s*#0b2b23/i)
    expect(css).toMatch(/--text-on-solar:\s*var\(--on-solar\)/)

    // Ensure --text-on-solar is never defined as var(--ink) in :root or :root[data-theme='dark']
    const textOnSolarAssignments = [...css.matchAll(/--text-on-solar:\s*([^;]+);/g)].map((m) =>
      m[1].trim(),
    )
    expect(textOnSolarAssignments.length).toBeGreaterThanOrEqual(2)
    for (const assignment of textOnSolarAssignments) {
      expect(assignment).not.toBe('var(--ink)')
    }
  })

  it('verifies contrast of --text-on-solar against --solar exceeds 4.5:1 (WCAG AA/AAA) in both light and dark palettes', () => {
    const lightSolar = lightPalette.solar
    const lightTextOnSolar = lightPalette.textOnSolar
    const lightRatio = getContrastRatio(lightSolar, lightTextOnSolar)

    const darkSolar = darkPalette.solar
    const darkTextOnSolar = darkPalette.textOnSolar
    const darkRatio = getContrastRatio(darkSolar, darkTextOnSolar)

    // Must exceed WCAG AA (4.5:1) and AAA (7:1)
    expect(lightRatio).toBeGreaterThanOrEqual(4.5)
    expect(lightRatio).toBeGreaterThanOrEqual(7.0) // ~8.51:1
    expect(darkRatio).toBeGreaterThanOrEqual(4.5)
    expect(darkRatio).toBeGreaterThanOrEqual(7.0) // ~8.51:1

    // Verifies that the test would fail if dark --ink (#edf2ec) was used on --solar (#ffb400)
    const brokenContrast = getContrastRatio(darkPalette.solar, darkPalette.ink)
    expect(brokenContrast).toBeLessThan(4.5) // ~1.57:1
  })

  it('exports textOnSolar and onSolar CSS variable references from theme colors', () => {
    expect(colors.textOnSolar).toBe('var(--text-on-solar)')
    expect(colors.onSolar).toBe('var(--on-solar)')
  })

  it('uses var(--text-on-solar) in solid IconButton', () => {
    render(
      <IconButton variant="solid" label="Test solar icon button">
        <span>Icon</span>
      </IconButton>,
    )

    const btn = screen.getByRole('button', { name: /test solar icon button/i })
    expect(btn.style.color).toBe('var(--text-on-solar)')
    expect(btn.style.background).toBe('var(--solar)')
  })

  it('uses var(--text-on-solar) for the selected operator chip in YieldAlertModal', () => {
    render(
      <YieldAlertModal
        open={true}
        bondName="Solar Bond A"
        currentYield={5.2}
        initialOperator="above"
        onSave={() => {}}
        onClose={() => {}}
      />,
    )

    const aboveBtn = screen.getByRole('button', { name: /above/i })
    expect(aboveBtn.style.color).toBe('var(--text-on-solar)')
    expect(aboveBtn.style.background).toBe('var(--solar)')
  })
})
