'use client'

/**
 * HelioWebGL — the LIVE, breathing version of the Helio.
 *
 * This is the WebGL/R3F counterpart to the static SVG <Helio>. It renders a
 * soft luminous solar orb (warm core #FFF4D6→#FFD451→#FFB400→#F59A00), a faint
 * additive glow halo, and a corona of dark ink-colored motes (one per funded
 * project) slowly revolving around it. The sun breathes on a slow ~6s cycle,
 * turns calmly, and gently leans toward the pointer.
 *
 * Robustness contract:
 *   · Import-safe — no top-level `window`/`document` access. All browser reads
 *     live inside effects or inside the Canvas render (client-only).
 *   · prefers-reduced-motion → renders a fully STATIC orb (no useFrame work).
 *   · No WebGL support → renders `null` so the parent can show the static
 *     <Helio> fallback instead.
 *
 * aria-hidden decoration — every datum it encodes is present as text elsewhere.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { MeshDistortMaterial } from '@react-three/drei'
import * as THREE from 'three'

export interface HelioWebGLProps {
  /** Rendered size in px (square). */
  size?: number
  /** Number of corona motes — one per funded project. */
  motes?: number
  /** Vault fullness, 0..1. Subtly scales the orb's luminance + size. */
  intensity?: number
  /** Fired once the canvas has painted its first frame (used to cross-fade from the static fallback). */
  onReady?: () => void
}

/* --- Brand palette (matches the static Helio exactly) -------------------- */
const SOLAR = '#FFB400' // the sun — emissive accent
const CORE = '#FFD451' // warm core surface tint
const HALO = '#FFC633' // glow halo (sits between core and solar)
const INK = '#0B2B23' // deep pine — corona motes

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/* ------------------------------------------------------------------------- *
 * Deterministic corona layout — mirrors the static Helio's mote scatter so
 * the live and fallback orbs read as the same object. No Math.random.
 * ------------------------------------------------------------------------- */
interface MoteSpec {
  /* unit position on the orbit ring (z gives gentle depth) */
  base: THREE.Vector3
  /* per-mote orbit radius + revolve speed + size */
  radius: number
  speed: number
  scale: number
  phase: number
}

function buildMotes(count: number): MoteSpec[] {
  const out: MoteSpec[] = []
  const n = Math.max(0, Math.floor(count))
  for (let i = 0; i < n; i++) {
    // Angle + radius derived from index (same spirit as the SVG fallback).
    const a = (i / Math.max(1, n)) * Math.PI * 2 + i * 0.6
    const radius = 1.55 * (0.82 + ((i * 7) % 11) / 40)
    // A small deterministic tilt so motes don't all sit in one flat ring.
    const tilt = (((i * 5) % 7) / 7 - 0.5) * 0.7
    const base = new THREE.Vector3(
      Math.cos(a),
      Math.sin(a) * Math.cos(tilt),
      Math.sin(a) * Math.sin(tilt),
    )
    out.push({
      base,
      radius,
      speed: 0.12 + ((i * 3) % 5) / 60, // slow, varied revolve
      scale: 0.03 + ((i * 5) % 7) / 220,
      phase: i * 0.6,
    })
  }
  return out
}

/* ------------------------------------------------------------------------- *
 * The sun — soft-body distorted sphere with a warm emissive core.
 * ------------------------------------------------------------------------- */
function Sun({ animate, intensity }: { animate: boolean; intensity: number }) {
  const group = useRef<THREE.Group>(null)
  // The distort material is a MeshPhysicalMaterial subclass; ComponentRef gives
  // us the exact impl type (with emissiveIntensity from the standard-material chain).
  const mat = useRef<ComponentRef<typeof MeshDistortMaterial>>(null)

  const baseScale = 0.9 + 0.12 * intensity
  const baseEmissive = 0.5 + 0.4 * intensity

  // Apply the static resting pose once for the reduced-motion / no-frame case.
  useEffect(() => {
    if (group.current) group.current.scale.setScalar(baseScale)
    if (mat.current) mat.current.emissiveIntensity = baseEmissive
  }, [baseScale, baseEmissive])

  useFrame((state, delta) => {
    if (!animate) return
    const g = group.current
    if (!g) return
    const t = state.clock.elapsedTime

    // Breathing: slow ~6s cycle, very gentle scale oscillation.
    const breath = Math.sin((t / 6) * Math.PI * 2) * 0.5 + 0.5 // 0..1
    const s = baseScale * (0.97 + breath * 0.06)
    g.scale.setScalar(s)

    // Calm auto-rotation — barely there.
    g.rotation.y += delta * 0.08

    // Gentle elastic lean toward the pointer (state.pointer is -1..1), layered
    // on top of a slow idle wobble. Lerp keeps it smooth, never jittery.
    const px = state.pointer.x || 0
    const py = state.pointer.y || 0
    const idleWobble = Math.sin(t * 0.15) * 0.04
    const targetX = idleWobble - py * 0.28
    const targetZ = px * 0.28
    const k = Math.min(1, delta * 2.2) // elastic follow factor
    g.rotation.x += (targetX - g.rotation.x) * k
    g.rotation.z += (targetZ - g.rotation.z) * k
    g.position.x += (px * 0.06 - g.position.x) * k
    g.position.y += (py * 0.06 - g.position.y) * k

    // Luminance breathes with the body and with vault fullness.
    if (mat.current) {
      mat.current.emissiveIntensity = baseEmissive * (0.9 + breath * 0.18)
    }
  })

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[1, 96, 96]} />
        <MeshDistortMaterial
          ref={mat}
          color={CORE}
          emissive={SOLAR}
          emissiveIntensity={baseEmissive}
          roughness={0.32}
          metalness={0}
          // Soft-body wobble. Static when not animating (speed 0).
          distort={animate ? 0.22 : 0}
          speed={animate ? 1.1 : 0}
        />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------------- *
 * Additive glow halo — a back-facing sphere with a soft solar tint. Robust,
 * cheap, and far steadier than postprocessing bloom.
 * ------------------------------------------------------------------------- */
