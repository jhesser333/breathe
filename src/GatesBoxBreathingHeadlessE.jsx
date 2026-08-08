import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

// Headless Box Breathing driver for Shape Option E: identical spawnSeries/
// onFirstGate/onLastGate timing to GatesBoxBreathingC.jsx (so App.jsx's
// handleBBFirstGate/handleBBLastGate keep working unmodified), no meshes.
// Additionally writes holdFlareRef.current (0-2): the isFirst gate of the
// currently-arriving series spans exactly one Hold phase while traveling
// z=0 -> DESPAWN_Z (by construction of the per-series spacing math), so its
// own z (re-centered by -3) doubles as the Hold-phase emissive clock via the
// same calcEmissive ramp shape used by the visible gate options.
const POOL_SIZE = 28
const SPAWN_Z = -6
const DESPAWN_Z = 6

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

function calcEmissive(z) {
  if (z < -3) return 0
  if (z < -0.5) return smoothstep((z + 3) / 2.5)
  if (z < 0) return 1 + smoothstep((z + 0.5) / 0.5)
  return 2
}

function makeSlot() {
  return { z: 0, speed: 0, active: false, type: 'inhale', isLast: false, isFirst: false, hasTriggeredNext: false, hasTriggeredFirst: false, hasPreTriggeredLast: false }
}

export default function GatesBoxBreathingHeadlessE({ gatesEnabledRef, spawnIntervalRef, onFirstGate, onLastGate, holdFlareRef }) {
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
      if (holdFlareRef) holdFlareRef.current = 0
      return
    }
    if (!wasEnabled.current) spawnSeries('inhale')
    wasEnabled.current = true

    let holdZ = null

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

      if (s.isFirst && s.z >= 0 && s.z <= DESPAWN_Z) holdZ = s.z
    }

    if (holdFlareRef) holdFlareRef.current = holdZ !== null ? calcEmissive(holdZ - 3) : 0
  })

  return null
}
