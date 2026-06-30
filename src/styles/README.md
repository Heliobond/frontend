# Styling approach

Heliobond styles through a **single global stylesheet layer of `hb-`-prefixed
classes**, reached from components via `className`. Every value is a design
token (`var(--…)`); raw colours and off-scale px font-sizes never appear in
component code.

This is the deliberate, documented direction. Large inline `style={{…}}` objects
are being migrated onto this layer because inline styles cannot express the
states the design system needs — `:hover`, `:focus-visible`, `@media`, and
`prefers-reduced-motion` all require real CSS.

## Where styles live

| File              | Holds                                                          |
| ----------------- | -------------------------------------------------------------- |
| `tokens/*.css`    | the design tokens (colour, type scale, spacing, motion, fonts) |
| `tokens/base.css` | reset + global element defaults, incl. the focus-visible ring  |
| `app.css`         | layout grids and responsive behaviour                          |
| `shell.css`       | app-shell component chrome (top bar, wallet menu, footer)      |

`index.css` is the only entry point; it `@import`s the above in order
(tokens → base → app → shell).

## Conventions

- **Naming** — BEM-ish: `block`, `block__element`, `block__element--modifier`
  (e.g. `hb-topbar`, `hb-topbar__nav-link`, `hb-menu-item--ember`).
- **Tokens only** — colours via `var(--ink-60)` etc.; font sizes via the type
  ladder (`var(--type-small)`, …) defined in `tokens/typography.css`. No literal
  hex, rgb, or px font-sizes in `.tsx` or in these classes.
- **State in CSS, not JS** — express hover/focus/active with `:hover`,
  `:focus-visible`, and `[aria-current]`/`[aria-expanded]` selectors instead of
  React state driving inline styles. Guard hover behind
  `@media (hover: hover) and (pointer: fine)` so it never sticks on touch.
- **Icons** — shared SVG icons live in `src/components/icons.tsx`, not inline.

## Migration status

- **Done:** the shell — `TopBar` (incl. the wallet menu) and `Footer`.
- **Next:** the design-system primitives in `src/components/*`, then the screens
  in `src/screens/*`. Until a component is migrated it keeps its inline styles;
  migrate a component wholesale rather than mixing the two within one element.
