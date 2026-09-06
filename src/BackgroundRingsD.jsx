import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Continuous ring tunnel for Shape Option D, replacing BackgroundA's cubes.
// Unlike the Gates system, ring motion is NOT breath-paced -- it's a slow,
// constant conveyor-loop scroll toward the Morph, independent of breath
// timing. Only each ring's opacity/glow is breath-driven, reusing
// BackgroundA.jsx's exact alpha-curve mechanism (copied, not imported --
// matches this codebase's existing per-file-duplication convention, e.g.
// GatesHeadlessE duplicating GatesHeadless's constants).

const RING_COUNT = 23           // covers TUNNEL_FAR_Z..TUNNEL_NEAR_Z at 5-unit spacing with headroom
const RING_SPACING = 5
const TUNNEL_FAR_Z = -100
const TUNNEL_NEAR_Z = 10        // recycle point, just past the camera
const RING_SPEED = 0.5          // slow constant scroll, units/sec -- independent of breath pace
const RING_Y = 0                // matches Option D's Morph, centered at true origin

const BASE_RADIUS = 1.0
const BASE_TUBE = 0.06
const GATE_SCALE = [1.376, 1.955, 1]   // same clearance scale as GatesC/GatesBoxBreathingC's inhale torus

// Alpha eases along a different pair of endpoints depending on which way
// the rings are currently heading, so exhale->inhale and inhale->exhale
// don't share a single curve.
const RISING_ALPHA_START = 0.1  // at full exhale, heading toward inhale
const RISING_ALPHA_END = 0.8    // at full inhale, reached from below
const FALLING_ALPHA_START = 0   // at full exhale, reached from above
const FALLING_ALPHA_END = 0.6   // at full inhale, heading toward exhale

// Switching curves at a direction change would otherwise pop instantly --
// blend into the new curve's value over this many seconds instead.
const ALPHA_BLEND_SECONDS = 0.25

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}

function alphaForTarget(t, target) {
  return target === 1
    ? THREE.MathUtils.lerp(RISING_ALPHA_START, RISING_ALPHA_END, t)
    : THREE.MathUtils.lerp(FALLING_ALPHA_START, FALLING_ALPHA_END, t)
}

export default function BackgroundRingsD({ gateColor, emissiveColor, breathPhaseRef, gatesEnabledRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef }) {
  const startZs = useMemo(() => {
    const zs = []
    for (let i = 0; i < RING_COUNT; i++) zs.push(TUNNEL_FAR_Z + i * RING_SPACING)
    return zs
  }, [])

  const meshRefs = useRef([])
  const matRefs = useRef([])
  const zRef = useRef(startZs.slice())
  const progressRef = useRef(0)

  const prevTargetRef = useRef(0)
  const alphaBlendElapsedRef = useRef(Infinity)
  const alphaBlendStartRef = useRef(FALLING_ALPHA_START)
  const lastAlphaRef = useRef(FALLING_ALPHA_START)

  useFrame((_, delta) => {
    const gatesActive = gatesEnabledRef?.current ?? false
    const target = gatesActive && breathPhaseRef?.current === 'inhale' ? 1 : 0

    if (target !== prevTargetRef.current) {
      alphaBlendStartRef.current = lastAlphaRef.current
      alphaBlendElapsedRef.current = 0
      prevTargetRef.current = target
    } else {
      alphaBlendElapsedRef.current += delta
    }

    const inhale = inhaleSecondsRef?.current
    const exhale = exhaleSecondsRef?.current
    const hasSplit = inhale != null && exhale != null
    const fallback = (spawnIntervalRef?.current ?? 6) / 2
    const halfInterval = target === 1 ? (hasSplit ? inhale : fallback) : (hasSplit ? exhale : fallback)
    const dir = target > progressRef.current ? 1 : -1
    progressRef.current = THREE.MathUtils.clamp(progressRef.current + dir * delta / halfInterval, 0, 1)

    const t = smoothstep(progressRef.current)

    const rawAlpha = alphaForTarget(t, target)
    const alpha = alphaBlendElapsedRef.current < ALPHA_BLEND_SECONDS
      ? THREE.MathUtils.lerp(alphaBlendStartRef.current, rawAlpha, smoothstep(alphaBlendElapsedRef.current / ALPHA_BLEND_SECONDS))
      : rawAlpha
    lastAlphaRef.current = alpha

    const tunnelLength = RING_COUNT * RING_SPACING

    for (let i = 0; i < RING_COUNT; i++) {
      const mesh = meshRefs.current[i]
      const mat = matRefs.current[i]
      if (!mesh || !mat) continue

      zRef.current[i] += RING_SPEED * delta
      if (zRef.current[i] > TUNNEL_NEAR_Z) zRef.current[i] -= tunnelLength

      mesh.position.z = zRef.current[i]
      mat.opacity = alpha
      mat.emissiveIntensity = THREE.MathUtils.lerp(0, 1, t)
    }
  })

  return (
    <group>
      {startZs.map((z, i) => (
        <mesh
          key={i}
          ref={el => { meshRefs.current[i] = el }}
          position={[0, RING_Y, z]}
          scale={GATE_SCALE}
        >
          <torusGeometry args={[BASE_RADIUS, BASE_TUBE, 16, 64]} />
          <meshStandardMaterial
            ref={el => { matRefs.current[i] = el }}
            color={gateColor}
            emissive={emissiveColor}
            emissiveIntensity={0}
            roughness={0.5}
            metalness={0.1}
            transparent
            opacity={0}
          />
        </mesh>
      ))}
    </group>
  )
}
