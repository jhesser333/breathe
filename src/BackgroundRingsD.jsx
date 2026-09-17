import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Paced ring rig for Shape Option D. Three concentric rings all sit at the
// origin (0,0,0) and are differentiated by scale instead of depth. Two are
// fixed in place -- the exhale ring (larger) and the inhale ring (smaller,
// the base scale) -- and never change size. A third, thinner "pace ring"
// scales between them in lockstep with the app-controlled paced breath cycle
// (breathPhaseRef/gatesEnabledRef), holding briefly at each end before easing
// across to the other size. All motion and emissive ramps use the same
// smoothstep ease-in/ease-out curve. When the paced cycle isn't driving
// (gatesEnabledRef false), everything rests in the exhale configuration.

export const HALO_RING_Z = 0     // purely decorative, invisible (opacity 0) -- anchors RingParticlesD
export const RING_Y = 0

const HOLD_SECONDS = 0.5     // pace ring pause at each end before it starts moving

const PULSE_IN = 0.1         // fixed-ring pulse: ease-in duration
const PULSE_HOLD = 0.3       // fixed-ring pulse: hold-at-peak duration
const PULSE_OUT = 0.5        // fixed-ring pulse: ease-out duration
const PULSE_TOTAL = PULSE_IN + PULSE_HOLD + PULSE_OUT

export const BASE_RADIUS = 1.0
export const BASE_TUBE = 0.06
const PACE_TUBE = 0.045      // thinner than BASE_TUBE so the pace ring nests inside/hides behind a fixed ring
// Inner hole half-extent is ~(BASE_RADIUS - BASE_TUBE) * GATE_SCALE[axis] = 0.94 * GATE_SCALE[axis].
// Sized for a ~15% clearance margin over MorphC's Option D inhale half-extents (1.0, 1.5):
// X: 1.0*1.15/0.94 ≈ 1.223, Y: 1.5*1.15/0.94 ≈ 1.835.
export const GATE_SCALE = [1.223, 1.835, 1].map((v) => v * 0.95)   // inhale ring scale (base scale), 5% smaller than the clearance-margin sizing derived above
export const EXHALE_SCALE = GATE_SCALE.map((v) => v * 1.5)   // exhale ring scale: 1.5x inhale in x/y/z
const FLAT_ALPHA = 0.5

const PACE_EMISSIVE_MIN = 0.1
const PACE_EMISSIVE_MAX = 0.7

const INHALE_SCALE_VEC = new THREE.Vector3(...GATE_SCALE)
const EXHALE_SCALE_VEC = new THREE.Vector3(...EXHALE_SCALE)

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

export default function BackgroundRingsD({ baseColor, emissiveColor, breathPhaseRef, gatesEnabledRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef, paceProgressRef }) {
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
    let paceEmissive
    let eased
    if (activePhase === 'inhale') {
      const moveDuration = Math.max(0.05, inhaleDuration - HOLD_SECONDS)
      const t = elapsed <= HOLD_SECONDS ? 0 : Math.min(1, (elapsed - HOLD_SECONDS) / moveDuration)
      eased = smoothstep(t)
      if (paceMeshRef.current) paceMeshRef.current.scale.lerpVectors(EXHALE_SCALE_VEC, INHALE_SCALE_VEC, eased)
      paceEmissive = THREE.MathUtils.lerp(PACE_EMISSIVE_MIN, PACE_EMISSIVE_MAX, eased)
    } else {
      const moveDuration = Math.max(0.05, exhaleDuration - HOLD_SECONDS)
      const t = elapsed <= HOLD_SECONDS ? 0 : Math.min(1, (elapsed - HOLD_SECONDS) / moveDuration)
      eased = smoothstep(t)
      if (paceMeshRef.current) paceMeshRef.current.scale.lerpVectors(INHALE_SCALE_VEC, EXHALE_SCALE_VEC, eased)
      paceEmissive = THREE.MathUtils.lerp(PACE_EMISSIVE_MAX, PACE_EMISSIVE_MIN, eased)
    }

    if (paceMatRef.current) paceMatRef.current.emissiveIntensity = paceEmissive

    // Continuous 0 (exhale rest) -> 1 (inhale) -> 0 (exhale) breath-progress signal,
    // exposed for other Shape D effects (e.g. RingParticlesD) to drive off of the
    // paced cycle instead of the sliders -- mirrors the pace ring's own motion.
    if (paceProgressRef) paceProgressRef.current = activePhase === 'inhale' ? eased : (1 - eased)

    if (matExhaleRef.current) matExhaleRef.current.emissiveIntensity = pulseValue(pulseExhaleElapsedRef.current)
    if (matInhaleRef.current) matInhaleRef.current.emissiveIntensity = pulseValue(pulseInhaleElapsedRef.current)
  })

  return (
    <group>
      <mesh position={[0, RING_Y, 0]} scale={EXHALE_SCALE}>
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
      <mesh position={[0, RING_Y, 0]} scale={GATE_SCALE}>
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
      <mesh position={[0, RING_Y, HALO_RING_Z]} scale={GATE_SCALE}>
        <torusGeometry args={[BASE_RADIUS, BASE_TUBE, 16, 64]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={emissiveColor}
          emissiveIntensity={0}
          roughness={0.5}
          metalness={0.1}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={paceMeshRef} position={[0, RING_Y, 0]} scale={EXHALE_SCALE}>
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
