import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const POOL_SIZE = 3
const SPAWN_Z = -20
const DESPAWN_Z = 6
const FADE_DURATION = 1.0

const EGG_X = 0.65
const EGG_COLOR = '#c89070'

export default function Gates({ gatesEnabledRef, spawnIntervalRef }) {
  const slots = useRef(
    Array.from({ length: POOL_SIZE }, () => ({
      z: 0, active: false, speed: 0, fadeElapsed: 0, hasTriggeredNext: false,
    }))
  )
  const groupRefs = useRef(Array.from({ length: POOL_SIZE }, () => null))
  const matLeftRefs = useRef(Array.from({ length: POOL_SIZE }, () => null))
  const matRightRefs = useRef(Array.from({ length: POOL_SIZE }, () => null))
  const wasEnabled = useRef(false)

  useFrame((_, delta) => {
    const spawnOne = () => {
      const slot = slots.current.find(s => !s.active)
      if (!slot) return
      slot.z = SPAWN_Z
      slot.speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      slot.active = true
      slot.fadeElapsed = 0
      slot.hasTriggeredNext = false
    }

    // Detect gates becoming enabled → spawn first gate immediately
    if (gatesEnabledRef.current && !wasEnabled.current) {
      wasEnabled.current = true
      spawnOne()
    }
    if (!gatesEnabledRef.current) {
      wasEnabled.current = false
    }

    slots.current.forEach((slot, i) => {
      const group = groupRefs.current[i]
      if (!group) return

      if (!slot.active) {
        group.visible = false
        return
      }

      // Fade in over FADE_DURATION seconds
      slot.fadeElapsed += delta
      const opacity = Math.min(slot.fadeElapsed / FADE_DURATION, 1)
      if (matLeftRefs.current[i]) matLeftRefs.current[i].opacity = opacity
      if (matRightRefs.current[i]) matRightRefs.current[i].opacity = opacity

      slot.z += slot.speed * delta

      // When gate passes through Morph (z=0), spawn the next gate
      if (slot.z >= 0 && !slot.hasTriggeredNext) {
        slot.hasTriggeredNext = true
        spawnOne()
      }

      if (slot.z > DESPAWN_Z) {
        slot.active = false
        group.visible = false
        return
      }

      group.position.z = slot.z
      group.visible = true
    })
  })

  return (
    <>
      {Array.from({ length: POOL_SIZE }, (_, i) => (
        <group key={i} ref={el => { groupRefs.current[i] = el }} visible={false}>
          <mesh position={[-EGG_X, 0, 0]} scale={[1, 1.5, 1]}>
            <sphereGeometry args={[0.35, 16, 12]} />
            <meshStandardMaterial
              ref={el => { matLeftRefs.current[i] = el }}
              color={EGG_COLOR}
              roughness={0.5}
              metalness={0.1}
              transparent
              opacity={0}
            />
          </mesh>
          <mesh position={[EGG_X, 0, 0]} scale={[1, 1.5, 1]}>
            <sphereGeometry args={[0.35, 16, 12]} />
            <meshStandardMaterial
              ref={el => { matRightRefs.current[i] = el }}
              color={EGG_COLOR}
              roughness={0.5}
              metalness={0.1}
              transparent
              opacity={0}
            />
          </mesh>
        </group>
      ))}
    </>
  )
}
