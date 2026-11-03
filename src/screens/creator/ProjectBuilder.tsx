'use client'

import { useId, useMemo, useState, useEffect, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
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
  warningBoxStyle,
  warningTextStyle,
} from '@/theme'
import { PROJECT_TYPES, DRAFT_PROJECT, type ProjectType } from '@/data/creator'
import { formatMoney } from '@/lib/format'
import { parseMoneyInput } from '@/lib/moneyInput'
import { translateContractError } from '@/lib/contractErrors'
import { getExplorerTxUrl } from '@/config/network'
import { useWallet } from '@/wallet/WalletProvider'
import {
  CreateProjectError,
  METADATA_URI_MAX_LENGTH,
  METADATA_URI_MIN_LENGTH,
  computeMetadataHash,
  maturityDateToUnixSeconds,
  metadataHashHex,
  serializeProjectMetadata,
  simulateCreateProject,
  submitCreateProject,
  validateMaturityDate,
  validateMetadataUri,
  type CreateProjectProblem,
} from '@/wallet/createProject'

/**
 * Largest funding goal a creator can enter (USD). At this bound the goal in
 * Stellar's 7-decimal units (1e15) is still exact as a JS number (#869).
 */
const MAX_FUNDING_GOAL_USD = 100_000_000

/** Keeps the live preview, and its aria-live announcement, close behind typing. */
const PREVIEW_DEBOUNCE_MS = 250

type PublishState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'published'; projectId: number; hash: string }
  | { status: 'error'; problem: CreateProjectProblem; error: unknown }

export interface ProjectBuilderProps {
  /** Switch the Creator space to the Apply tab (#697). */
  onApply?: () => void
}

/**
 * ProjectBuilder — the off-chain metadata builder. The form on the left writes
 * straight into a live ProjectCard preview on the right, so a creator sees the
 * exact card investors will see while they type. Scores read "pending" until the
 * oracle verifies, so the preview never implies a number we have not earned yet.
 *
 * Below the preview, the publish step turns that metadata into a canonical JSON
 * document, hashes it, and calls ProjectRegistry.create_project. The client
 * repeats the contract's URI and maturity rules before any signature is asked
 * for, and a non-whitelisted wallet is sent to the Apply tab instead (#697).
 */
