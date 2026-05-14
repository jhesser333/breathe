import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const POOL_SIZE = 3
const GATE_SPEED = 5
const SPAWN_Z = -20
const DESPAWN_Z = 8
const SPAWN_INTERVAL = 4

const BOX_SIZE = 0.6
const BOX_X = 1.2

export default function Gates() {
  const slots = useRef(
    Array.from({ length: POOL_SIZE }, () => ({ z: 0, active: false }))
  )
  const groupRefs = useRef(Array.from({ length: POOL_SIZE }, () => null))
  const elapsed = useRef(0)
  const nextSpawn = useRef(0)

  useFrame((_, delta) => {
    elapsed.current += delta

    if (elapsed.current >= nextSpawn.current) {
      const slot = slots.current.find(s => !s.active)
      if (slot) {
        slot.z = SPAWN_Z
        slot.active = true
        nextSpawn.current = elapsed.current + SPAWN_INTERVAL
      }
    }

    slots.current.forEach((slot, i) => {
      const group = groupRefs.current[i]
      if (!group) return
      if (!slot.active) {
        group.visible = false
        return
      }
      slot.z += GATE_SPEED * delta
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
          <mesh position={[-BOX_X, 0, 0]}>
            <boxGeometry args={[BOX_SIZE, BOX_SIZE, BOX_SIZE]} />
            <meshStandardMaterial color="#888888" roughness={0.7} />
          </mesh>
          <mesh position={[BOX_X, 0, 0]}>
            <boxGeometry args={[BOX_SIZE, BOX_SIZE, BOX_SIZE]} />
            <meshStandardMaterial color="#888888" roughness={0.7} />
          </mesh>
        </group>
      ))}
    </>
  )
}
