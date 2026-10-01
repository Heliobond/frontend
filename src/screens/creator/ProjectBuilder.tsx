'use client'

import { useId, useState, useEffect, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ProjectCard, Tag, Card, UploadIcon, Button } from '@/components'
import {
  cardTitle,
  subtle,
  inputStyle,
  labelText,
  fieldLabel,
  fieldSpacing,
  hintText,
  errorText,
} from '@/theme'
import { PROJECT_TYPES, DRAFT_PROJECT, type ProjectType } from '@/data/creator'
import { formatMoney } from '@/lib/format'
import { useWallet } from '@/wallet/WalletProvider'
import {
  validateMetadataUri,
  validateMaturityDate,
  buildCanonicalMetadata,
  computeSha256,
  submitCreateProject,
  NotWhitelistedError,
  type CreateProjectResult,
} from '@/wallet/registry'
import { getExplorerTxUrl } from '@/config/network'

/**
 * ProjectBuilder — the off-chain metadata builder. The form on the left writes
 * straight into a live ProjectCard preview on the right, so a creator sees the
 * exact card investors will see while they type. Scores read "pending" until the
 * oracle verifies, so the preview never implies a number we have not earned yet.
 */
export function ProjectBuilder() {
  const t = useTranslations('Creator')
  const wallet = useWallet()

  const [name, setName] = useState(DRAFT_PROJECT.name)
  const [location, setLocation] = useState(DRAFT_PROJECT.location)
  const [type, setType] = useState<ProjectType>(DRAFT_PROJECT.type)
  const [story, setStory] = useState(DRAFT_PROJECT.story)
  const [fundingGoal, setFundingGoal] = useState(String(DRAFT_PROJECT.fundingGoal))
  const goalErrorId = useId()
  const [goalError, setGoalError] = useState<string | null>(null)

  // URI and maturity date fields for ProjectRegistry.create_project
  const [uri, setUri] = useState('ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi')
  const [uriTouched, setUriTouched] = useState(false)
  const [uriError, setUriError] = useState<string | null>(null)
  const uriErrorId = useId()

  const [maturityDate, setMaturityDate] = useState('')
  const [maturityError, setMaturityError] = useState<string | null>(null)
  const maturityErrorId = useId()

  // Canonical metadata and hash
  const [metadataHash, setMetadataHash] = useState<string | null>(null)

  // Publishing state
  const [isPublishing, setIsPublishing] = useState(false)
  const [notWhitelisted, setNotWhitelisted] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishResult, setPublishResult] = useState<CreateProjectResult | null>(null)

  const handleGoalChange = (value: string) => {
    setFundingGoal(value)
    const normalized = value.replace(/[^0-9.]/g, '')
    const num = Number(normalized) || 0
    if (num <= 0) {
      setGoalError(t('goalInvalid') ?? 'Enter a funding goal greater than 0')
    } else {
      setGoalError(null)
    }
  }

  const goalNumber = Number(fundingGoal.replace(/[^0-9.]/g, '')) || 0

  const getGoalLabel = (): string => {
    if (goalNumber <= 0) return t('awaitingFunding')
    return t('fundingLabel', { goal: formatMoney(goalNumber) })
  }

  const goalLabel = getGoalLabel()

  const [debouncedName, setDebouncedName] = useState(name)
  const [debouncedLocation, setDebouncedLocation] = useState(location)
  const [debouncedGoalLabel, setDebouncedGoalLabel] = useState(goalLabel)
  const [debouncedType, setDebouncedType] = useState(type)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedName(name)
      setDebouncedLocation(location)
      setDebouncedGoalLabel(goalLabel)
      setDebouncedType(type)
    }, 1000)
    return () => clearTimeout(handler)
  }, [name, location, goalLabel, type])

  useEffect(() => {
    let active = true
    const jsonStr = buildCanonicalMetadata({
      name,
      location,
      type,
      story,
      fundingGoal: goalNumber,
    })
    computeSha256(jsonStr).then((hash) => {
      if (active && hash) {
        setMetadataHash(hash)
      }
    })
    return () => {
      active = false
    }
  }, [name, location, type, story, goalNumber])

  const handleDownloadMetadata = () => {
    const payload = {
      name,
      location,
      type,
      story,
      fundingGoal: goalNumber,
    }
    const jsonStr = buildCanonicalMetadata(payload)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'project'}-metadata.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handlePublish = async () => {
    setPublishError(null)
    setNotWhitelisted(false)
    setPublishResult(null)

    if (!wallet.address) {
      setPublishError('Please connect your wallet first')
      return
    }

    if (goalNumber <= 0) {
      setGoalError('Funding goal must be greater than 0')
      return
    }

    const uriCheck = validateMetadataUri(uri)
    if (!uriCheck.valid) {
      setUriError(uriCheck.error ?? 'Invalid metadata URI')
      return
    }

    let maturityDateSeconds = 0
    if (maturityDate) {
      maturityDateSeconds = Math.floor(new Date(maturityDate).getTime() / 1000)
      const maturityCheck = validateMaturityDate(maturityDateSeconds)
      if (!maturityCheck.valid) {
        setMaturityError(maturityCheck.error ?? 'Invalid maturity date')
        return
      }
    }

    let activeHash = metadataHash
    if (!activeHash) {
      const jsonStr = buildCanonicalMetadata({
        name,
        location,
        type,
        story,
        fundingGoal: goalNumber,
      })
      activeHash = await computeSha256(jsonStr)
      if (activeHash) setMetadataHash(activeHash)
    }

    if (!activeHash) {
      setPublishError('Could not compute metadata hash')
      return
    }

    setIsPublishing(true)
    try {
      const res = await submitCreateProject(
        wallet.address,
        uri.trim(),
        maturityDateSeconds,
        activeHash,
        wallet.sign,
      )
      setPublishResult(res)
    } catch (err: unknown) {
      if (err instanceof NotWhitelistedError || (err instanceof Error && err.name === 'NotWhitelistedError')) {
        setNotWhitelisted(true)
      } else {
        setPublishError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setIsPublishing(false)
    }
  }

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
        <h3 style={cardTitle}>{t('builderTitle')}</h3>
        <p style={{ ...subtle, margin: '0 0 20px' }}>{t('builderSub')}</p>

        <Field label={t('fieldName')} htmlFor="hb-name">
          <input
            id="hb-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label={t('fieldLocation')} htmlFor="hb-bloc">
          <input
            id="hb-bloc"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <div style={fieldSpacing}>
          <Label>{t('fieldProjectType')}</Label>
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}
            role="radiogroup"
            aria-label={t('fieldProjectType')}
          >
            {PROJECT_TYPES.map((pt) => (
              <Tag key={pt} selected={type === pt} onClick={() => setType(pt)}>
                {t(`type${pt}` as Parameters<typeof t>[0])}
              </Tag>
            ))}
          </div>
        </div>

        <Field label={t('fieldStory')} htmlFor="hb-story">
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

        <Field label={t('fieldGoal')} htmlFor="hb-goal">
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                insetInlineStart: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                fontFamily: 'var(--font-data)',
                fontSize: 'var(--type-data)',
                color: 'var(--ink-60)',
              }}
            >
              $
            </span>
            <input
              id="hb-goal"
              type="text"
              inputMode="decimal"
              value={fundingGoal}
              onChange={(e) => handleGoalChange(e.target.value)}
              aria-invalid={goalError != null}
              aria-describedby={goalError ? goalErrorId : undefined}
              style={{
                ...inputStyle,
                paddingInlineStart: 28,
                fontFamily: 'var(--font-data)',
                fontFeatureSettings: '"tnum" 1',
                borderColor: goalError ? 'var(--ember)' : 'var(--ink-12)',
              }}
            />
          </div>
          {goalError && (
            <p id={goalErrorId} role="alert" style={errorText}>
              {goalError}
            </p>
          )}
        </Field>

        <Label>{t('fieldMediaDocs')}</Label>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
          <DropZone label={t('dropCover')} hint={t('dropCoverHint')} />
          <DropZone label={t('dropDocs')} hint={t('dropDocsHint')} />
        </div>

        {/* On-Chain Registry Metadata */}
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--ink-12)' }}>
          <h4 style={{ ...cardTitle, fontSize: 18, margin: '0 0 8px' }}>
            On-Chain Project Publishing
          </h4>
          <p style={{ ...subtle, margin: '0 0 16px', fontSize: 13 }}>
            Pin your project metadata to IPFS/HTTPS/Arweave and publish to the Soroban ProjectRegistry contract.
          </p>

          {/* Metadata URI */}
          <Field label="Metadata URI" htmlFor="hb-uri">
            <input
              id="hb-uri"
              type="text"
              placeholder="ipfs://... or https://... or ar://..."
              value={uri}
              onChange={(e) => {
                setUri(e.target.value)
                if (uriTouched) {
                  const check = validateMetadataUri(e.target.value)
                  setUriError(check.valid ? null : (check.error ?? 'Invalid URI'))
                }
              }}
              onBlur={() => {
                setUriTouched(true)
                const check = validateMetadataUri(uri)
                setUriError(check.valid ? null : (check.error ?? 'Invalid URI'))
              }}
              aria-invalid={uriError != null}
              aria-describedby={uriError ? uriErrorId : undefined}
              style={{
                ...inputStyle,
                borderColor: uriError ? 'var(--ember)' : 'var(--ink-12)',
              }}
            />
            {uriError && (
              <p id={uriErrorId} role="alert" style={errorText}>
                {uriError}
              </p>
            )}
            <p style={{ ...hintText, margin: '6px 0 0' }}>
              Must start with <code>ipfs://</code>, <code>https://</code>, or <code>ar://</code> (8 to 512 characters).
            </p>
          </Field>

          {/* Maturity Date (Optional) */}
          <Field label="Maturity Date (Optional)" htmlFor="hb-maturity">
            <input
              id="hb-maturity"
              type="date"
              value={maturityDate}
              onChange={(e) => {
                setMaturityDate(e.target.value)
                if (e.target.value) {
                  const ts = Math.floor(new Date(e.target.value).getTime() / 1000)
                  const check = validateMaturityDate(ts)
                  setMaturityError(check.valid ? null : (check.error ?? 'Invalid date'))
                } else {
                  setMaturityError(null)
                }
              }}
              aria-invalid={maturityError != null}
              aria-describedby={maturityError ? maturityErrorId : undefined}
              style={{
                ...inputStyle,
                borderColor: maturityError ? 'var(--ember)' : 'var(--ink-12)',
              }}
            />
            {maturityError && (
              <p id={maturityErrorId} role="alert" style={errorText}>
                {maturityError}
              </p>
            )}
            <p style={{ ...hintText, margin: '6px 0 0' }}>
              Leave blank for open-ended bond projects, or select a date in the future.
            </p>
          </Field>

          {/* Canonical JSON & SHA-256 Hash */}
          <div
            style={{
              marginTop: 16,
              padding: '16px',
              borderRadius: 'var(--radius-input)',
              background: 'var(--ink-06)',
              border: '1px solid var(--ink-12)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)' }}>Canonical Metadata JSON</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadMetadata}
                type="button"
              >
                Download metadata.json
              </Button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 12, color: 'var(--ink-60)' }}>SHA-256 Metadata Hash:</span>
              <code
                style={{
                  fontFamily: 'var(--font-data, monospace)',
                  fontSize: 12,
                  wordBreak: 'break-all',
                  padding: '6px 10px',
                  background: 'var(--surface)',
                  borderRadius: 6,
                  border: '1px solid var(--ink-12)',
                  color: 'var(--ink)',
                }}
              >
                {metadataHash || 'Computing...'}
              </code>
            </div>
          </div>

          {/* Not Whitelisted Message */}
          {notWhitelisted && (
            <div
              role="alert"
              style={{
                marginTop: 16,
                padding: '14px 16px',
                borderRadius: 'var(--radius-input)',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid var(--ember, #ef4444)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--ember, #ef4444)' }}>
                Wallet Not Whitelisted
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-80)' }}>
                Your connected wallet is not whitelisted by the registry oracle. You must be an approved creator to publish projects on-chain.
              </p>
              <div>
                <a
                  href="/creator?tab=apply"
                  style={{
                    display: 'inline-block',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--solar, #f59e0b)',
                    textDecoration: 'underline',
                  }}
                >
                  Apply for Creator Whitelist →
                </a>
              </div>
            </div>
          )}

          {/* General Publish Error */}
          {publishError && !notWhitelisted && (
            <div
              role="alert"
              style={{
                marginTop: 16,
                padding: '12px 14px',
                borderRadius: 'var(--radius-input)',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid var(--ember, #ef4444)',
                color: 'var(--ember, #ef4444)',
                fontSize: 13,
              }}
            >
              {publishError}
            </div>
          )}

          {/* Success Banner */}
          {publishResult && (
            <div
              role="status"
              style={{
                marginTop: 16,
                padding: '16px',
                borderRadius: 'var(--radius-input)',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid var(--green, #10b981)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--green, #10b981)', fontSize: 15 }}>
                🎉 Project Published On-Chain!
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)' }}>
                Successfully created in <strong>ProjectRegistry</strong> with ID <strong>#{publishResult.projectId}</strong>.
              </p>
              {publishResult.hash && (
                <div style={{ fontSize: 12 }}>
                  <a
                    href={getExplorerTxUrl(publishResult.hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--solar, #f59e0b)', textDecoration: 'underline' }}
                  >
                    View Transaction on Stellar Explorer ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Publish Action Button */}
          <div style={{ marginTop: 20 }}>
            {!wallet.connected ? (
              <Button
                variant="primary"
                size="md"
                onClick={() => wallet.connect()}
                style={{ width: '100%' }}
                type="button"
              >
                Connect Wallet to Publish
              </Button>
            ) : (
              <Button
                variant="primary"
                size="md"
                loading={isPublishing}
                disabled={isPublishing}
                onClick={handlePublish}
                style={{ width: '100%' }}
                type="button"
              >
                Publish to Registry
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Right — the live preview */}
      <div
        aria-live="polite"
        aria-atomic="true"
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
          <span style={labelText}>{t('previewLabel')}</span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--ink-60)' }}>
            {t('previewSub')}
          </span>
        </div>

        <ProjectCard
          name={debouncedName || 'Your project name'}
          location={debouncedLocation || 'Add a location'}
          credit={0}
          green={0}
          funded={debouncedGoalLabel}
          fundedLabel={t('dashFunding')}
          verifiedLabel={t('pendingVerified')}
        />

        <p style={{ ...subtle, margin: 0 }}>{t('previewPending', { type: debouncedType })}</p>
      </div>
    </div>
  )
}

function DropZone({
  label,
  hint,
  accept,
  multiple = false,
}: {
  label: string
  hint: string
  accept?: string
  multiple?: boolean
}) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const [isFocused, setIsFocused] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState('')

  return (
    <label
      htmlFor={inputId}
      style={{
        position: 'relative',
        border: '1px dashed var(--ink-12)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--ink-06)',
        padding: '20px 16px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
        outline: isFocused ? '2px solid var(--solar)' : 'none',
        outlineOffset: 3,
      }}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        aria-describedby={hintId}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          setSelectedFiles(
            files.length === 0
              ? ''
              : files.length === 1
                ? files[0].name
                : `${files.length} files selected`,
          )
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
        }}
      />
      <UploadIcon style={{ color: 'var(--ink)' }} />
      <div style={labelText}>{label}</div>
      <div id={hintId} style={hintText}>
        {selectedFiles || hint}
      </div>
    </label>
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
    <div style={fieldSpacing}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} style={fieldLabel}>
      {children}
    </label>
  )
}
