'use client'

import { useId, useState, useEffect, useMemo, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { ProjectCard, Tag, Card, Button, UploadIcon } from '@/components'
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
import { parseMoneyInput } from '@/lib/moneyInput'
import { getExplorerTxUrl } from '@/config/network'
import { useWallet } from '@/wallet/WalletProvider'
import { getSession } from '@/wallet/session'
import {
  validateProjectUri,
  validateMaturityDate,
  serializeProjectMetadata,
  computeProjectMetadataHash,
  computeSha256Sync,
  submitCreateProject,
  RegistryCreateProjectError,
  SIMULATION_SOURCE_ADDRESS,
  type ProjectUriError,
  type CreateProjectResult,
} from '@/wallet/registry'

/**
 * Largest funding goal a creator can enter (USD). At this bound the goal in
 * Stellar's 7-decimal units (1e15) is still exact as a JS number (#869).
 */
const MAX_FUNDING_GOAL_USD = 100_000_000

/** Keeps the live preview, and its aria-live announcement, close behind typing. */
const PREVIEW_DEBOUNCE_MS = 250

export interface ProjectBuilderProps {
  /** Callback to switch the creator page to the Apply tab when the wallet is not whitelisted. */
  onNavigateToApply?: () => void
  /** Optional wallet address override (defaults to connected wallet from useWallet). */
  walletAddress?: string | null
  /** Optional transaction signer override (defaults to sign from useWallet). */
  signTransaction?: (xdr: string) => Promise<string>
  /** Optional hook invoked when the creator downloads the canonical metadata JSON. */
  onDownloadMetadata?: (json: string, metadataHash: string) => void
}

function useOptionalWallet() {
  try {
    return useWallet()
  } catch {
    return null
  }
}

/**
 * ProjectBuilder — the off-chain metadata builder. The form on the left writes
 * straight into a live ProjectCard preview on the right, so a creator sees the
 * exact card investors will see while they type. Scores read "pending" until the
 * oracle verifies, so the preview never implies a number we have not earned yet.
 */
export function ProjectBuilder({
  onNavigateToApply,
  walletAddress,
  signTransaction,
  onDownloadMetadata,
}: ProjectBuilderProps = {}) {
  const t = useTranslations('Creator')
  const tContractErrors = useTranslations('ContractErrors')
  const tErrors = useTranslations('Errors')
  const locale = useLocale()
  const wallet = useOptionalWallet()

  const [name, setName] = useState(DRAFT_PROJECT.name)
  const [location, setLocation] = useState(DRAFT_PROJECT.location)
  const [type, setType] = useState<ProjectType>(DRAFT_PROJECT.type)
  const [story, setStory] = useState(DRAFT_PROJECT.story)
  const [fundingGoal, setFundingGoal] = useState(String(DRAFT_PROJECT.fundingGoal))
  const [metadataUri, setMetadataUri] = useState('')
  const [uriTouched, setUriTouched] = useState(false)
  const [maturityDate, setMaturityDate] = useState('')
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [simulatedUriError, setSimulatedUriError] = useState<ProjectUriError | null>(null)
  const [simulatedMaturityError, setSimulatedMaturityError] = useState(false)
  const [notWhitelisted, setNotWhitelisted] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishedResult, setPublishedResult] = useState<CreateProjectResult | null>(null)

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

  const canonicalGoal = goal !== null && !goalError ? goal : DRAFT_PROJECT.fundingGoal
  const metadataJson = useMemo(
    () =>
      serializeProjectMetadata({
        name,
        location,
        type,
        story,
        fundingGoal: canonicalGoal,
      }),
    [name, location, type, story, canonicalGoal],
  )

  const syncMetadataHash = useMemo(() => computeSha256Sync(metadataJson), [metadataJson])
  const [subtleOverrideHash, setSubtleOverrideHash] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void computeProjectMetadataHash(metadataJson).then((computed) => {
      if (!cancelled && computed && computed !== syncMetadataHash) {
        setSubtleOverrideHash(computed)
      }
    })
    return () => {
      cancelled = true
    }
  }, [metadataJson, syncMetadataHash])

  const metadataHash = subtleOverrideHash ?? syncMetadataHash

  const uriValidation = validateProjectUri(metadataUri)
  const activeUriErrorCode: ProjectUriError | null =
    simulatedUriError ??
    ((uriTouched || submitAttempted) && !uriValidation.valid ? uriValidation.error : null)
  const uriError =
    activeUriErrorCode === 'UriTooShort'
      ? t('uriErrorTooShort')
      : activeUriErrorCode === 'UriTooLong'
        ? t('uriErrorTooLong')
        : activeUriErrorCode === 'InvalidUriScheme'
          ? t('uriErrorInvalidScheme')
          : null

  const maturityValidation = validateMaturityDate(maturityDate)
  const maturityError =
    simulatedMaturityError || !maturityValidation.valid ? t('maturityErrorInPast') : null

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

  function handleDownloadMetadata() {
    onDownloadMetadata?.(metadataJson, metadataHash)
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return
    try {
      const blob = new Blob([metadataJson], { type: 'application/json' })
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = 'project-metadata.json'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        if (typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(url)
        }
      }
    } catch {
      /* ignore DOM download errors in headless test environments */
    }
  }

  async function handlePublish() {
    setSubmitAttempted(true)
    setSimulatedUriError(null)
    setSimulatedMaturityError(false)
    setNotWhitelisted(false)
    setPublishError(null)
    setPublishedResult(null)

    const currentUriCheck = validateProjectUri(metadataUri)
    const currentMaturityCheck = validateMaturityDate(maturityDate)
    if (
      goalError ||
      !currentUriCheck.valid ||
      !currentMaturityCheck.valid ||
      !name.trim() ||
      !location.trim()
    ) {
      return
    }

    const sessionAddr = typeof window !== 'undefined' ? getSession().address : ''
    const resolvedCreator =
      walletAddress !== undefined
        ? walletAddress
        : wallet
          ? wallet.address
          : sessionAddr || SIMULATION_SOURCE_ADDRESS

    if (!resolvedCreator) {
      setPublishError(t('publishWalletRequired'))
      return
    }

    const resolvedSign =
      signTransaction ?? (wallet ? (xdr: string) => wallet.sign(xdr) : async (xdr: string) => xdr)

    setPublishing(true)
    try {
      const computedHash = (await computeProjectMetadataHash(metadataJson)) ?? metadataHash
      const result = await submitCreateProject({
        creator: resolvedCreator,
        uri: currentUriCheck.uri,
        maturityDate: currentMaturityCheck.maturityDate,
        metadataHash: computedHash,
        sign: resolvedSign,
      })
      setPublishedResult(result)
    } catch (err) {
      if (err instanceof RegistryCreateProjectError) {
        if (err.code === 'NotWhitelisted') {
          setNotWhitelisted(true)
        } else if (
          err.code === 'UriTooShort' ||
          err.code === 'UriTooLong' ||
          err.code === 'InvalidUriScheme'
        ) {
          setSimulatedUriError(err.code)
        } else if (err.code === 'MaturityDateInPast') {
          setSimulatedMaturityError(true)
        } else if (err.code === 'WalletNotConnected') {
          setPublishError(t('publishWalletRequired'))
        } else if (err.code === 'Paused') {
          setPublishError(tContractErrors('registry_Paused'))
        } else {
          setPublishError(tErrors('simulationFailed'))
        }
      } else {
        setPublishError(tErrors('simulationFailed'))
      }
    } finally {
      setPublishing(false)
    }
  }

  return (
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

        <Field label={t('fieldMetadataUri')} htmlFor="hb-metadata-uri">
          <input
            id="hb-metadata-uri"
            type="url"
            inputMode="url"
            placeholder="ipfs://..."
            value={metadataUri}
            onChange={(e) => {
              setMetadataUri(e.target.value)
              setUriTouched(true)
              if (simulatedUriError) setSimulatedUriError(null)
            }}
            aria-invalid={uriError != null}
            aria-describedby={uriError ? uriErrorId : undefined}
            style={{
              ...inputStyle,
              fontFamily: 'var(--font-data)',
              borderColor: uriError ? 'var(--ember)' : 'var(--ink-12)',
            }}
          />
          <p style={{ ...hintText, margin: '6px 0 0' }}>{t('metadataUriHint')}</p>
          {uriError && (
            <p id={uriErrorId} role="alert" style={errorText}>
              {uriError}
            </p>
          )}
        </Field>

        <Field label={t('fieldMaturityDate')} htmlFor="hb-maturity-date">
          <input
            id="hb-maturity-date"
            type="text"
            placeholder="YYYY-MM-DD"
            value={maturityDate}
            onChange={(e) => {
              setMaturityDate(e.target.value)
              if (simulatedMaturityError) setSimulatedMaturityError(false)
            }}
            aria-invalid={maturityError != null}
            aria-describedby={maturityError ? maturityErrorId : undefined}
            style={{
              ...inputStyle,
              fontFamily: 'var(--font-data)',
              borderColor: maturityError ? 'var(--ember)' : 'var(--ink-12)',
            }}
          />
          <p style={{ ...hintText, margin: '6px 0 0' }}>{t('maturityDateHint')}</p>
          {maturityError && (
            <p id={maturityErrorId} role="alert" style={errorText}>
              {maturityError}
            </p>
          )}
        </Field>

        <div
          style={{
            ...fieldSpacing,
            padding: 12,
            borderRadius: 'var(--radius-card)',
            background: 'var(--ink-06)',
            border: '1px solid var(--ink-12)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span style={labelText}>{t('metadataHashLabel')}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadMetadata}
              data-metadata-json={metadataJson}
              data-metadata-hash={metadataHash}
            >
              {t('downloadMetadataJson')}
            </Button>
          </div>
          <code
            data-testid="metadata-hash"
            style={{
              fontFamily: 'var(--font-data)',
              fontSize: 12,
              color: 'var(--ink)',
              wordBreak: 'break-all',
            }}
          >
            {metadataHash}
          </code>
        </div>

        <Label>{t('fieldMediaDocs')}</Label>
        <div className="hb-builder-drops">
          <DropZone
            label={t('dropCover')}
            hint={t('dropCoverHint')}
            accept="image/png,image/jpeg"
          />
          <DropZone label={t('dropDocs')} hint={t('dropDocsHint')} accept=".pdf,.doc,.docx,.json" />
        </div>

        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button
            variant="primary"
            size="lg"
            loading={publishing}
            disabled={publishing}
            reason={t('publishReasonInvalid')}
            onClick={() => void handlePublish()}
            style={{ width: '100%' }}
          >
            {publishing ? t('publishingToRegistry') : t('publishToRegistry')}
          </Button>

          {notWhitelisted && (
            <div
              role="alert"
              style={{
                padding: 14,
                borderRadius: 'var(--radius-card)',
                background: 'var(--ember-12)',
                border: '1px solid var(--ember-24)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <p style={{ ...errorText, margin: 0 }}>{t('publishNotWhitelisted')}</p>
              <a
                href="/creator?tab=apply"
                onClick={(e) => {
                  if (onNavigateToApply) {
                    e.preventDefault()
                    onNavigateToApply()
                  }
                }}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-small)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                  textDecoration: 'underline',
                  alignSelf: 'flex-start',
                }}
              >
                {t('publishGoToApply')}
              </a>
            </div>
          )}

          {publishError && (
            <p role="alert" style={{ ...errorText, margin: 0 }}>
              {publishError}
            </p>
          )}

          {publishedResult && (
            <div
              role="status"
              style={{
                padding: 14,
                borderRadius: 'var(--radius-card)',
                background: 'var(--ink-06)',
                border: '1px solid var(--ink-12)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 'var(--type-small)',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              >
                {t('publishSuccessTitle', { id: publishedResult.projectId })}
              </div>
              {publishedResult.hash && (
                <a
                  href={getExplorerTxUrl(publishedResult.hash)}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontFamily: 'var(--font-data)',
                    fontSize: 'var(--type-caption)',
                    color: 'var(--ink-60)',
                    textDecoration: 'underline',
                    alignSelf: 'flex-start',
                  }}
                >
                  {t('publishViewExplorer')}
                </a>
              )}
            </div>
          )}
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
