import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { usePaceRings } from './PaceRingsD'

const POOL_SIZE = 28
const SPAWN_Z = -6
const DESPAWN_Z = 6

const PULSE_DURATION = 1.0   // one count ring per second of hold
const START_FADE_FRAC = 0.9  // art fades in over the first 90% of the first Inhale -- same curve as the "Inhale" caption (TutorialText FADE_IN_FRAC)

function makeSlot() {
  return { z: 0, speed: 0, active: false, type: 'inhale', isLast: false, isFirst: false, hasTriggeredNext: false, hasTriggeredFirst: false, hasPreTriggeredLast: false }
}

// Shape D's Box Breathing gates: keeps GatesBoxBreathingC's exact pooled-slot timing
// simulation (so onFirstGate/onLastGate keep firing at the same instants, preserving
// App.jsx's tutorial text and breathPhaseRef behavior) but renders no traveling
// torus/sphere meshes. Instead, a second independent clock (below) tracks which of
// the 4 named box-breathing phases is active and drives the shared pace-ring rig
// (PaceRingsD: Pulse/Hold ring, Pulse/Hold Exhale ring, count rings).
export default function GatesBoxBreathingD({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor, onFirstGate, onLastGate, boxPhaseRef, boxProgressRef, livePaletteRef, paceArtFadeRef }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const wasEnabled = useRef(false)

  const totalElapsedRef = useRef(0)
  const { elements: paceRings, update: updatePaceRings } = usePaceRings({ gateColor, emissiveColor })

  useFrame((_, delta) => {
    const live = livePaletteRef && livePaletteRef.current

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
      const t = Math.min(1, totalElapsedRef.current / (START_FADE_FRAC * interval))
      const fade = t * t * (3 - 2 * t)
      if (paceArtFadeRef) paceArtFadeRef.current = fade

      // Pulse/Hold ring, Pulse/Hold Exhale ring and count rings -- see
      // PaceRingsD. `sideElapsed` runs continuously across a movement phase
      // and its following hold (cycleT itself never resets mid-cycle).
      updatePaceRings({
        enabled: true,
        side: phaseIndex < 2 ? 'inhale' : 'exhale',
        sideElapsed: phaseIndex < 2 ? cycleT : cycleT - 2 * interval,
        moveDuration: interval,
        holdDuration: interval,
        numCountRings: Math.floor((interval - 1e-4) / PULSE_DURATION) + 1,
        live,
        fade,
      })

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
      updatePaceRings({ enabled: false, live })
      if (paceArtFadeRef) paceArtFadeRef.current = 0
      if (boxPhaseRef) boxPhaseRef.current = 'exhale'
      if (boxProgressRef) boxProgressRef.current = 0
    }
  })

  return paceRings
}
