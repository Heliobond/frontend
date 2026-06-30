import { useState, type CSSProperties } from 'react'
import { ScoreGauge } from './ScoreGauge'
import { PinIcon } from './icons'

/**
 * Heliobond ProjectCard — a project in the living atlas. Photo, name, location,
 * the two sun-arc scores, funding received from the vault, and a verified
 * timestamp. Honest about the pooled model — it links to the project, it is
 * not a checkout.
 */
export interface ProjectCardProps {
  name: string
  location: string
  image?: string
  credit?: number
  green?: number
  funded?: string
  fundedLabel?: string
  verifiedAgo?: string
  verifiedLabel?: string
  onOpen?: () => void
  style?: CSSProperties
}

export function ProjectCard({
  name,
  location,
  image,
  credit = 0,
  green = 0,
  funded,
  fundedLabel = '',
  verifiedAgo,
  verifiedLabel,
  onOpen,
  style,
}: ProjectCardProps) {
  const [hover, setHover] = useState(false)
  const resolvedVerifiedLabel = verifiedLabel ?? verifiedAgo

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-card)',
        boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        overflow: 'hidden',
        cursor: onOpen ? 'pointer' : 'default',
        transform: hover && onOpen ? 'translateY(-2px)' : 'none',
        transition:
          'box-shadow var(--dur-modal) var(--ease-out), transform var(--dur-modal) var(--ease-out)',
        ...style,
      }}
    >
      <div
        style={{
          height: 168,
          background: image
            ? `center/cover no-repeat url(${image})`
            : 'radial-gradient(120% 120% at 70% 10%, var(--solar-24), var(--ink-06))',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 26,
            padding: '0 10px',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--surface)',
            border: '1px solid var(--ink-12)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--type-caption)',
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          <PinIcon /> {location}
        </span>
      </div>

      <div style={{ padding: 20 }}>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 'var(--type-h4)',
            lineHeight: 1.2,
            margin: '0 0 14px',
            letterSpacing: '-0.01em',
          }}
        >
          {name}
        </h3>

        <div style={{ display: 'flex', gap: 18, marginBottom: 16 }}>
          <ScoreGauge value={credit} label="Credit" size={84} stroke={7} />
          <ScoreGauge value={green} label="Green" size={84} stroke={7} />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            paddingTop: 14,
            borderTop: '1px solid var(--ink-12)',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--type-eyebrow)',
                color: 'var(--ink-60)',
                marginBottom: 2,
              }}
            >
              {fundedLabel}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-data)',
                fontWeight: 600,
                fontSize: 'var(--type-body-lg)',
                color: 'var(--ink)',
              }}
            >
              {funded}
            </div>
          </div>
          {resolvedVerifiedLabel && (
            <span
              style={{
                fontFamily: 'var(--font-data)',
                fontSize: 11.5,
                color: 'var(--ink-40)',
                whiteSpace: 'nowrap',
              }}
            >
              {resolvedVerifiedLabel} ↗
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
