import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const POOL_A = 3
const POOL_B = 3
const SPAWN_Z = -20
const GATE_B_Z = -30
const GATE_B_FADE_Z = -20
const DESPAWN_Z = 6
const FADE_DURATION = 1.0

const GATE_Y = 0.25   // matches Morph Y position

// Base torus geometry (unit circle, inner hole = radius - tube)
const BASE_RADIUS = 1.0
const BASE_TUBE = 0.06
const BASE_INNER = BASE_RADIUS - BASE_TUBE  // 0.94

// Morph actual half-extents (sphere r=0.5 × scale)
const EXHALE_X = 0.5 * 2.2   // 1.1
const EXHALE_Y = 0.5 * 0.25  // 0.125
const INHALE_X = 0.5 * 1.2   // 0.6
const INHALE_Y = 0.5 * 3.5   // 1.75

// Non-uniform scale to stretch the circular torus into the right ellipse shape
// Exhale gate: X reduced to 1.05x clearance; Inhale gate: Y reduced to 1.05x clearance
const EXHALE_SCALE = [EXHALE_X * 1.05 / BASE_INNER, EXHALE_Y * 1.15 / BASE_INNER, 1]
const INHALE_SCALE = [INHALE_X * 1.15 / BASE_INNER, INHALE_Y * 1.05 / BASE_INNER, 1]

const EMISSIVE_RAMP_IN = 2   // units before Morph where glow starts
const EMISSIVE_RAMP_OUT = 1  // units after Morph where glow fades
const MAX_EMISSIVE = 2

function makeSlotA() {
  return { z: 0, speed: 0, active: false, fadeElapsed: 0, hasTriggeredNext: false }
}
function makeSlotB() {
  return { z: 0, speed: 0, active: false, fadeElapsed: 0 }
}

export default function GatesA({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor }) {
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
      const emissive = slot.z < 0
        ? MAX_EMISSIVE * Math.max(0, 1 + slot.z / EMISSIVE_RAMP_IN)
        : MAX_EMISSIVE * Math.max(0, 1 - slot.z / EMISSIVE_RAMP_OUT)
      if (matRefsA.current[i]) {
        matRefsA.current[i].opacity = opacity
        matRefsA.current[i].emissiveIntensity = emissive
      }

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
      const emissive = slot.z < 0
        ? MAX_EMISSIVE * Math.max(0, 1 + slot.z / EMISSIVE_RAMP_IN)
        : MAX_EMISSIVE * Math.max(0, 1 - slot.z / EMISSIVE_RAMP_OUT)
      if (matRefsB.current[i]) {
        matRefsB.current[i].opacity = opacity
        matRefsB.current[i].emissiveIntensity = emissive
      }
      group.visible = true
    })
  })

  return (
    <>
      {Array.from({ length: POOL_A }, (_, i) => (
        <group key={`a${i}`} ref={el => { groupRefsA.current[i] = el }} visible={false}>
          <mesh position={[0, GATE_Y, 0]} scale={EXHALE_SCALE}>
            <torusGeometry args={[BASE_RADIUS, BASE_TUBE, 16, 64]} />
            <meshStandardMaterial ref={el => { matRefsA.current[i] = el }}
              color={gateColor} emissive={emissiveColor} emissiveIntensity={0}
              roughness={0.5} metalness={0.1} transparent opacity={0} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: POOL_B }, (_, i) => (
        <group key={`b${i}`} ref={el => { groupRefsB.current[i] = el }} visible={false}>
          <mesh position={[0, GATE_Y, 0]} scale={INHALE_SCALE}>
            <torusGeometry args={[BASE_RADIUS, BASE_TUBE, 16, 64]} />
            <meshStandardMaterial ref={el => { matRefsB.current[i] = el }}
              color={gateColor} emissive={emissiveColor} emissiveIntensity={0}
              roughness={0.5} metalness={0.1} transparent opacity={0} />
          </mesh>
        </group>
      ))}
    </>
  )
}
