import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { HALO_RING_Z, RING_Y, BASE_RADIUS, BASE_TUBE, GATE_SCALE } from './BackgroundRingsD'

const POOL_SIZE = 28
const SPAWN_Z = -6
const DESPAWN_Z = 6

const PULSE_RING_TUBE = 0.015   // thin line, ~1/4 of BASE_TUBE -- tune by eye
const INNER_EDGE_FACTOR = (BASE_RADIUS - BASE_TUBE) / BASE_RADIUS   // 0.94: the sparkle ring's own inner edge
const PULSE_RING_SCALE = GATE_SCALE.map(v => v * INNER_EDGE_FACTOR)
const TORUS_ARGS = [BASE_RADIUS, PULSE_RING_TUBE, 16, 64]

const PULSE_DURATION = 1.0   // seconds per pulse, one pulse per second of hold
const PULSE_RAMP_IN = 0.2    // seconds ramping in before ramping out for the remainder
const PULSE_ALPHA_MIN = 0.2
const PULSE_ALPHA_MAX = 0.4
const PULSE_EMISSIVE_MIN = 0.2
const PULSE_EMISSIVE_MAX = 1

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

// Eased ramp-in over PULSE_RAMP_IN, then eased ramp-out for the remainder of PULSE_DURATION.
function pulseEnvelope(tInPulse) {
  if (tInPulse < PULSE_RAMP_IN) return smoothstep(tInPulse / PULSE_RAMP_IN)
  return 1 - smoothstep((tInPulse - PULSE_RAMP_IN) / (PULSE_DURATION - PULSE_RAMP_IN))
}

function makeSlot() {
  return { z: 0, speed: 0, active: false, type: 'inhale', isLast: false, isFirst: false, hasTriggeredNext: false, hasTriggeredFirst: false, hasPreTriggeredLast: false }
}

