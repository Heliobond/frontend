'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { ProjectCard, Tag } from '@/components'
import { PROJECT_TYPES, DRAFT_PROJECT, type ProjectType } from '@/data/creator'

/**
 * ProjectBuilder — the off-chain metadata builder. The form on the left writes
 * straight into a live ProjectCard preview on the right, so a creator sees the
 * exact card investors will see while they type. Scores read "pending" until the
 * oracle verifies, so the preview never implies a number we have not earned yet.
 */
export function ProjectBuilder() {
  const [name, setName] = useState(DRAFT_PROJECT.name)
  const [location, setLocation] = useState(DRAFT_PROJECT.location)
  const [type, setType] = useState<ProjectType>(DRAFT_PROJECT.type)
  const [story, setStory] = useState(DRAFT_PROJECT.story)
  const [fundingGoal, setFundingGoal] = useState(String(DRAFT_PROJECT.fundingGoal))

  const goalNumber = Number(fundingGoal.replace(/[^0-9.]/g, '')) || 0
  const goalLabel =
    goalNumber > 0 ? `$0 of $${goalNumber.toLocaleString('en-US')}` : 'awaiting funding'

  return (
    <div
      style={{
        display: 'grid',
        gap: 24,
        gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)',
        alignItems: 'start',
      }}
    >
      {/* Left — the form */}
      <Card>
        <h3 style={cardTitle}>Project details</h3>
        <p style={{ ...subtle, margin: '0 0 20px' }}>
          This metadata lives off-chain and links to your on-chain registry entry.
        </p>

        <Field label="Project name" htmlFor="hb-name">
          <input
            id="hb-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Location" htmlFor="hb-bloc">
          <input
            id="hb-bloc"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <div style={{ marginBottom: 18 }}>
          <Label>Project type</Label>
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
            role="radiogroup"
            aria-label="Project type"
          >
            {PROJECT_TYPES.map((t) => (
              <Tag key={t} selected={type === t} onClick={() => setType(t)}>
                {t}
              </Tag>
            ))}
          </div>
        </div>

        <Field label="Project story" htmlFor="hb-story">
          <textarea
            id="hb-story"
            value={story}
            onChange={(e) => setStory(e.target.value)}
            rows={4}
            style={{
              ...inputStyle,
              height: 'auto',
              padding: '12px 14px',
              lineHeight: 1.5,
              resize: 'vertical',
            }}
          />
        </Field>

        <Field label="Funding goal" htmlFor="hb-goal">
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                fontFamily: 'var(--font-data)',
                fontSize: 15,
                color: 'var(--ink-60)',
              }}
            >
              $
            </span>
            <input
              id="hb-goal"
              type="text"
              inputMode="numeric"
              value={fundingGoal}
              onChange={(e) => setFundingGoal(e.target.value)}
              style={{
                ...inputStyle,
                paddingLeft: 28,
                fontFamily: 'var(--font-data)',
                fontFeatureSettings: '"tnum" 1',
              }}
            />
          </div>
        </Field>

        <Label>Media and documents</Label>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <DropZone label="Cover photo" hint="PNG or JPG, shown on your card" />
          <DropZone label="Verification docs" hint="Permits, PPAs, metering plan" />
        </div>
      </Card>

      {/* Right — the live preview */}
      <div
        style={{ position: 'sticky', top: 24, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--solar)',
              border: '1px solid var(--ink)',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            Live preview
          </span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--ink-60)' }}>
            — updates as you type
          </span>
        </div>

        <ProjectCard
          name={name || 'Your project name'}
          location={location || 'Add a location'}
          credit={0}
          green={0}
          funded={goalLabel}
          verifiedAgo="pending"
        />

        <p style={{ ...subtle, margin: 0 }}>
          Credit and green scores show as pending until the oracle verifies your project. The{' '}
          {type.toLowerCase()} type and your story travel with this card across the atlas.
        </p>
      </div>
    </div>
  )
}

/** A dashed, non-functional upload affordance — a labelled invitation, not a control. */
function DropZone({ label, hint }: { label: string; hint: string }) {
  return (
    <div
      style={{
        border: '1px dashed var(--ink-12)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--ink-06)',
        padding: '20px 16px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="var(--ink)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </svg>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11.5,
          color: 'var(--ink-60)',
          lineHeight: 1.4,
        }}
      >
        {hint}
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: 'block',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--ink)',
        marginBottom: 8,
      }}
    >
      {children}
    </label>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--ink-12)',
        borderRadius: 'var(--radius-card)',
        padding: 24,
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {children}
    </div>
  )
}

const cardTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 18,
  margin: '0 0 8px',
  color: 'var(--ink)',
  letterSpacing: '-0.01em',
}
const subtle: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 13.5,
  lineHeight: 1.5,
  color: 'var(--ink-60)',
}
const inputStyle: CSSProperties = {
  width: '100%',
  height: 44,
  padding: '0 14px',
  fontFamily: 'var(--font-body)',
  fontSize: 15,
  color: 'var(--ink)',
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-input)',
  outline: 'none',
  boxSizing: 'border-box',
}
