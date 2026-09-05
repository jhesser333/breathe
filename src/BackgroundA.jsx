import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const COUNT = 30

// Default (exhale) position, before rising toward the inhale position.
const SPAWN_X_MIN = -3
const SPAWN_X_MAX = 3
const SPAWN_Y_MIN = -15
const SPAWN_Y_MAX = -10
const SPAWN_Z_MIN = -15
const SPAWN_Z_MAX = -5
const RISE_MIN = 10  // how far cubes move up from exhale -> inhale position
const RISE_MAX = 15

const PULSE_RAMP_IN = 0.125             // seconds — same ramp-in for both flashes
const PULSE_RAMP_OUT = 0.25             // seconds — doubled ramp-out for both flashes
const PULSE_OPACITY_BOOST = 0.07        // extra opacity at the extremes (both top and bottom)
const INHALE_EMISSIVE_BOOST = 0.6       // peak emissive for the inhale flash (full inhale)
const EXHALE_EMISSIVE_BOOST = 0.3       // peak emissive for the exhale flash (full exhale) — half as bright

// Only used to arm the very first reveal: how far the raw slider must rise
// above its tracked local min to count as "started heading back up."
const REVERSAL_DEADBAND = 0.08

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}

// Stronger ease-in/ease-out than smoothstep (zero first *and* second
// derivative at both ends) — used for the cubes' Y travel.
function smootherstep(t) {
  t = Math.max(0, Math.min(1, t))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

// Time-based pulse envelope: eases 0 -> 1 over PULSE_RAMP_IN seconds, then
// 1 -> 0 over PULSE_RAMP_OUT seconds — independent of breath pace, restarted
// from elapsed=0 on every target flip (start of heading toward inhale or
// toward exhale).
function pulseEnvelope(elapsed) {
  if (elapsed < PULSE_RAMP_IN) return smoothstep(elapsed / PULSE_RAMP_IN)
  const fallElapsed = elapsed - PULSE_RAMP_IN
  if (fallElapsed >= PULSE_RAMP_OUT) return 0
  return 1 - smoothstep(fallElapsed / PULSE_RAMP_OUT)
}

export default function BackgroundA({ gateColor, emissiveColor, breathPhaseRef, gatesEnabledRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef, leftRawRef }) {
  const positions = useMemo(() => {
    const pts = []
    for (let i = 0; i < COUNT; i++) {
      const x = SPAWN_X_MIN + Math.random() * (SPAWN_X_MAX - SPAWN_X_MIN)
      const exhaleY = SPAWN_Y_MIN + Math.random() * (SPAWN_Y_MAX - SPAWN_Y_MIN)
      const z = SPAWN_Z_MIN + Math.random() * (SPAWN_Z_MAX - SPAWN_Z_MIN)
      const rise = RISE_MIN + Math.random() * (RISE_MAX - RISE_MIN)
      const inhaleY = exhaleY + rise
      pts.push([x, exhaleY, z, inhaleY])
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
  const pulseElapsedRef = useRef(Infinity)
  // Which flash is currently playing: fires at full exhale (target just
  // became 1, about to rise) or at full inhale (target just became 0, about
  // to fall) — set once per flash, when the edge that starts it is detected.
  const pulseEmissivePeakRef = useRef(INHALE_EMISSIVE_BOOST)

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
      pulseElapsedRef.current = 0
      prevTargetRef.current = target
      // target just became 1 -> cube was at full exhale, starting to rise.
      // target just became 0 -> cube was at full inhale, starting to fall.
      pulseEmissivePeakRef.current = target === 1 ? EXHALE_EMISSIVE_BOOST : INHALE_EMISSIVE_BOOST
    } else {
      pulseElapsedRef.current += delta
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
    const pulse = pulseEnvelope(pulseElapsedRef.current)

    for (let i = 0; i < COUNT; i++) {
      const mesh = meshRefs.current[i]
      const mat = matRefs.current[i]
      if (!mesh || !mat) continue
      const [, exhaleY, , inhaleY] = positions[i]
      mesh.position.y = THREE.MathUtils.lerp(exhaleY, inhaleY, posT)
      mat.opacity = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0, 0.1, t) + PULSE_OPACITY_BOOST * pulse, 0, 1)
      mat.emissiveIntensity = THREE.MathUtils.lerp(0, 1, t) + pulseEmissivePeakRef.current * pulse
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
