import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

// Headless Box Breathing gate driver for Shape Option D: no visible meshes.
// Reuses GatesBoxBreathingC's series-spawn tracking (N evenly-spaced gates
// per series, alternating inhale/exhale, lead-time pre-triggered onFirstGate/
// onLastGate) purely to keep the tutorial text sequence and breathPhaseRef
// (via App.jsx's onFirstGate handler) advancing at the correct moments.
const POOL_SIZE = 8
const SPAWN_Z = -6
const DESPAWN_Z = 6

function makeSlot() {
  return { z: 0, speed: 0, active: false, type: 'inhale', isLast: false, isFirst: false, hasTriggeredNext: false, hasTriggeredFirst: false, hasPreTriggeredLast: false }
}

export default function GatesBoxBreathingHeadless({ gatesEnabledRef, spawnIntervalRef, onFirstGate, onLastGate }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const wasEnabled = useRef(false)

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
      return
    }

    if (!wasEnabled.current) {
      spawnSeries('inhale')
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
  })

  return null
}
