import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Paced ring rig for Shape Option D. Two rings are fixed in place -- the
// exhale ring (far from camera) and the inhale ring (near camera) -- and
// never move. A third, thinner "pace ring" travels between them in lockstep
// with the app-controlled paced breath cycle (breathPhaseRef/gatesEnabledRef),
// holding briefly at each end before easing across to the other. All motion
// and emissive ramps use the same smoothstep ease-in/ease-out curve. When the
// paced cycle isn't driving (gatesEnabledRef false), everything rests in the
// exhale configuration.

const EXHALE_RING_Z = -3
const INHALE_RING_Z = 1
const RING_Y = 0

const HOLD_SECONDS = 0.5     // pace ring pause at each end before it starts moving

const PULSE_IN = 0.1         // fixed-ring pulse: ease-in duration
const PULSE_HOLD = 0.3       // fixed-ring pulse: hold-at-peak duration
const PULSE_OUT = 0.2        // fixed-ring pulse: ease-out duration
const PULSE_TOTAL = PULSE_IN + PULSE_HOLD + PULSE_OUT

const BASE_RADIUS = 1.0
const BASE_TUBE = 0.06
const PACE_TUBE = 0.045      // thinner than BASE_TUBE so the pace ring nests inside/hides behind a fixed ring
const GATE_SCALE = [1.376, 1.955, 1]   // same clearance scale as GatesC/GatesBoxBreathingC's inhale torus
const FLAT_ALPHA = 0.5

const PACE_EMISSIVE_MIN = 0.1
const PACE_EMISSIVE_MAX = 0.7

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}

// One-shot pulse timeline: ease in 0->1 over PULSE_IN, hold at 1 for
// PULSE_HOLD, ease out 1->0 over PULSE_OUT, then rest at 0.
function pulseValue(elapsed) {
  if (elapsed < PULSE_IN) return smoothstep(elapsed / PULSE_IN)
  if (elapsed < PULSE_IN + PULSE_HOLD) return 1
  if (elapsed < PULSE_TOTAL) return 1 - smoothstep((elapsed - PULSE_IN - PULSE_HOLD) / PULSE_OUT)
  return 0
}

export default function BackgroundRingsD({ baseColor, emissiveColor, breathPhaseRef, gatesEnabledRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef }) {
  const matExhaleRef = useRef()
  const matInhaleRef = useRef()
  const paceMeshRef = useRef()
  const paceMatRef = useRef()

  const prevPhaseRef = useRef('exhale')
  const phaseElapsedRef = useRef(Infinity)          // time since the active phase last changed
  const pulseExhaleElapsedRef = useRef(Infinity)    // time since the exhale ring's pulse last triggered
  const pulseInhaleElapsedRef = useRef(Infinity)    // time since the inhale ring's pulse last triggered

  useFrame((_, delta) => {
    const active = gatesEnabledRef?.current ?? false
    const activePhase = active ? (breathPhaseRef?.current ?? 'exhale') : 'exhale'

    if (activePhase !== prevPhaseRef.current) {
      prevPhaseRef.current = activePhase
      phaseElapsedRef.current = 0
      if (activePhase === 'inhale') {
        pulseExhaleElapsedRef.current = 0
      } else {
        pulseInhaleElapsedRef.current = 0
      }
    }
    phaseElapsedRef.current += delta
    pulseExhaleElapsedRef.current += delta
    pulseInhaleElapsedRef.current += delta

    const inhale = inhaleSecondsRef?.current
    const exhale = exhaleSecondsRef?.current
    const hasSplit = inhale != null && exhale != null
    const fallback = (spawnIntervalRef?.current ?? 6) / 2
    const inhaleDuration = hasSplit ? inhale : fallback
    const exhaleDuration = hasSplit ? exhale : fallback

    const elapsed = phaseElapsedRef.current
    let paceZ
    let paceEmissive
    if (activePhase === 'inhale') {
      const moveDuration = Math.max(0.05, inhaleDuration - HOLD_SECONDS)
      const t = elapsed <= HOLD_SECONDS ? 0 : Math.min(1, (elapsed - HOLD_SECONDS) / moveDuration)
      const eased = smoothstep(t)
      paceZ = THREE.MathUtils.lerp(EXHALE_RING_Z, INHALE_RING_Z, eased)
      paceEmissive = THREE.MathUtils.lerp(PACE_EMISSIVE_MIN, PACE_EMISSIVE_MAX, eased)
    } else {
      const moveDuration = Math.max(0.05, exhaleDuration - HOLD_SECONDS)
      const t = elapsed <= HOLD_SECONDS ? 0 : Math.min(1, (elapsed - HOLD_SECONDS) / moveDuration)
      const eased = smoothstep(t)
      paceZ = THREE.MathUtils.lerp(INHALE_RING_Z, EXHALE_RING_Z, eased)
      paceEmissive = THREE.MathUtils.lerp(PACE_EMISSIVE_MAX, PACE_EMISSIVE_MIN, eased)
    }

    if (paceMeshRef.current) paceMeshRef.current.position.z = paceZ
    if (paceMatRef.current) paceMatRef.current.emissiveIntensity = paceEmissive

    if (matExhaleRef.current) matExhaleRef.current.emissiveIntensity = pulseValue(pulseExhaleElapsedRef.current)
    if (matInhaleRef.current) matInhaleRef.current.emissiveIntensity = pulseValue(pulseInhaleElapsedRef.current)
  })

  return (
    <group>
      <mesh position={[0, RING_Y, EXHALE_RING_Z]} scale={GATE_SCALE}>
        <torusGeometry args={[BASE_RADIUS, BASE_TUBE, 16, 64]} />
        <meshStandardMaterial
          ref={matExhaleRef}
          color={baseColor}
          emissive={emissiveColor}
          emissiveIntensity={0}
          roughness={0.5}
          metalness={0.1}
          transparent
          opacity={FLAT_ALPHA}
        />
      </mesh>
      <mesh position={[0, RING_Y, INHALE_RING_Z]} scale={GATE_SCALE}>
        <torusGeometry args={[BASE_RADIUS, BASE_TUBE, 16, 64]} />
        <meshStandardMaterial
          ref={matInhaleRef}
          color={baseColor}
          emissive={emissiveColor}
          emissiveIntensity={0}
          roughness={0.5}
          metalness={0.1}
          transparent
          opacity={FLAT_ALPHA}
        />
      </mesh>
      <mesh ref={paceMeshRef} position={[0, RING_Y, EXHALE_RING_Z]} scale={GATE_SCALE}>
        <torusGeometry args={[BASE_RADIUS, PACE_TUBE, 16, 64]} />
        <meshStandardMaterial
          ref={paceMatRef}
          color={baseColor}
          emissive={emissiveColor}
          emissiveIntensity={PACE_EMISSIVE_MIN}
          roughness={0.5}
          metalness={0.1}
          transparent
          opacity={FLAT_ALPHA}
        />
      </mesh>
    </group>
  )
}
