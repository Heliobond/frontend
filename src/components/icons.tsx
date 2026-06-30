import { type SVGProps } from 'react'

/**
 * Heliobond icon set — one home for the small stroke icons the product reuses.
 *
 * Every icon shares the same skeleton: a 24×24 viewBox, no fill, a 1.5px
 * `currentColor` stroke with round caps/joins, and `aria-hidden` (icons here
 * are decorative — the surrounding control carries the label). Colour follows
 * the surrounding text via `currentColor`, so callers tint with `color`.
 *
 * Pass `size` to scale (defaults differ per icon to match their original call
 * sites); any other SVG prop (className, strokeWidth, style…) is forwarded.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
}

function Icon({
  size = 16,
  strokeWidth = 1.5,
  children,
  ...rest
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** Location pin — used by ProjectCard and ProjectDetail. */
export function PinIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Icon size={size} {...rest}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </Icon>
  )
}

/** Shield with a check — verification badge. */
export function ShieldCheckIcon({ size = 13, strokeWidth = 1.8, ...rest }: IconProps) {
  return (
    <Icon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M12 3 5 6v5c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6l-7-3Z" />
      <path d="m9 11.5 2 2 4-4.5" />
    </Icon>
  )
}

/** Sun — light-theme toggle glyph. */
export function SunIcon({ size = 18, ...rest }: IconProps) {
  return (
    <Icon size={size} {...rest}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  )
}

/** Moon — dark-theme toggle glyph. */
export function MoonIcon({ size = 18, ...rest }: IconProps) {
  return (
    <Icon size={size} {...rest}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </Icon>
  )
}

/** Downward chevron — disclosure / dropdown affordance. */
export function ChevronDownIcon({ size = 14, ...rest }: IconProps) {
  return (
    <Icon size={size} {...rest}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  )
}

/** Overlapping squares — copy to clipboard. */
export function CopyIcon({ size = 15, ...rest }: IconProps) {
  return (
    <Icon size={size} {...rest}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </Icon>
  )
}

/** Checkmark — confirmation / selected state. */
export function CheckIcon({ size = 15, ...rest }: IconProps) {
  return (
    <Icon size={size} {...rest}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  )
}

/** Bold, centred checkmark — for small "step done" badges. */
export function CheckBoldIcon({ size = 12, strokeWidth = 3, ...rest }: IconProps) {
  return (
    <Icon size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M5 13l4 4L19 7" />
    </Icon>
  )
}

/** Arrow leaving a box — external / explorer link. */
export function ExternalIcon({ size = 15, ...rest }: IconProps) {
  return (
    <Icon size={size} {...rest}>
      <path d="M7 17 17 7M9 7h8v8" />
    </Icon>
  )
}

/** Close / dismiss (×). */
export function CloseIcon({ size = 16, ...rest }: IconProps) {
  return (
    <Icon size={size} {...rest}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  )
}

/** Upward arrow to a baseline — upload affordance. */
export function UploadIcon({ size = 22, ...rest }: IconProps) {
  return (
    <Icon size={size} {...rest}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </Icon>
  )
}
