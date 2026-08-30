import { useId } from 'react'
import { INK, SOLAR_RAMP, solarAlpha } from './palette'

/**
 * Helio — the platform's one spectacle, here in its static, accessible fallback
 * form. The live build is WebGL/R3F (`HelioWebGL`, wired in via `LiveHelio`);
 * this is the no-WebGL / reduced-motion representation: a soft luminous solar
 * orb with a faint corona of project motes (one mote per funded project).
 *
 * aria-hidden decoration — every datum it encodes is present as text elsewhere.
 */
export interface HelioProps {
  /** Rendered size in px (square). Defaults to 360. */
  size?: number
  /** Number of corona motes — one per funded project. Defaults to 14. */
  motes?: number
  /**
   * Whether the orb plays its slow ~6s breathing animation (CSS `hb-breath` on
   * the `.hb-orb` group). Defaults to true. Independent of `prefers-reduced-motion`
   * support — that's handled globally in `app.css`, which forces `.hb-orb`'s
   * animation off regardless of this prop.
   */
  breathe?: boolean
}

export function Helio({ size = 360, motes = 14, breathe = true }: HelioProps) {
  // Unique gradient ids per instance so multiple Helios on one page don't clash.
  // Strip any non-alphanumerics so the id stays valid across React's useId formats.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const coreId = `hb-core-${uid}`
  const glowId = `hb-glow-${uid}`

  const cx = size / 2
  const r = size * 0.27
  const moteR = size * 0.42
  const dots = Array.from({ length: motes }, (_, i) => {
    const a = (i / motes) * Math.PI * 2 + i * 0.6
    const rr = moteR * (0.82 + ((i * 7) % 11) / 40)
    return { x: cx + rr * Math.cos(a), y: cx + rr * Math.sin(a), s: 1.4 + ((i * 5) % 7) / 3 }
  })

  return (
    <div aria-hidden="true" style={{ width: size, height: size, position: 'relative' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id={coreId} cx="42%" cy="38%" r="68%">
            {SOLAR_RAMP.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </radialGradient>
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={solarAlpha(0.42)} />
            <stop offset="55%" stopColor={solarAlpha(0.12)} />
            <stop offset="100%" stopColor={solarAlpha(0)} />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cx} r={size * 0.48} fill={`url(#${glowId})`} />
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.s} fill={INK} opacity="0.55" />
        ))}
        <g
          className="hb-orb"
          style={{
            transformOrigin: `${cx}px ${cx}px`,
            animation: breathe ? 'hb-breath 6s var(--ease-in-out) infinite' : 'none',
          }}
        >
          <circle cx={cx} cy={cx} r={r} fill={`url(#${coreId})`} />
          <ellipse
            cx={cx - r * 0.32}
            cy={cx - r * 0.36}
            rx={r * 0.42}
            ry={r * 0.3}
            fill="rgba(255,255,255,0.5)"
          />
        </g>
      </svg>
    </div>
  )
}
