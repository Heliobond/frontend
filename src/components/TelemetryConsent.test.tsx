import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@/test/render'
import userEvent from '@testing-library/user-event'
import { TelemetryConsent, TelemetryPreference } from './TelemetryConsent'
import { TELEMETRY_CONSENT_KEY, readTelemetryConsent } from '../lib/errorReporting'
import { isTelemetryAllowed, setTelemetryConsent } from '../lib/telemetryConsent'

const banner = () => screen.queryByTestId('telemetry-consent')

describe('TelemetryConsent (#658)', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for a choice on a first visit and hides itself once answered', async () => {
    const user = userEvent.setup()
    render(<TelemetryConsent />)

    const region = await screen.findByTestId('telemetry-consent')
    expect(region).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /allow/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /no thanks/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /allow/i }))
    expect(localStorage.getItem(TELEMETRY_CONSENT_KEY)).toBe('granted')
    await waitFor(() => expect(banner()).not.toBeInTheDocument())
  })

  it('persists a decline', async () => {
    const user = userEvent.setup()
    render(<TelemetryConsent />)

    await user.click(await screen.findByRole('button', { name: /no thanks/i }))
    expect(readTelemetryConsent()).toBe('denied')
    await waitFor(() => expect(banner()).not.toBeInTheDocument())
  })

  it('stays hidden for a returning visitor who already chose', async () => {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, 'granted')
    render(<TelemetryConsent />)

    // Nothing is asked on mount; the assertion waits for the effect that reads
    // localStorage to have run.
    await waitFor(() => expect(banner()).not.toBeInTheDocument())
  })
})

describe('TelemetryConsent with storage unavailable (#1072)', () => {
  const blockStorage = (writes: boolean, reads = false) => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      if (writes) throw new DOMException('blocked', 'SecurityError')
    })
    if (reads) {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError')
      })
    }
  }
  beforeEach(() => {
    localStorage.clear()
    setTelemetryConsent(null)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    setTelemetryConsent(null)
  })

  it('dismisses the banner on Decline for the visit and keeps telemetry off', async () => {
    blockStorage(true)
    const user = userEvent.setup()
    render(<TelemetryConsent />)

    await user.click(await screen.findByRole('button', { name: /no thanks/i }))
    await waitFor(() => expect(banner()).not.toBeInTheDocument())
    expect(readTelemetryConsent()).toBe('denied')
    expect(isTelemetryAllowed()).toBe(false)
  })

  it('also works when reads throw as well as writes', async () => {
    blockStorage(true, true)
    const user = userEvent.setup()
    render(<TelemetryConsent />)

    await user.click(await screen.findByRole('button', { name: /no thanks/i }))
    await waitFor(() => expect(banner()).not.toBeInTheDocument())
    expect(isTelemetryAllowed()).toBe(false)
  })

  it('does not honour an accept that could not be saved', async () => {
    blockStorage(true)
    const user = userEvent.setup()
    render(<TelemetryConsent />)

    await user.click(await screen.findByRole('button', { name: /allow/i }))
    expect(readTelemetryConsent()).toBeNull()
    expect(isTelemetryAllowed()).toBe(false)
  })

  it('does not let a stale in-memory choice shadow working storage', () => {
    blockStorage(true)
    setTelemetryConsent('denied')
    vi.restoreAllMocks()

    setTelemetryConsent('granted')
    expect(localStorage.getItem(TELEMETRY_CONSENT_KEY)).toBe('granted')
    localStorage.removeItem(TELEMETRY_CONSENT_KEY)
    expect(readTelemetryConsent()).toBeNull()
  })

  it('still persists across reloads when storage works', async () => {
    const user = userEvent.setup()
    const first = render(<TelemetryConsent />)
    await user.click(await screen.findByRole('button', { name: /no thanks/i }))
    first.unmount()

    render(<TelemetryConsent />)
    await waitFor(() => expect(banner()).not.toBeInTheDocument())
    expect(localStorage.getItem(TELEMETRY_CONSENT_KEY)).toBe('denied')
  })
})

describe('TelemetryPreference (#658)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reports the undecided state before a choice and opens the banner', async () => {
    const user = userEvent.setup()
    render(
      <>
        <TelemetryPreference />
        <TelemetryConsent />
      </>,
    )

    const control = await screen.findByTestId('telemetry-preference')
    expect(control).toHaveTextContent(/not set/i)

    await user.click(control)
    expect(await screen.findByTestId('telemetry-consent')).toBeInTheDocument()
  })

  it('reflects a granted choice and lets the visitor change it', async () => {
    const user = userEvent.setup()
    localStorage.setItem(TELEMETRY_CONSENT_KEY, 'granted')
    render(
      <>
        <TelemetryPreference />
        <TelemetryConsent />
      </>,
    )

    const control = await screen.findByTestId('telemetry-preference')
    await waitFor(() => expect(control).toHaveTextContent(/allowed/i))
    expect(banner()).not.toBeInTheDocument()

    await user.click(control)
    expect(await screen.findByTestId('telemetry-consent')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /no thanks/i }))
    await waitFor(() => expect(control).toHaveTextContent(/off/i))
    expect(readTelemetryConsent()).toBe('denied')
  })

  it('reports a declined choice as off even when no telemetry is sent', async () => {
    localStorage.setItem(TELEMETRY_CONSENT_KEY, 'denied')
    render(<TelemetryPreference />)
    const control = await screen.findByTestId('telemetry-preference')
    await waitFor(() => expect(control).toHaveTextContent(/off/i))
  })
})
