import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { HALO_RING_Z, RING_Y, BASE_RADIUS, BASE_TUBE, GATE_SCALE } from './BackgroundRingsD'

const POOL_SIZE = 28
const SPAWN_Z = -6
const DESPAWN_Z = 6

const TORUS_ARGS = [BASE_RADIUS, BASE_TUBE, 16, 64]
const EXHALE_HOLD_SPHERE_RADIUS = 0.125   // half of GatesBoxBreathingC's SPHERE_RADIUS (0.25)
const SPHERE_ARGS = [EXHALE_HOLD_SPHERE_RADIUS, 16, 8]

const PULSE_DURATION = 1.0   // seconds per pulse, one pulse per second of hold
const PULSE_RAMP_IN = 0.2    // seconds ramping in before ramping out for the remainder
const PULSE_ALPHA_MAX = 0.5
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
// the 4 named box-breathing phases is active and pulses a stationary ring during
// Hold-in and a stationary sphere during Hold-out.
export default function GatesBoxBreathingD({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor, onFirstGate, onLastGate }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const wasEnabled = useRef(false)

  const totalElapsedRef = useRef(0)
  const ringMatRef = useRef()
  const sphereMatRef = useRef()
  const ringMeshRef = useRef()
  const sphereMeshRef = useRef()

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

      const isHoldIn = phaseIndex === 1
      const isHoldOut = phaseIndex === 3
      const tInPulse = phaseElapsed % PULSE_DURATION
      const pulse = pulseEnvelope(tInPulse)

      if (ringMeshRef.current) ringMeshRef.current.visible = isHoldIn
      if (ringMatRef.current) {
        ringMatRef.current.opacity = isHoldIn ? PULSE_ALPHA_MAX * pulse : 0
        ringMatRef.current.emissiveIntensity = isHoldIn
          ? lerp(PULSE_EMISSIVE_MIN, PULSE_EMISSIVE_MAX, pulse)
          : 0
      }

      if (sphereMeshRef.current) sphereMeshRef.current.visible = isHoldOut
      if (sphereMatRef.current) {
        sphereMatRef.current.opacity = isHoldOut ? PULSE_ALPHA_MAX * pulse : 0
        sphereMatRef.current.emissiveIntensity = isHoldOut
          ? lerp(PULSE_EMISSIVE_MIN, PULSE_EMISSIVE_MAX, pulse)
          : 0
      }
    } else {
      if (ringMeshRef.current) ringMeshRef.current.visible = false
      if (sphereMeshRef.current) sphereMeshRef.current.visible = false
    }
  })

  return (
    <>
      <mesh ref={ringMeshRef} position={[0, RING_Y, HALO_RING_Z]} scale={GATE_SCALE} visible={false}>
        <torusGeometry args={TORUS_ARGS} />
        <meshStandardMaterial ref={ringMatRef}
          color={gateColor} emissive={emissiveColor} transparent depthWrite={false} opacity={0} />
      </mesh>
      <mesh ref={sphereMeshRef} position={[0, 0, 0]} visible={false}>
        <sphereGeometry args={SPHERE_ARGS} />
        <meshStandardMaterial ref={sphereMatRef}
          color={gateColor} emissive={emissiveColor} transparent depthWrite={false} opacity={0} />
      </mesh>
    </>
  )
}
