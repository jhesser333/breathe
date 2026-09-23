import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { usePaceRings } from './PaceRingsD'
import { computePhaseDurations } from './BackgroundRingsD'

// Slowing Down's Shape D pace rings: the same Pulse/Hold ring, Pulse/Hold
// Exhale ring and count rings as Box Breathing (see PaceRingsD), driven by
// the paced breath cycle. Slowing Down has no holds, so each side is just
// its movement phase -- lasting the live (possibly ramping, possibly
// asymmetric) inhaleSecondsRef/exhaleSecondsRef -- with only the first count
// ring instance playing. breathPhaseRef follows BackgroundRingsD's own
// convention ('inhale' = the inhale movement phase), keeping these in sync
// with the pace ring and sparkles.
export default function SlowingDownPaceRingsD({ gatesEnabledRef, breathPhaseRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef, gateColor, emissiveColor, livePaletteRef }) {
  const { elements, update } = usePaceRings({ gateColor, emissiveColor })
  const prevPhaseRef = useRef(null)
  const phaseElapsedRef = useRef(0)

  useFrame((_, delta) => {
    const live = livePaletteRef && livePaletteRef.current
    const enabled = gatesEnabledRef?.current ?? false
    if (!enabled) {
      prevPhaseRef.current = null
      update({ enabled: false, live })
      return
    }

    const phase = breathPhaseRef?.current === 'inhale' ? 'inhale' : 'exhale'
    if (phase !== prevPhaseRef.current) {
      prevPhaseRef.current = phase
      phaseElapsedRef.current = 0
    }
    phaseElapsedRef.current += delta

    const { inhaleDuration, exhaleDuration } = computePhaseDurations(spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef)
    update({
      enabled: true,
      side: phase,
      sideElapsed: phaseElapsedRef.current,
      moveDuration: phase === 'inhale' ? inhaleDuration : exhaleDuration,
      holdDuration: 0,
      numCountRings: 1,
      live,
    })
  })

  return elements
}
