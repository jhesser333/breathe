import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const POOL_A = 3
const POOL_B = 3
const SPAWN_Z = -20
const GATE_B_Z = -30
const GATE_B_FADE_Z = -20
const DESPAWN_Z = 6
const FADE_DURATION = 1.0

const GATE_Y = 0.25         // matches Morph Y position

// Gate A: exhale morph half-width 1.1 → inner hole 1.25 (14% clearance)
const GATE_A_RADIUS = 1.35
const GATE_A_TUBE = 0.1

// Gate B: inhale morph half-height 1.75 → inner hole 2.0 (14% clearance)
const GATE_B_RADIUS = 2.1
const GATE_B_TUBE = 0.1

function makeSlotA() {
  return { z: 0, speed: 0, active: false, fadeElapsed: 0, hasTriggeredNext: false }
}
function makeSlotB() {
  return { z: 0, speed: 0, active: false, fadeElapsed: 0 }
}

export default function GatesA({ gatesEnabledRef, spawnIntervalRef, gateColor }) {
  const slotsA = useRef(Array.from({ length: POOL_A }, makeSlotA))
  const groupRefsA = useRef(Array.from({ length: POOL_A }, () => null))
  const matRefsA = useRef(Array.from({ length: POOL_A }, () => null))

  const slotsB = useRef(Array.from({ length: POOL_B }, makeSlotB))
  const groupRefsB = useRef(Array.from({ length: POOL_B }, () => null))
  const matRefsB = useRef(Array.from({ length: POOL_B }, () => null))

  const wasEnabled = useRef(false)

  useFrame((_, delta) => {
    const spawnB = (speed) => {
      const slot = slotsB.current.find(s => !s.active)
      if (!slot) return
      Object.assign(slot, makeSlotB())
      slot.z = GATE_B_Z
      slot.speed = speed
      slot.active = true
    }

    const spawnA = () => {
      const slot = slotsA.current.find(s => !s.active)
      if (!slot) return
      Object.assign(slot, makeSlotA())
      slot.z = SPAWN_Z
      slot.speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      slot.active = true
      spawnB(slot.speed)
    }

    if (gatesEnabledRef.current && !wasEnabled.current) {
      wasEnabled.current = true
      spawnA()
    }
    if (!gatesEnabledRef.current) wasEnabled.current = false

    slotsA.current.forEach((slot, i) => {
      const group = groupRefsA.current[i]
      if (!group) return
      if (!slot.active) { group.visible = false; return }

      slot.fadeElapsed += delta
      const opacity = Math.min(slot.fadeElapsed / FADE_DURATION, 1)
      if (matRefsA.current[i]) matRefsA.current[i].opacity = opacity

      slot.z += slot.speed * delta

      if (slot.z >= 0 && !slot.hasTriggeredNext) {
        slot.hasTriggeredNext = true
        spawnA()
      }

      if (slot.z > DESPAWN_Z) { slot.active = false; group.visible = false; return }

      group.position.z = slot.z
      group.visible = true
    })

    slotsB.current.forEach((slot, i) => {
      const group = groupRefsB.current[i]
      if (!group) return
      if (!slot.active) { group.visible = false; return }

      slot.z += slot.speed * delta

      if (slot.z > DESPAWN_Z) { slot.active = false; group.visible = false; return }

      group.position.z = slot.z

      if (slot.z < GATE_B_FADE_Z) { group.visible = false; return }

      slot.fadeElapsed += delta
      const opacity = Math.min(slot.fadeElapsed / FADE_DURATION, 1)
      if (matRefsB.current[i]) matRefsB.current[i].opacity = opacity
      group.visible = true
    })
  })

  return (
    <>
      {Array.from({ length: POOL_A }, (_, i) => (
        <group key={`a${i}`} ref={el => { groupRefsA.current[i] = el }} visible={false}>
          <mesh position={[0, GATE_Y, 0]}>
            <torusGeometry args={[GATE_A_RADIUS, GATE_A_TUBE, 16, 64]} />
            <meshStandardMaterial ref={el => { matRefsA.current[i] = el }}
              color={gateColor} roughness={0.5} metalness={0.1} transparent opacity={0} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: POOL_B }, (_, i) => (
        <group key={`b${i}`} ref={el => { groupRefsB.current[i] = el }} visible={false}>
          <mesh position={[0, GATE_Y, 0]}>
            <torusGeometry args={[GATE_B_RADIUS, GATE_B_TUBE, 16, 64]} />
            <meshStandardMaterial ref={el => { matRefsB.current[i] = el }}
              color={gateColor} roughness={0.5} metalness={0.1} transparent opacity={0} />
          </mesh>
        </group>
      ))}
    </>
  )
}
