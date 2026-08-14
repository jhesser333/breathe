import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

// Headless gate timing driver for Shape Option D: no visible meshes, no ties.
// Reuses GatesC's pooled inhale/exhale spawn-and-cross simulation (paired
// spawn on every inhale crossing, multiple exhale generations genuinely in
// flight concurrently since exhale travel time is 1.5x inhale travel time)
// purely to drive breathPhaseRef at the correct alternating cadence for
// BackgroundA to consume.
const POOL = 3
const POOL_EXHALE = 3
const SPAWN_Z = -20
const DESPAWN_Z = 6
const EXHALE_SPAWN_Z = -30

function makeSlot() {
  return { z: 0, speed: 0, active: false, hasTriggeredNext: false }
}

// Dynamic exhale-checkpoint spawn z -- see GatesC.jsx's identical helper for
// the full derivation. Falls back to ratio 1.5 (today's fixed
// EXHALE_SPAWN_Z/SPAWN_Z constant) outside Slowing Down's ramp.
function computeExhaleSpawnZ(inhaleSecondsRef, exhaleSecondsRef, spawnIntervalRef) {
  const inhale = inhaleSecondsRef?.current
  const exhale = exhaleSecondsRef?.current
  const P = spawnIntervalRef.current
  const ratio = (inhale != null && exhale != null && P > 0) ? 1 + inhale / P : 1.5
  return SPAWN_Z * ratio
}

export default function GatesHeadless({ gatesEnabledRef, spawnIntervalRef, breathPhaseRef, inhaleSecondsRef, exhaleSecondsRef }) {
  const slots = useRef(Array.from({ length: POOL }, makeSlot))
  const slotsExhale = useRef(Array.from({ length: POOL_EXHALE }, makeSlot))
  const wasEnabled = useRef(false)

  useFrame((_, delta) => {
    const spawnExhale = (speed) => {
      const slot = slotsExhale.current.find(s => !s.active)
      if (!slot) return
      Object.assign(slot, makeSlot())
      slot.z = computeExhaleSpawnZ(inhaleSecondsRef, exhaleSecondsRef, spawnIntervalRef)
      slot.speed = speed
      slot.active = true
    }

    const spawn = () => {
      const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      const slot = slots.current.find(s => !s.active)
      if (!slot) return
      Object.assign(slot, makeSlot())
      slot.z = SPAWN_Z
      slot.speed = speed
      slot.active = true
      spawnExhale(speed)
    }

    if (gatesEnabledRef.current && !wasEnabled.current) {
      wasEnabled.current = true
      spawn()
    }
    if (!gatesEnabledRef.current) wasEnabled.current = false

    slots.current.forEach(slot => {
      if (!slot.active) return
      slot.z += slot.speed * delta
      if (slot.z >= 0 && !slot.hasTriggeredNext) {
        slot.hasTriggeredNext = true
        if (breathPhaseRef) breathPhaseRef.current = 'inhale'
        spawn()
      }
      if (slot.z > DESPAWN_Z) slot.active = false
    })

    slotsExhale.current.forEach(slot => {
      if (!slot.active) return
      slot.z += slot.speed * delta
      if (slot.z >= 0 && !slot.hasTriggeredNext) {
        slot.hasTriggeredNext = true
        if (breathPhaseRef) breathPhaseRef.current = 'exhale'
      }
      if (slot.z > DESPAWN_Z) slot.active = false
    })
  })

  return null
}
