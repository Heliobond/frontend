export const TELEMETRY_CONSENT_KEY = 'hb-telemetry-consent'

export type TelemetryConsent = 'granted' | 'denied'

/**
 * A decline for this visit that could not be persisted (storage blocked or
 * full). Only ever `'denied'`: consent to collect data must be durable to count,
 * so an unsaved grant is not honoured, but an unsaved decline is, which
 * keeps telemetry off and lets the banner dismiss. Only set while a write has
 * failed, so it never shadows real storage.
 */
let unsavedConsent: 'denied' | null = null

/** The visitor's recorded choice, or `null` when they haven't chosen yet. */
export function readTelemetryConsent(): TelemetryConsent | null {
  try {
    const value = localStorage.getItem(TELEMETRY_CONSENT_KEY)
    if (value === 'granted' || value === 'denied') return value
  } catch {
    /* storage unavailable — fall through to the in-memory choice */
  }
  return unsavedConsent
}

/**
 * Record the visitor's telemetry choice. `null` clears the choice so the
 * consent banner asks again on the next visit.
 */
export function setTelemetryConsent(consent: TelemetryConsent | null): void {
  try {
    if (consent === null) localStorage.removeItem(TELEMETRY_CONSENT_KEY)
    else localStorage.setItem(TELEMETRY_CONSENT_KEY, consent)
    unsavedConsent = null
  } catch {
    // Storage unavailable: remember a decline for this visit (it won't survive
    // a reload). Anything else is dropped, as before.
    unsavedConsent = consent === 'denied' ? consent : null
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TELEMETRY_CONSENT_EVENT))
}

/** Fired on `window` whenever the recorded choice changes, same tab or another. */
export const TELEMETRY_CONSENT_EVENT = 'hb-telemetry-consent-change'

/**
 * False unless the visitor explicitly granted consent, and always false on
 * the server or when the browser sends Do-Not-Track / Global Privacy Control.
 */
export function isTelemetryAllowed(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string }
  const dnt = nav.doNotTrack ?? nav.msDoNotTrack ?? (window as { doNotTrack?: string }).doNotTrack
  if (dnt === '1' || dnt === 'yes') return false
  if (nav.globalPrivacyControl === true) return false
  return readTelemetryConsent() === 'granted'
}
