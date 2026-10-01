/**
 * Heliobond Design System · Color Tokens
 *
 * Single source of truth for color tokens, CSS variable aliases, and theme color palettes.
 * Mirrors src/styles/tokens/colors.css.
 */

export const lightPalette = {
  ink: '#0b2b23',
  canvas: '#f3f5f1',
  surface: '#fcfdfb',
  solar: '#ffb400',
  growth: '#0e6f44',
  ember: '#b3361b',
  onSolar: '#0b2b23',
  textOnSolar: '#0b2b23',

  // Ink-derived neutrals
  ink60: 'rgba(11, 43, 35, 0.6)',
  ink40: 'rgba(11, 43, 35, 0.4)',
  ink12: 'rgba(11, 43, 35, 0.12)',
  ink06: 'rgba(11, 43, 35, 0.06)',

  // Tints
  solar12: 'rgba(255, 180, 0, 0.12)',
  solar24: 'rgba(255, 180, 0, 0.24)',
  growth12: 'rgba(14, 111, 68, 0.12)',
  ember12: 'rgba(179, 54, 27, 0.12)',
} as const

export const darkPalette = {
  ink: '#edf2ec',
  canvas: '#0d1714',
  surface: '#13201b',
  solar: '#ffb400',
  growth: '#5dd99a',
  ember: '#ff9b82',
  onSolar: '#0b2b23',
  textOnSolar: '#0b2b23',

  // Lifted neutrals for AA/AAA contrast
  ink60: 'rgba(237, 242, 236, 0.72)',
  ink40: 'rgba(237, 242, 236, 0.52)',
  ink12: 'rgba(237, 242, 236, 0.14)',
  ink06: 'rgba(237, 242, 236, 0.06)',

  // Tints
  solar12: 'rgba(255, 180, 0, 0.14)',
  solar24: 'rgba(255, 180, 0, 0.26)',
  growth12: 'rgba(93, 217, 154, 0.14)',
  ember12: 'rgba(255, 155, 130, 0.14)',
} as const

/**
 * CSS custom property bindings for theme colors.
 * Used in component styles to dynamically respond to light/dark data-theme attribute on <html>.
 */
export const colors = {
  // Base tokens
  ink: 'var(--ink)',
  canvas: 'var(--canvas)',
  surface: 'var(--surface)',
  solar: 'var(--solar)',
  growth: 'var(--growth)',
  ember: 'var(--ember)',

  // Neutral ramps
  ink60: 'var(--ink-60)',
  ink40: 'var(--ink-40)',
  ink12: 'var(--ink-12)',
  ink06: 'var(--ink-06)',

  // Tints
  solar12: 'var(--solar-12)',
  solar24: 'var(--solar-24)',
  growth12: 'var(--growth-12)',
  ember12: 'var(--ember-12)',

  // Semantic aliases
  bgPage: 'var(--bg-page)',
  bgSurface: 'var(--bg-surface)',
  bgSunken: 'var(--bg-sunken)',

  textStrong: 'var(--text-strong)',
  textSecondary: 'var(--text-secondary)',
  textTertiary: 'var(--text-tertiary)',
  onSolar: 'var(--on-solar)',
  textOnSolar: 'var(--text-on-solar)',
  textPositive: 'var(--text-positive)',
  textNegative: 'var(--text-negative)',
  textLink: 'var(--text-link)',
  textLinkHover: 'var(--text-link-hover)',

  borderHairline: 'var(--border-hairline)',
  borderStrong: 'var(--border-strong)',
  borderLinkUnderline: 'var(--border-link-underline)',

  accent: 'var(--accent)',
  accentTint: 'var(--accent-tint)',

  focusRing: 'var(--focus-ring)',
  focusOffset: 'var(--focus-offset)',
} as const

export type ColorTokens = typeof colors
export type Palette = typeof lightPalette
