import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const COUNT = 30

// Default (exhale) position, before rising toward the inhale position.
const SPAWN_X_MIN = -5
const SPAWN_X_MAX = 5
const SPAWN_Y_MIN = -15
const SPAWN_Y_MAX = -12
const SPAWN_Z_MIN = -15
const SPAWN_Z_MAX = -8
const RISE_MIN = 10   // how far cubes move up (Y) from exhale -> inhale position
const RISE_MAX = 15
const Z_RISE_MIN = 5  // how far cubes move in Z from exhale -> inhale position
const Z_RISE_MAX = 10

// Only used to arm the very first reveal: how far the raw slider must rise
// above its tracked local min to count as "started heading back up."
const REVERSAL_DEADBAND = 0.08

// Alpha eases along a different pair of endpoints depending on which way
// the cube is currently moving, so exhale->inhale and inhale->exhale don't
// share a single curve.
const RISING_ALPHA_START = 0.2  // at full exhale, heading toward inhale
const RISING_ALPHA_END = 0.8    // at full inhale, reached from below
const FALLING_ALPHA_START = 0   // at full exhale, reached from above
const FALLING_ALPHA_END = 0.6   // at full inhale, heading toward exhale

// Switching curves at a direction change would otherwise pop instantly
// (e.g. 0 -> 0.2 at the bottom, 0.8 -> 0.6 at the top) — blend into the new
// curve's value over this many seconds instead.
const ALPHA_BLEND_SECONDS = 0.1

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}

// Stronger ease-in/ease-out than smoothstep (zero first *and* second
// derivative at both ends) — used for the cubes' position travel.
function smootherstep(t) {
  t = Math.max(0, Math.min(1, t))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function alphaForTarget(t, target) {
  return target === 1
    ? THREE.MathUtils.lerp(RISING_ALPHA_START, RISING_ALPHA_END, t)
    : THREE.MathUtils.lerp(FALLING_ALPHA_START, FALLING_ALPHA_END, t)
}

export default function BackgroundA({ gateColor, emissiveColor, breathPhaseRef, gatesEnabledRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef, leftRawRef }) {
  const positions = useMemo(() => {
    const pts = []
    for (let i = 0; i < COUNT; i++) {
      const x = SPAWN_X_MIN + Math.random() * (SPAWN_X_MAX - SPAWN_X_MIN)
      const exhaleY = SPAWN_Y_MIN + Math.random() * (SPAWN_Y_MAX - SPAWN_Y_MIN)
      const exhaleZ = SPAWN_Z_MIN + Math.random() * (SPAWN_Z_MAX - SPAWN_Z_MIN)
      const rise = RISE_MIN + Math.random() * (RISE_MAX - RISE_MIN)
      const zRise = Z_RISE_MIN + Math.random() * (Z_RISE_MAX - Z_RISE_MIN)
      const inhaleY = exhaleY + rise
      const inhaleZ = exhaleZ + zRise
      pts.push([x, exhaleY, exhaleZ, inhaleY, inhaleZ])
    }
    return pts
  }, [])

  const meshRefs = useRef([])
  const matRefs = useRef([])
  const progressRef = useRef(0)

  // First-reveal handoff: until handedOffRef is true, target is driven by a
  // direct watch on the raw slider (reached a local min, then rose past the
  // deadband) instead of the simulated breathPhaseRef crossing — so the very
  // first rise begins exactly when the user hits full exhale and starts
  // heading back toward inhale. Once that first rise completes, control
  // hands off permanently to the normal breathPhaseRef-driven cycling.
  const handedOffRef = useRef(false)
  const revealTriggeredRef = useRef(false)
  const watchMinRef = useRef(null)

  const prevTargetRef = useRef(0)
  const alphaBlendElapsedRef = useRef(Infinity)
  const alphaBlendStartRef = useRef(FALLING_ALPHA_START)
  const lastAlphaRef = useRef(FALLING_ALPHA_START)

  useFrame((_, delta) => {
    const gatesActive = gatesEnabledRef?.current ?? false
    let target

    if (!handedOffRef.current) {
      if (gatesActive && !revealTriggeredRef.current) {
        const raw = leftRawRef?.current
        if (raw != null) {
          if (watchMinRef.current === null || raw < watchMinRef.current) {
            watchMinRef.current = raw
          } else if (raw >= watchMinRef.current + REVERSAL_DEADBAND) {
            revealTriggeredRef.current = true
          }
        }
      }
      target = revealTriggeredRef.current ? 1 : 0
    } else {
      target = gatesActive && breathPhaseRef?.current === 'inhale' ? 1 : 0
    }

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

    if (!handedOffRef.current && target === 1 && progressRef.current >= 1) {
      handedOffRef.current = true
    }

    const posT = smootherstep(progressRef.current)
    const t = smoothstep(progressRef.current)

    const rawAlpha = alphaForTarget(t, target)
    const alpha = alphaBlendElapsedRef.current < ALPHA_BLEND_SECONDS
      ? THREE.MathUtils.lerp(alphaBlendStartRef.current, rawAlpha, smoothstep(alphaBlendElapsedRef.current / ALPHA_BLEND_SECONDS))
      : rawAlpha
    lastAlphaRef.current = alpha

    for (let i = 0; i < COUNT; i++) {
      const mesh = meshRefs.current[i]
      const mat = matRefs.current[i]
      if (!mesh || !mat) continue
      const [, exhaleY, exhaleZ, inhaleY, inhaleZ] = positions[i]
      mesh.position.y = THREE.MathUtils.lerp(exhaleY, inhaleY, posT)
      mesh.position.z = THREE.MathUtils.lerp(exhaleZ, inhaleZ, posT)
      mat.opacity = alpha
      mat.emissiveIntensity = THREE.MathUtils.lerp(0, 1, t)
    }
  })

  return (
    <group>
      {positions.map((pos, i) => (
        <RoundedBox
          key={i}
          ref={el => { meshRefs.current[i] = el }}
          args={[0.5, 0.5, 0.5]}
          radius={0.1}
          smoothness={3}
          position={[pos[0], pos[1], pos[2]]}
        >
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
        </RoundedBox>
      ))}
    </group>
  )
}
