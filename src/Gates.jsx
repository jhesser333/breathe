import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'

const POOL_A = 3
const POOL_B = 3
const SPAWN_Z = -20
const GATE_B_Z = -10
const DESPAWN_Z = 6
const FADE_DURATION = 1.0

const GATE_X = 0.65
const GATE_COLOR = '#c89070'
const GATE_ARGS = [0.5, 0.75, 0.5]
const GATE_RADIUS = 0.07

function makeSlotA() {
  return { z: 0, speed: 0, active: false, fadeElapsed: 0, hasTriggeredNext: false }
}
function makeSlotB() {
  return { z: 0, speed: 0, active: false, fadeElapsed: 0, fadeDelay: 0 }
}

export default function Gates({ gatesEnabledRef, spawnIntervalRef }) {
  const slotsA = useRef(Array.from({ length: POOL_A }, makeSlotA))
  const groupRefsA = useRef(Array.from({ length: POOL_A }, () => null))
  const matLeftRefsA = useRef(Array.from({ length: POOL_A }, () => null))
  const matRightRefsA = useRef(Array.from({ length: POOL_A }, () => null))

  const slotsB = useRef(Array.from({ length: POOL_B }, makeSlotB))
  const groupRefsB = useRef(Array.from({ length: POOL_B }, () => null))
  const matRefsB = useRef(Array.from({ length: POOL_B }, () => null))

  const wasEnabled = useRef(false)
  const firstSpawn = useRef(true)

  useFrame((_, delta) => {
    const spawnB = (speed) => {
      const slot = slotsB.current.find(s => !s.active)
      if (!slot) return
      Object.assign(slot, makeSlotB())
      slot.z = GATE_B_Z
      slot.speed = speed
      slot.fadeDelay = FADE_DURATION
      slot.active = true
    }

    const spawnA = () => {
      const slot = slotsA.current.find(s => !s.active)
      if (!slot) return
      Object.assign(slot, makeSlotA())
      slot.z = SPAWN_Z
      slot.speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      slot.active = true
      // Skip Gate B on the very first spawn so sequence starts A, B, A, B...
      if (!firstSpawn.current) spawnB(slot.speed)
      firstSpawn.current = false
    }

    if (gatesEnabledRef.current && !wasEnabled.current) {
      wasEnabled.current = true
      firstSpawn.current = true
      spawnA()
    }
    if (!gatesEnabledRef.current) {
      wasEnabled.current = false
      firstSpawn.current = true
    }

    slotsA.current.forEach((slot, i) => {
      const group = groupRefsA.current[i]
      if (!group) return
      if (!slot.active) { group.visible = false; return }

      slot.fadeElapsed += delta
      const opacity = Math.min(slot.fadeElapsed / FADE_DURATION, 1)
      if (matLeftRefsA.current[i]) matLeftRefsA.current[i].opacity = opacity
      if (matRightRefsA.current[i]) matRightRefsA.current[i].opacity = opacity

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

      if (slot.fadeDelay > 0) {
        slot.fadeDelay -= delta
        group.visible = false
        return
      }

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
          <RoundedBox position={[-GATE_X, 0, 0]} args={GATE_ARGS} radius={GATE_RADIUS} smoothness={3}>
            <meshStandardMaterial ref={el => { matLeftRefsA.current[i] = el }}
              color={GATE_COLOR} roughness={0.5} metalness={0.1} transparent opacity={0} />
          </RoundedBox>
          <RoundedBox position={[GATE_X, 0, 0]} args={GATE_ARGS} radius={GATE_RADIUS} smoothness={3}>
            <meshStandardMaterial ref={el => { matRightRefsA.current[i] = el }}
              color={GATE_COLOR} roughness={0.5} metalness={0.1} transparent opacity={0} />
          </RoundedBox>
        </group>
      ))}
      {Array.from({ length: POOL_B }, (_, i) => (
        <group key={`b${i}`} ref={el => { groupRefsB.current[i] = el }} visible={false}>
          <RoundedBox position={[0, 0, 0]} args={GATE_ARGS} radius={GATE_RADIUS} smoothness={3}>
            <meshStandardMaterial ref={el => { matRefsB.current[i] = el }}
              color={GATE_COLOR} roughness={0.5} metalness={0.1} transparent opacity={0} />
          </RoundedBox>
        </group>
      ))}
    </>
  )
}
