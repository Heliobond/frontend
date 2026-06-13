'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Helio, type HelioProps } from './Helio'

// The live WebGL orb is heavy and browser-only — load it lazily, never on the
// server. The static <Helio> stays mounted underneath until the WebGL canvas has
// actually painted its first frame (onReady), then we cross-fade — so there's
// never a blank frame, and no-WebGL / reduced-motion simply keep the static orb.
const HelioWebGL = dynamic(() => import('./HelioWebGL'), { ssr: false, loading: () => null })

/**
 * Live WebGL Helio with the static accessible SVG orb as its always-present
 * fallback. Used at the landing hero (the one place the brief grants the full
 * spectacle); the smaller portfolio / success orbs stay static by design.
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
        <HelioWebGL {...props} onReady={() => setLive(true)} />
      </div>
    </div>
  )
}
