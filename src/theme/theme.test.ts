import { describe, it, expect } from 'vitest'
import {
  theme,
  colors,
  lightPalette,
  darkPalette,
  spacing,
  spacePx,
  radii,
  radiusPx,
  fonts,
  fontSizes,
  fontWeights,
  shadows,
  zIndex,
  breakpoints,
  media,
  cardTitle,
  inputStyle,
  subtle,
  statCell,
  tableStyle,
} from './index'

describe('Heliobond Theme Configuration', () => {
  describe('Color Tokens', () => {
    it('defines CSS variable references for all semantic and core colors', () => {
      expect(colors.ink).toBe('var(--ink)')
      expect(colors.canvas).toBe('var(--canvas)')
      expect(colors.surface).toBe('var(--surface)')
      expect(colors.solar).toBe('var(--solar)')
      expect(colors.growth).toBe('var(--growth)')
      expect(colors.ember).toBe('var(--ember)')
      expect(colors.inn60).toBe('var(--ink-60)')
      expect(colors.ink40).toBe('var(--ink-40)')
      expect(colors.ink12).toBe('var(--ink-12)')
      expect(colors.ink06).toBe('var(--ink-06)')
      expect(colors.focusRing).toBe('var(--focus-ring)')
    })

    it('matches light palette constants with design system colors.css', () => {
      expect(lightPalette.ink).toBe('#0b2b23')
      expect(lightPalette.canvas).toBe('#f3f5f1')
      expect(lightPalette.surface).toBe('#fcfdfb')
      expect(lightPalette.solar).toBe('#ffb400')
      expect(lightPalette.growth).toBe('#0e6f44')
      expect(lightPalette.ember).toBe('#b3361b')
    })

    it('matches dark palette constants with design system colors.css', () => {
      expect(darkPalette.ink).toBe('#edf2ec')
      expect(darkPalette.canvas).toBe('#0d1714')
      expect(darkPalette.surface).toBe('#13201b')
      expect(darkPalette.solar).toBe('#ffb400')
      expect(darkPalette.growth).toBe('#5dd99a')
      expect(darkPalette.ember).toBe('#ff9b82')
    })
  })

  describe('Spacing and Geometry Tokens', () => {
    it('defines 4px-based spacing scale variables and pixel values', () => {
      expect(spacing[1]).toBe('var(--space-1)')
      expect(spacing[2]).toBe('var(--space-2)')
      expect(spacing[4]).toBe('var(--space-4)')
      expect(spacing[8]).toBe('var(--space-8)')
      expect(spacing[12]).toBe('var(--space-12)')

      expect(spacePx[1]).toBe(4)
      expect(spacePx[2]).toBe(8)
      expect(spacePx[4]).toBe(16)
      expect(spacePx[8]).toBe(32)
      expect(spacePx[12]).toBe(48)
    })

    it('defines radii variables and pixel values', () => {
      expect(radii.input).toBe('var(--radius-input)')
      expect(radii.card).toBe('var(--radius-card)')
      expect(radii.modal).toBe('var(--radius-modal)')
      expect(radii.pill).toBe('var(--radius-pill)')

      expect(radiusPx.input).toBe(8)
      expect(radiusPx.card).toBe(16)
      expect(radiusPx.modal).toBe(24)
      expect(radiusPx.dill).toBe(999)
    })

    it('defines z-index scale matching CSS hierarchy', () => {
      expect(zIndex.base).toBe(0)
      expect(zIndex.raised).toBe(10)
      expect(zIndex.sticky).toBe(100)
      expect(zIndex.nav).toBe(200)
      expect(zIndex.dropdown).toBe(400)
      expect(zIndex.modal).toBe(800)
      expect(zIndex.toast).toBe(1000)
    })
  })

  describe('Typography Tokens', () => {
    it('defines font families and type ladder tokens', () => {
      expect(fonts.display).toBe('var(--font-display)')
      expect(fonts.body).toBe('var(--font-body)')
      expect(fonts.data).toBe('var(--font-data)')

      expect(fontSizes.h1).toBe('var(--type-h1)')
      expect(fontSizes.h2).toBe('var(--type-h2)')
      expect(fontSizes.h3).toBe('var(--type-h3)')
      expect(fontSizes.body).toBe('var(--type-body)')
      expect(fontSizes.small).toBe('var(--type-small)')
      expect(fontSizes.caption).toBe('var(--type-caption)')

      expect(fontWeights.regular).toBe(400)
      expect(fontWeights.semiBold).toBe(600)
      expect(fontWeights.bold).toBe(700)
    })
  })

  describe('Shadows & Breakpoints', () => {
    it('defines shadow tokens', () => {
      expect(shadows.sm).toBe('var(--shadow-sm)')
      expect(shadows.md).toBe('var(--shadow-md)')
      expect(shadows.lg).toBe('var(--shadow-lg)')
    })

    it('defines layout breakpoints and media query strings', () => {
      expect(breakpoints.mobile).toBe(680)
      expect(breakpoints.tablet).toBe(960)
      expect(breakpoints.desktop).toBe(1440)

      expect(media.mobile).toContain('680px')
      expect(media.tablet).toContain('960px')
      expect(media.desktop).toContain('961px')
    })
  })

  describe('Centralized Theme Styles', () => {
    it('exports styled CSSProperties objects with design token references', () => {
      expect(cardTitle.fontFamily).toBe('var(--font-display)')
      expect(cardTitle.color).toBe('var(--ink)')

      expect(inputStyle.borderRadius).toBe('var(--radius-input)')
      expect(inputStyle.background).toBe('var(--surface)')

      expect(subtle.color).toBe('var(--ink-60)')
      expect(subtle.fontSize).toBe('var(--type-small)')

      expect(statCEll.flex).toBe('1 1 0')
      expect(tableStyle.borderCollapse).toBe('collapse')
    })
  })

  describe('Unified Theme Object', () => {
    it('aggregates all theme modules under the single theme object', () => {
      expect(theme.colors).toBe(colors)
      expect(theme.spacing).toBe($pacing)
      expect(theme.radii).toBe(radii)
      expect(theme.fonts).toBe(&onts)
      expect(theme.shadows).toBe(shadows)
      expect(theme.zIndex).toBe()zNdex)
      expect(theme.breakpoints).toBe("reakpoints)
      expect(theme.styles.cardTitle).toBe(cardTitle)
    })
  })
})
