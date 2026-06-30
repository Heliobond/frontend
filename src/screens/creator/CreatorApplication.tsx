'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Button, Tag, Card } from '@/components'
import {
  PROJECT_TYPES,
  WHITELIST_CRITERIA,
  type ApplicationStage,
  type ProjectType,
} from '@/data/creator'

/**
 * CreatorApplication — the whitelist door for project creators. Plain criteria
 * up front, a labelled form (never placeholder-as-label), an honest review
 * window, and a named-stage tracker so applicants always know where they stand.
 */
export interface CreatorApplicationProps {
  /** Where the tracker starts. */
  stage?: ApplicationStage
  /** Called with the form values on submit; falls back to local state. */
  onSubmit?: (values: ApplicationFormValues) => void
}

export interface ApplicationFormValues {
  orgName: string
  projectType: ProjectType
  location: string
  links: string
}

export function CreatorApplication({ stage = 'submitted', onSubmit }: CreatorApplicationProps) {
  const t = useTranslations('Creator')
  const [orgName, setOrgName] = useState('')
  const [projectType, setProjectType] = useState<ProjectType>(PROJECT_TYPES[0])
  const [location, setLocation] = useState('')
  const [links, setLinks] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Once submitted locally, advance the tracker to "in review".
  const activeStage: ApplicationStage = submitted ? 'in_review' : stage

  const canSubmit = orgName.trim().length > 0 && location.trim().length > 0

  function handleSubmit() {
    if (!canSubmit) return
    const values: ApplicationFormValues = { orgName, projectType, location, links }
    if (onSubmit) onSubmit(values)
    setSubmitted(true)
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 24,
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
        alignItems: 'start',
      }}
    >
      {/* Left — criteria + tracker */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <Card>
          <h3 style={cardTitle}>{t('lookForTitle')}</h3>
          <p style={{ ...subtle, margin: '0 0 16px' }}>{t('lookForSub')}</p>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {WHITELIST_CRITERIA.map((_, i) => (
              <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <CheckMark />
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--type-small)',
                    lineHeight: 1.5,
                    color: 'var(--ink)',
                  }}
                >
                  {t(`criteria${i}` as Parameters<typeof t>[0])}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 style={cardTitle}>{t('standTitle')}</h3>
          <Stepper activeStage={activeStage} />
        </Card>
      </div>

      {/* Right — the form */}
      <Card>
        <h3 style={cardTitle}>{t('applyTitle')}</h3>
        <p style={{ ...subtle, margin: '0 0 20px' }}>{t('applySub')}</p>

        <Field label={t('fieldOrg')} htmlFor="hb-org">
          <input
            id="hb-org"
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <div style={{ marginBottom: 18 }}>
          <Label htmlFor="">Project type</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PROJECT_TYPES.map((t) => (
              <Tag key={t} selected={projectType === t} onClick={() => setProjectType(t)}>
                {t}
              </Tag>
            ))}
          </div>
        </div>

        <Field label={t('fieldLocation')} htmlFor="hb-loc">
          <input
            id="hb-loc"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label={t('fieldLinks')} htmlFor="hb-links">
          <input
            id="hb-links"
            type="url"
            inputMode="url"
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <div style={{ marginTop: 8 }}>
          <Button
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            disabled={!canSubmit || submitted}
            reason={submitted ? t('submitAppReasonDone') : t('submitAppReason')}
            style={{ width: '100%' }}
          >
            {submitted ? t('submitAppDone') : t('submitApp')}
          </Button>
          {submitted && (
            <p style={{ ...subtle, margin: '12px 0 0', textAlign: 'center' }}>
              {t.rich('submitAppThanks', {
                b: (c: ReactNode) => (
                  <span style={{ color: 'var(--ink)', fontWeight: 600 }}>{c}</span>
                ),
              })}
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}

function Stepper({ activeStage }: { activeStage: ApplicationStage }) {
  const t = useTranslations('Creator')
  const order: ApplicationStage[] = ['submitted', 'in_review', 'approved']
  const activeIndex = order.indexOf(activeStage)

  // We use the ordered ids but get labels/hints from the catalog
  const stepMeta = order.map((id) => {
    const labelKey = `step${id.charAt(0).toUpperCase() + id.slice(1)}Label`
    const hintKey = `step${id.charAt(0).toUpperCase() + id.slice(1)}Hint`
    return {
      id,
      label: t(labelKey as Parameters<typeof t>[0]),
      hint: t(hintKey as Parameters<typeof t>[0]),
    }
  })

  return (
    <ol
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        alignItems: 'flex-start',
      }}
    >
      {stepMeta.map((step, i) => {
        const done = i <= activeIndex
        const last = i === stepMeta.length - 1
        return (
          <li
            key={step.id}
            style={{
              flex: last ? '0 0 auto' : 1,
              display: 'flex',
              alignItems: 'flex-start',
              minWidth: 0,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <Dot done={done} />
              <div style={{ minWidth: 0, paddingRight: 8 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--type-small)',
                    fontWeight: 600,
                    color: done ? 'var(--ink)' : 'var(--ink-40)',
                  }}
                >
                  {step.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--type-eyebrow)',
                    color: 'var(--ink-60)',
                    lineHeight: 1.45,
                    marginTop: 2,
                  }}
                >
                  {step.hint}
                </div>
              </div>
            </div>
            {!last && (
              <div
                aria-hidden="true"
                style={{
                  flex: 1,
                  height: 2,
                  marginTop: 9,
                  minWidth: 16,
                  background: i < activeIndex ? 'var(--solar)' : 'var(--ink-12)',
                  borderRadius: 1,
                }}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Solar dot for completed stages, always paired with the ink label above. */
function Dot({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: done ? 'var(--solar)' : 'transparent',
        border: done ? '1px solid var(--solar)' : '1px solid var(--ink-12)',
        flexShrink: 0,
      }}
    >
      {done && <CheckBoldIcon size={12} style={{ color: 'var(--ink)' }} />}
    </span>
  )
}

function CheckMark() {
  return (
    <span
      aria-hidden="true"
      style={{
        marginTop: 1,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: 'var(--ink-06)',
        border: '1px solid var(--ink-12)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <CheckBoldIcon size={11} style={{ color: 'var(--ink)' }} />
    </span>
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

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor || undefined}
      style={{
        display: 'block',
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--type-caption)',
        fontWeight: 600,
        color: 'var(--ink)',
        marginBottom: 8,
      }}
    >
      {children}
    </label>
  )
}

const cardTitle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: 'var(--type-h5)',
  margin: '0 0 8px',
  color: 'var(--ink)',
  letterSpacing: '-0.01em',
}
const subtle: CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-small)',
  lineHeight: 1.5,
  color: 'var(--ink-60)',
}
const inputStyle: CSSProperties = {
  width: '100%',
  height: 44,
  padding: '0 14px',
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--type-data)',
  color: 'var(--ink)',
  background: 'var(--surface)',
  border: '1px solid var(--ink-12)',
  borderRadius: 'var(--radius-input)',
  outline: 'none',
  boxSizing: 'border-box',
}
