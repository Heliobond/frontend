/**
 * The Heliobond analemma — a single continuous tilted figure-eight (the sun's
 * year-long path), drawn in currentColor with the one permitted second colour:
 * a solar dot. Upper loop subtly smaller, as in the real analemma.
 */
export interface MarkProps {
  size?: number
}

export function Mark({ size = 28 }: MarkProps) {
  return (
    <span style={{ width: size, color: 'var(--ink)', display: 'inline-flex' }}>
      <svg
        viewBox="0 0 100 140"
        fill="none"
        style={{ width: '100%', display: 'block' }}
        aria-hidden="true"
      >
        <g transform="rotate(11 50 70)">
          <path
            d="M 50 64 C 42 56, 34 48, 34 36 C 34 24, 41 14, 50 14 C 59 14, 66 24, 66 36 C 66 48, 58 56, 50 64 C 42 72, 28 80, 28 94 C 28 112, 38 124, 50 124 C 62 124, 72 112, 72 94 C 72 80, 58 72, 50 64 Z"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx="64" cy="20" r="7" fill="#FFB400" />
        </g>
      </svg>
    </span>
  )
}
