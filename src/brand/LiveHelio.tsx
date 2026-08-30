'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Helio, type HelioProps } from './Helio'
import { ErrorBoundary } from '../components/ErrorBoundary'

// The live WebGL orb is heavy and browser-only — load it lazily, never on the
// server. The static <Helio> stays mounted underneath until the WebGL canvas has
// actually painted its first frame (onReady), then we cross-fade — so there's
// never a blank frame, and no-WebGL / reduced-motion simply keep the static orb.
const HelioWebGL = dynamic(() => import('./HelioWebGL'), { ssr: false, loading: () => null })

/**
 * Live WebGL Helio with the static accessible SVG orb as its always-present
 * fallback. Used at the landing hero (the one place the brief grants the full
 * spectacle); the smaller portfolio / success orbs stay static by design.
 *
 * Props: same as `HelioProps` (`size`, `motes`, `breathe`), plus `intensity`
 * (vault fullness 0..1 — see `HelioWebGLProps.intensity`), forwarded straight
 * through to both the static `<Helio>` and the live `<HelioWebGL>`.
 *
 * Static-to-live fallback: the static `<Helio>` renders immediately (and is
 * what SSR produces) and stays visible — at full opacity, `live` starts
 * `false` — until `HelioWebGL` reports its first painted frame via `onReady`,
 * at which point the live canvas fades in over 600ms while the static orb is
 * unmounted underneath. `ErrorBoundary` falls back to `<Helio>` if the WebGL
 * canvas throws.
 *
 * Reduced-motion / no-WebGL: `HelioWebGL` is loaded with `ssr: false` and,
 * once mounted, probes for both WebGL support and `prefers-reduced-motion`.
 * With no WebGL it renders `null` outright; with reduced motion it still
 * renders the canvas but disables `useFrame` animation (see `HelioWebGL`'s own
 * "Robustness contract"). In the no-WebGL case `onReady` is never called, so
 * `live` never flips to `true` and the static `<Helio>` simply remains the
 * permanent, non-animated (per `app.css`'s `prefers-reduced-motion` rule)
 * display — no broken cross-fade, no blank frame.
 */
export function LiveHelio(props: HelioProps & { intensity?: number }) {
  const [live, setLive] = useState(false)

  return (
    <div style={{ position: 'relative', width: props.size, height: props.size }}>
      {/* Static base — shown until the WebGL orb paints. If WebGL is absent or
          reduced-motion / SSR, HelioWebGL never fires onReady so this just stays. */}
      {!live && <Helio {...props} />}

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: live ? 1 : 0,
          transition: 'opacity 600ms var(--ease-out)',
        }}
      >
        <ErrorBoundary fallback={<Helio {...props} />}>
          <HelioWebGL {...props} onReady={() => setLive(true)} />
        </ErrorBoundary>
      </div>
    </div>
  )
}