// Shape D's Box Breathing gates: keeps GatesBoxBreathingC's exact pooled-slot timing
// simulation (so onFirstGate/onLastGate keep firing at the same instants, preserving
// App.jsx's tutorial text and breathPhaseRef behavior) but renders no traveling
// torus/sphere meshes. Instead, a second independent clock (below) tracks which of
// the 4 named box-breathing phases is active and pulses a single thin, inset ring
// during both Hold-in and Hold-out.
export default function GatesBoxBreathingD({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor, onFirstGate, onLastGate, boxPhaseRef, boxProgressRef }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const wasEnabled = useRef(false)

  const totalElapsedRef = useRef(0)
  const ringMatRef = useRef()
  const ringMeshRef = useRef()

  useFrame((_, delta) => {
    const ss = slots.current
    const enabled = gatesEnabledRef.current

    function spawnSeries(type) {
      const N = Math.max(1, Math.round(spawnIntervalRef.current))
      const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      const spacing = N > 1 ? Math.abs(SPAWN_Z) / (N - 1) : 0
      for (let i = 0; i < N; i++) {
        const spawnZ = SPAWN_Z - i * spacing
        const idx = ss.findIndex(s => !s.active)
        if (idx === -1) continue
        const s = ss[idx]
        s.z = spawnZ; s.speed = speed; s.active = true
        s.type = type; s.isLast = (i === N - 1); s.isFirst = (i === 0)
        s.hasTriggeredNext = false; s.hasTriggeredFirst = false; s.hasPreTriggeredLast = false
      }
    }

    if (!enabled) {
      wasEnabled.current = false
    }

    if (enabled) {
      if (!wasEnabled.current) {
        spawnSeries('inhale')
        totalElapsedRef.current = 0
      }
      wasEnabled.current = true

      for (let i = 0; i < POOL_SIZE; i++) {
        const s = ss[i]
        if (!s.active) continue

        s.z += s.speed * delta

        if (s.z > DESPAWN_Z) { s.active = false; continue }

        const leadZ = s.speed * 2
        if (s.z >= -leadZ && s.isFirst && !s.hasTriggeredFirst) {
          s.hasTriggeredFirst = true
          onFirstGate?.(s.type)
        }
        if (s.z >= -leadZ && s.isLast && !s.hasPreTriggeredLast) {
          s.hasPreTriggeredLast = true
          onLastGate?.(s.type)
        }
        if (s.z >= 0 && !s.hasTriggeredNext && s.isLast) {
          s.hasTriggeredNext = true
          spawnSeries(s.type === 'inhale' ? 'exhale' : 'inhale')
        }
      }

      // Independent, drift-free 4-phase clock: 0=Inhale(moving), 1=Hold-in,
      // 2=Exhale(moving), 3=Hold-out -- each exactly spawnIntervalRef.current seconds.
      totalElapsedRef.current += delta
      const interval = Math.max(0.05, spawnIntervalRef.current)
      const cycleT = totalElapsedRef.current % (4 * interval)
      const phaseIndex = Math.floor(cycleT / interval)
      const phaseElapsed = cycleT % interval

      const isHold = phaseIndex === 1 || phaseIndex === 3   // Hold-in or Hold-out
      const tInPulse = phaseElapsed % PULSE_DURATION
      const pulse = isHold ? pulseEnvelope(tInPulse) : 0

      // The last pulse of each hold ramps all the way down to 0 (instead of
      // back to PULSE_ALPHA_MIN/PULSE_EMISSIVE_MIN), so the ring fades out
      // cleanly right before the following movement phase's own ramp-up from
      // 0 begins. "Last" is whichever pulse is in progress right as the hold
      // ends, so this works for any hold length, not just ones that happen
      // to divide evenly by PULSE_DURATION.
      const pulseIndex = Math.floor(phaseElapsed / PULSE_DURATION)
      const lastPulseIndex = Math.floor((interval - 1e-4) / PULSE_DURATION)
      const isLastPulse = isHold && pulseIndex === lastPulseIndex
      const rampingOut = tInPulse >= PULSE_RAMP_IN
      const alphaFloor = isLastPulse && rampingOut ? 0 : PULSE_ALPHA_MIN
      const emissiveFloor = isLastPulse && rampingOut ? 0 : PULSE_EMISSIVE_MIN

      // Inhale/Exhale movement phases: ease alpha/emissive 0 -> PULSE_ALPHA_MIN/
      // PULSE_EMISSIVE_MIN across the phase, arriving at the hold's own baseline
      // exactly as the hold begins (no jump at the phase boundary).
      const moveRamp = isHold ? 1 : smoothstep(phaseElapsed / interval)

      if (ringMeshRef.current) ringMeshRef.current.visible = true
      if (ringMatRef.current) {
        ringMatRef.current.opacity = isHold
          ? lerp(alphaFloor, PULSE_ALPHA_MAX, pulse)
          : lerp(0, PULSE_ALPHA_MIN, moveRamp)
        ringMatRef.current.emissiveIntensity = isHold
          ? lerp(emissiveFloor, PULSE_EMISSIVE_MAX, pulse)
          : lerp(0, PULSE_EMISSIVE_MIN, moveRamp)
      }

      // Clean, ground-truth phase/progress pair for RingParticlesD's Sparkle
      // system to consume in Box mode -- 'inhale' spans Inhale-movement +
      // Hold-in (progress ramps 0->1 across the movement, holds at 1 through
      // the hold), 'exhale' spans Exhale-movement + Hold-out (progress ramps
      // 1->0 across the movement, holds at 0 through the hold). Avoids the
      // startup artifact and BackgroundA-specific inversion baked into
      // breathPhaseRef/paceProgressRef.
      if (boxPhaseRef) boxPhaseRef.current = (phaseIndex === 0 || phaseIndex === 1) ? 'inhale' : 'exhale'
      if (boxProgressRef) {
        boxProgressRef.current =
          phaseIndex === 0 ? phaseElapsed / interval :
          phaseIndex === 1 ? 1 :
          phaseIndex === 2 ? 1 - phaseElapsed / interval :
          0
      }
    } else {
      if (ringMeshRef.current) ringMeshRef.current.visible = false
      if (boxPhaseRef) boxPhaseRef.current = 'exhale'
      if (boxProgressRef) boxProgressRef.current = 0
    }
  })

  return (
    <mesh ref={ringMeshRef} position={[0, RING_Y, HALO_RING_Z]} scale={PULSE_RING_SCALE} visible={false}>
      <torusGeometry args={TORUS_ARGS} />
      <meshStandardMaterial ref={ringMatRef}
        color={gateColor} emissive={emissiveColor} transparent depthWrite={false} opacity={0} />
    </mesh>
  )
}