function Halo({ animate, intensity }: { animate: boolean; intensity: number }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null)
  const baseOpacity = 0.18 + 0.16 * intensity

  useEffect(() => {
    if (mat.current) mat.current.opacity = baseOpacity
  }, [baseOpacity])

  useFrame((state) => {
    if (!animate || !mat.current) return
    const t = state.clock.elapsedTime
    const breath = Math.sin((t / 6) * Math.PI * 2) * 0.5 + 0.5
    mat.current.opacity = baseOpacity * (0.78 + breath * 0.4)
  })

  return (
    <>
      {/* Inner warm halo */}
      <mesh scale={1.28}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial
          ref={mat}
          color={HALO}
          transparent
          opacity={baseOpacity}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Outer faint solar bloom */}
      <mesh scale={1.58}>
        <sphereGeometry args={[1, 40, 40]} />
        <meshBasicMaterial
          color={SOLAR}
          transparent
          opacity={baseOpacity * 0.4}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

/* ------------------------------------------------------------------------- *
 * Corona — dark ink motes (one per funded project) revolving slowly.
 * ------------------------------------------------------------------------- */
function Corona({ specs, animate }: { specs: MoteSpec[]; animate: boolean }) {
  const group = useRef<THREE.Group>(null)

  useFrame((state, delta) => {
    if (!animate || !group.current) return
    // Whole corona drifts; individual motes also revolve via their own speed.
    group.current.rotation.y += delta * 0.05
    group.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.1) * 0.06
  })

  return (
    <group ref={group}>
      {specs.map((m, i) => (
        <Mote key={i} spec={m} animate={animate} />
      ))}
    </group>
  )
}

function Mote({ spec, animate }: { spec: MoteSpec; animate: boolean }) {
  const ref = useRef<THREE.Mesh>(null)

  // Resting position (also the static-mode position).
  useEffect(() => {
    if (ref.current) {
      ref.current.position.copy(spec.base).multiplyScalar(spec.radius)
    }
  }, [spec])

  useFrame((state) => {
    if (!animate || !ref.current) return
    const t = state.clock.elapsedTime
    // Revolve the unit vector around the Y axis, then place at orbit radius.
    const a = t * spec.speed + spec.phase
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const x = spec.base.x * cos - spec.base.z * sin
    const z = spec.base.x * sin + spec.base.z * cos
    ref.current.position.set(x, spec.base.y, z).multiplyScalar(spec.radius)
  })

  return (
    <mesh ref={ref} scale={spec.scale}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshStandardMaterial color={INK} roughness={0.6} metalness={0} />
    </mesh>
  )
}

/* ------------------------------------------------------------------------- *
 * Scene — lights + the three pieces. Lives inside <Canvas>.
 * ------------------------------------------------------------------------- */
function Scene({
  specs,
  animate,
  intensity,
}: {
  specs: MoteSpec[]
  animate: boolean
  intensity: number
}) {
  return (
    <>
      {/* Low ambient so the orb keeps its form; a warm upper-left key gives the
          highlight (echoing the static SVG's specular), plus a core glow light. */}
      <ambientLight intensity={0.28} />
      <pointLight position={[0, 0, 0]} intensity={0.9} color={SOLAR} distance={8} />
      <directionalLight position={[-2.2, 2.4, 3]} intensity={1.05} color={'#FFF4D6'} />
      <Halo animate={animate} intensity={intensity} />
      <Sun animate={animate} intensity={intensity} />
      <Corona specs={specs} animate={animate} />
    </>
  )
}

/* ------------------------------------------------------------------------- *
 * Lightweight, dependency-free WebGL capability probe.
 * ------------------------------------------------------------------------- */
function detectWebGL(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    return Boolean(gl)
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------------- *
 * Public component.
 * ------------------------------------------------------------------------- */
export function HelioWebGL({ size = 360, motes = 14, intensity = 1, onReady }: HelioWebGLProps) {
  const clampedIntensity = clamp01(intensity)
  const specs = useMemo(() => buildMotes(motes), [motes])

  // Browser-only capability + motion preference reads (import-safe).
  const [ready, setReady] = useState(false)
  const [webgl, setWebgl] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebgl(detectWebGL())

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    // addEventListener is supported in all R19-era browsers.
    mq.addEventListener('change', onChange)

    setReady(true)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Until we've probed the client, render nothing — the parent's static
  // <Helio> fallback covers this window (and SSR). No WebGL → stay null.
  if (!ready || !webgl) return null

  const animate = !reducedMotion

  return (
    <div aria-hidden="true" style={{ width: size, height: size, position: 'relative' }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ width: size, height: size, background: 'transparent' }}
        // Frame loop pauses entirely in reduced-motion (single render).
        frameloop={animate ? 'always' : 'demand'}
        camera={{ position: [0, 0, 5.4], fov: 40, near: 0.1, far: 100 }}
        onCreated={() => {
          // Signal the parent once the first frame has actually painted, so the
          // static fallback can cross-fade out with no blank gap.
          if (onReady) requestAnimationFrame(() => onReady())
        }}
      >
        <Scene specs={specs} animate={animate} intensity={clampedIntensity} />
      </Canvas>
    </div>
  )
}

export default HelioWebGL
