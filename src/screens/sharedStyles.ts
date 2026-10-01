/**
 * Re-exports theme style definitions for backward compatibility.
 * All new styles and tokens should be imported directly from `@/theme`.
 */

export * from '@/theme/styles'
export { theme, colors, spacing, radii, fonts, fontSizes, fontWeights } from '@/theme'

export const card = {
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-card)',
}

export const input = {
  borderRadius: 'var(--radius-input)',
  border: '1px solid var(--ink-12)',
}
