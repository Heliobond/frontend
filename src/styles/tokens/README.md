# Heliobond Design Tokens & Brand Guide

This guide defines the design tokens, brand rules, and patterns that make the Heliobond interface _warm, lucid, and alive_. Use this as a single source of truth when extending the design system or implementing new features.

---

## ☀️ The Brand System

Heliobond relies on a two-color world (deep-pine **ink** on morning-air **canvas**) with a single high-contrast highlight (**solar**).
All layout elements, typography, and motion are tailored to convey fiduciary restraint, environmental growth, and accessibility.

---

## 🎨 Color Tokens (`colors.css`)

Heliobond colors are pure HSL/Hex mappings derived from organic tones. Light is the default; Dark theme ("After Sunset") is a swap of token values, not an inversion.

### Base Palette

| Custom Property | Default (Light)          | Dark ("After Sunset")     | Purpose                                         |
| :-------------- | :----------------------- | :------------------------ | :---------------------------------------------- |
| `--ink`         | `#0b2b23` (Pine)         | `#edf2ec` (Soft Mint)     | All text, icons, strokes, high-contrast borders |
| `--canvas`      | `#f3f5f1` (Morning Air)  | `#0d1714` (Deep Pine)     | Main page background                            |
| `--surface`     | `#fcfdfb` (Off-white)    | `#13201b` (Muted surface) | Card and modal raised background                |
| `--solar`       | `#ffb400` (Yellow)       | `#ffb400` (Yellow)        | Brand accent (sunlight highlight)               |
| `--growth`      | `#0e6f44` (Forest Green) | `#5dd99a` (Mint Green)    | Positive deltas and success metrics             |
| `--ember`       | `#b3361b` (Rust Red)     | `#ff9b82` (Coral Salmon)  | Negative deltas and errors                      |

### ⚠️ Hard Brand Rules

1. **The Solar Rule**: `--solar` is **NEVER** used for text on light backgrounds, nor should it ever carry meaning alone.
2. **Text on Solar**: Any text placed on a `--solar` filled background must use `--ink` for text color (ensuring AAA contrast compliance).
3. **Semantic Text**: `--growth` and `--ember` text should only be used at font sizes `>= 14px` and weight `600`, and must **always** be accompanied by a `+` or `-` glyph or secondary label to ensure colorblind accessibility.

---

## ✍️ Typography (`fonts.css` & `typography.css`)

### Typefaces

- **Display**: `Cabinet Grotesk` (warm, geometric) — used for headlines and hero statistics.
- **Body**: `Hanken Grotesk` (clean, readable) — used for all standard UI labels, paragraphs, and inputs.
- **Data**: `Spline Sans Mono` (monospace tabular) — used for transaction hashes, wallet addresses, and numerical balances.

### Scale & Hierarchy

- **Sentence Case Only**: Headlines are always styled in sentence case (e.g. `Project details`, not `PROJECT DETAILS` or `Project Details`).
- **Minimum Body Size**: Paragraph text must never drop below `16px` (`1rem`) on any viewport size.
- **Numeric Helpers**: Use `font-feature-settings: var(--numeric-tabular)` or the alias `fontFeatureSettings: '"tnum" 1'` on any component showing changing numbers.

---

## 📏 Spacing & Radii (`spacing.css`)

We use a strict **4px base grid** for paddings and margins.

### Spacing Steps

- Micro: `4px` (`--space-1`), `8px` (`--space-2`), `12px` (`--space-3`), `16px` (`--space-4`).
- Layout: `24px` (`--space-6`), `32px` (`--space-8`), `48px` (`--space-12`), `64px` (`--space-16`).
- Sections: `96px` (`--space-24`), `128px` (`--space-32`).

### Radii

- Inputs & Fields: `8px` (`--radius-input`)
- Card surfaces: `16px` (`--radius-card`)
- Modals & Bottom sheets: `24px` (`--radius-modal`)
- CTAs, Badges & Tags: `999px` (`--radius-pill`)

---

## 🔄 Motion & Easing (`motion.css`)

Heliobond animations adhere to the "Frequency Framework":

- **Frequent operations** (nav links, tab swaps) have **NO** animation.
- **Occasional actions** (modals opening, toasts) use fast transitions.
- **Rare achievements** (investment completed) have custom, delightful animations.

### Strict Motion Rules

- **BANNED**: `ease-in` transitions, `transition: all`, and durations `> 350ms` in the main shell.
- **Exits** must always be faster than **entrances**.
- Money counters should transition once on page load/refresh, then update instantly.

---

## 🏗️ How to Add a New Token

To add or modify design tokens:

1. Identify the domain of the token (color, typography, spacing, or motion).
2. Open the corresponding CSS file under `src/styles/tokens/`.
3. Add the token custom property inside the `:root` block.
4. **Important**: If adding a color, make sure to add its dark theme equivalent under `:root[data-theme='dark']` with verified AA/AAA contrast ratios.
5. Reference the token using `var(--your-new-token)` in your styling.

---

## 🖼️ Primitives Gallery

Heliobond provides a curated set of components in `src/components/` that implement the token specifications:

- **Card**: The foundational surface primitive with card radius, light border, and soft shadow.
- **Button**: Primary and secondary CTA actions styled as pills.
- **IconButton**: Clean, round touch target for actions.
- **Badge / Tag**: Small indicator pills for metadata and selection states.
- **AddressChip**: Mono chip for Stellar wallet addresses.
- **ScoreGauge**: Interactive radial score indicator.
- **LiquidityMeter**: A visual display of active vs. available pool liquidity.
- **StatBlock**: Formatted statistics block with integer/decimal sizing support.
- **Sparkline**: Presentational trend line for oracle score histories.