export function ProjectBuilder({ onApply }: ProjectBuilderProps = {}) {
  const t = useTranslations('Creator')
  const tContract = useTranslations('ContractErrors')
  const locale = useLocale()
  const { address, sign } = useWallet()

  const [name, setName] = useState(DRAFT_PROJECT.name)
  const [location, setLocation] = useState(DRAFT_PROJECT.location)
  const [type, setType] = useState<ProjectType>(DRAFT_PROJECT.type)
  const [story, setStory] = useState(DRAFT_PROJECT.story)
  const [fundingGoal, setFundingGoal] = useState(String(DRAFT_PROJECT.fundingGoal))
  const [metadataUri, setMetadataUri] = useState('')
  const [uriTouched, setUriTouched] = useState(false)
  const [maturity, setMaturity] = useState('')
  const [maturityTouched, setMaturityTouched] = useState(false)
  const [metadataHash, setMetadataHash] = useState<{ json: string; hash: Uint8Array } | null>(null)
  const [hashUnavailable, setHashUnavailable] = useState(false)
  const [publish, setPublish] = useState<PublishState>({ status: 'idle' })
  const goalErrorId = useId()
  const uriErrorId = useId()
  const maturityErrorId = useId()

  const goal = parseMoneyInput(fundingGoal, locale)
  const goalError =
    goal === null || goal <= 0
      ? t('goalInvalid')
      : goal > MAX_FUNDING_GOAL_USD
        ? t('goalTooLarge', { max: formatMoney(MAX_FUNDING_GOAL_USD) })
        : null
  const goalLabel =
    goal === null || goalError
      ? t('awaitingFunding')
      : t('fundingLabel', { goal: formatMoney(goal) })

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
    }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(handler)
  }, [name, location, goalLabel, type])

  const uriProblem = validateMetadataUri(metadataUri)
  const maturitySeconds = maturity ? maturityDateToUnixSeconds(maturity) : 0
  const maturityProblem =
    maturitySeconds === null ? 'invalid' : validateMaturityDate(maturitySeconds)
  const showUriError = uriTouched && uriProblem !== null
  const showMaturityError = maturityTouched && maturityProblem !== null

  const uriErrorMessage =
    uriProblem === 'tooShort'
      ? t('uriTooShort', { min: METADATA_URI_MIN_LENGTH })
      : uriProblem === 'tooLong'
        ? t('uriTooLong', { max: METADATA_URI_MAX_LENGTH })
        : uriProblem === 'invalidScheme'
          ? t('uriInvalidScheme')
          : null

  const maturityErrorMessage =
    maturityProblem === 'invalid'
      ? t('maturityInvalid')
      : maturityProblem === 'inPast'
        ? t('maturityInPast')
        : null

  // The exact bytes a creator pins, and the hash the registry will compare them to.
  const metadataJson = useMemo(
    () =>
      serializeProjectMetadata({
        name,
        location,
        type,
        story,
        fundingGoal: goal !== null && !goalError ? goal : 0,
      }),
    [name, location, type, story, goal, goalError],
  )

  useEffect(() => {
    let cancelled = false
    computeMetadataHash(metadataJson).then(
      (hash) => {
        if (cancelled) return
        setMetadataHash({ json: metadataJson, hash })
        setHashUnavailable(false)
      },
      () => {
        if (cancelled) return
        setMetadataHash(null)
        setHashUnavailable(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [metadataJson])

  // Never submit a hash computed for an older version of the form.
  const currentHash = metadataHash?.json === metadataJson ? metadataHash.hash : null

  const canPublish =
    address !== null &&
    goal !== null &&
    !goalError &&
    uriProblem === null &&
    maturityProblem === null &&
    currentHash !== null &&
    publish.status !== 'pending'

  const publishBlockedReason = !address
    ? t('publishConnectReason')
    : goalError
      ? goalError
      : uriProblem
        ? (uriErrorMessage ?? t('publishUriRejected'))
        : maturityProblem
          ? (maturityErrorMessage ?? t('publishMaturityRejected'))
          : hashUnavailable
            ? t('metadataHashUnavailable')
            : currentHash === null
              ? t('metadataHashPending')
              : undefined

  const downloadMetadata = () => {
    if (typeof URL.createObjectURL !== 'function') return
    const blob = new Blob([metadataJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'project'
    }-metadata.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const handlePublish = async () => {
    if (!canPublish || !address || !currentHash || maturitySeconds === null) return

    setPublish({ status: 'pending' })
    try {
      // Preflight first: a wallet that isn't whitelisted must never see a
      // signing prompt, and URI/maturity rejections stay inline.
      await simulateCreateProject(address, metadataUri, maturitySeconds, currentHash)
      const created = await submitCreateProject(
        address,
        metadataUri,
        maturitySeconds,
        currentHash,
        sign,
      )
      setPublish({ status: 'published', ...created })
    } catch (error) {
      setPublish({
        status: 'error',
        problem: error instanceof CreateProjectError ? error.problem : 'contract',
        error,
      })
    }
  }

  return (
    <>
      <div className="hb-builder-grid">
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
                onChange={(e) => setFundingGoal(e.target.value)}
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

          <Field label={t('fieldMetadataUri')} htmlFor="hb-uri">
            <input
              id="hb-uri"
              type="url"
              value={metadataUri}
              placeholder="ipfs://bafy…/project.json"
              onChange={(e) => setMetadataUri(e.target.value)}
              onBlur={() => setUriTouched(true)}
              aria-invalid={showUriError}
              aria-describedby={showUriError ? uriErrorId : undefined}
              style={{
                ...inputStyle,
                borderColor: showUriError ? 'var(--ember)' : 'var(--ink-12)',
              }}
            />
            <p style={{ ...hintText, margin: '6px 0 0' }}>{t('fieldMetadataUriHint')}</p>
            {showUriError && uriErrorMessage && (
              <p id={uriErrorId} role="alert" style={errorText}>
                {uriErrorMessage}
              </p>
            )}
          </Field>

          <Field label={t('fieldMaturity')} htmlFor="hb-maturity">
            <input
              id="hb-maturity"
              type="date"
              value={maturity}
              onChange={(e) => setMaturity(e.target.value)}
              onBlur={() => setMaturityTouched(true)}
              aria-invalid={showMaturityError}
              aria-describedby={showMaturityError ? maturityErrorId : undefined}
              style={{
                ...inputStyle,
                borderColor: showMaturityError ? 'var(--ember)' : 'var(--ink-12)',
              }}
            />
            <p style={{ ...hintText, margin: '6px 0 0' }}>{t('fieldMaturityHint')}</p>
            {showMaturityError && maturityErrorMessage && (
              <p id={maturityErrorId} role="alert" style={errorText}>
                {maturityErrorMessage}
              </p>
            )}
          </Field>

          <Label>{t('fieldMediaDocs')}</Label>
          <div className="hb-builder-drops">
            <DropZone label={t('dropCover')} hint={t('dropCoverHint')} />
            <DropZone label={t('dropDocs')} hint={t('dropDocsHint')} />
          </div>
        </Card>

        {/* Right — the live preview */}
        <div
          className="hb-builder-preview"
          aria-live="polite"
          aria-atomic="true"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
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
            <span
              style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--ink-60)' }}
            >
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

      {/* Publish step */}
      <Card style={{ marginTop: 20 }}>
        <h3 style={cardTitle}>{t('publishTitle')}</h3>
        <p style={{ ...subtle, margin: '0 0 16px' }}>{t('publishSub')}</p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 16,
          }}
        >
          <span style={labelText}>{t('metadataHashLabel')}</span>
          <code
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 12.5,
              color: 'var(--ink-70)',
              wordBreak: 'break-all',
            }}
          >
            {currentHash
              ? metadataHashHex(currentHash)
              : hashUnavailable
                ? t('metadataHashUnavailable')
                : t('metadataHashPending')}
          </code>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <Button variant="secondary" size="sm" onClick={downloadMetadata}>
            {t('downloadMetadata')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handlePublish}
            disabled={!canPublish}
            reason={publishBlockedReason}
          >
            {publish.status === 'pending' ? t('publishing') : t('publishCta')}
          </Button>
        </div>

        {publish.status === 'error' && (
          <div role="alert" style={warningBoxStyle}>
            <p style={warningTextStyle}>
              {publish.problem === 'notWhitelisted'
                ? t('publishNotWhitelisted')
                : publish.problem === 'uri'
                  ? t('publishUriRejected')
                  : publish.problem === 'maturity'
                    ? t('publishMaturityRejected')
                    : (translateContractError(publish.error, tContract, {
                        source: 'registry',
                      }) ?? t('publishFailed'))}
            </p>
            {publish.problem === 'notWhitelisted' && onApply && (
              <Button variant="secondary" size="sm" onClick={onApply} style={{ marginTop: 10 }}>
                {t('publishGoApply')}
              </Button>
            )}
          </div>
        )}

        {publish.status === 'published' && (
          <div
            role="status"
            style={{
              marginTop: 10,
              padding: '10px 14px',
              borderRadius: 'var(--radius-input)',
              background: 'var(--solar-12)',
              border: '1px solid var(--solar)',
            }}
          >
            <p style={{ ...subtle, margin: 0 }}>
              {t('publishSuccess', { id: publish.projectId })}{' '}
              <a
                href={getExplorerTxUrl(publish.hash)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--ink)', fontWeight: 600 }}
              >
                {t('publishViewTx')}
              </a>
            </p>
          </div>
        )}
      </Card>
    </>
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
