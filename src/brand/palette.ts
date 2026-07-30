/**
 * Brand palette — the single source of truth for the literal colour values that
 * canvas-style renderers need.
 *
 * Most of the interface reads colour through the CSS custom properties in
 * `src/styles/tokens/colors.css`, and that remains the preferred route. But two
 * renderers cannot: the SVG <Helio> builds gradient stops, and <HelioWebGL>
 * hands colours to three.js, which needs a parsed value rather than a
 * `var(--solar)` string. Both used to carry their own hard-coded hexes, which
 * meant the same brand colour existed in three places and could drift.
 *
 * These constants mirror the colour tokens exactly:
 *   · `solar` === `--solar`
 *   · `ink`   === `--ink` (light theme)
 * The remaining entries are the solar ramp the orb is built from. They are
 * deliberately theme-independent: the Helio is a fixed brand object and renders
 * the same sun after sunset as it does at noon.
 */

/** `--solar` — the sun, the brand accent. */
export const SOLAR = '#FFB400'

/** `--ink` (light theme) — deep pine, used for the corona motes. */
export const INK = '#0B2B23'

/** Warm highlight at the centre of the orb, and the key light in the WebGL scene. */
export const SOLAR_HIGHLIGHT = '#FFF4D6'

/** Warm core surface tint — the second stop of the orb gradient. */
export const SOLAR_CORE = '#FFD451'

/** Glow halo — sits between the core tint and solar proper. */
export const SOLAR_HALO = '#FFC633'

/** Deep edge of the orb, where the sun falls away into its own limb. */
export const SOLAR_DEEP = '#F59A00'

/**
 * The solar ramp, centre outwards. Consumed by the SVG orb's radial gradient so
 * the stop list is derived rather than restated.
 */
export const SOLAR_RAMP = [
  { offset: '0%', color: SOLAR_HIGHLIGHT },
  { offset: '34%', color: SOLAR_CORE },
  { offset: '72%', color: SOLAR },
  { offset: '100%', color: SOLAR_DEEP },
] as const

/** `--solar` as RGB channels, for building the `rgba()` glow stops. */
export const SOLAR_RGB = '255, 180, 0'

/** Build an `rgba()` string from `--solar` at a given alpha. */
export function solarAlpha(alpha: number): string {
  return `rgba(${SOLAR_RGB}, ${alpha})`
}

export const BRAND = {
  solar: SOLAR,
  ink: INK,
  solarHighlight: SOLAR_HIGHLIGHT,
  solarCore: SOLAR_CORE,
  solarHalo: SOLAR_HALO,
  solarDeep: SOLAR_DEEP,
} as const
