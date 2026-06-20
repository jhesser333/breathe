import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'

const POOL = 3
const SPAWN_Z = -20
const DESPAWN_Z = 6
const FADE_DURATION = 1.0

const GATE_Y = 0.25   // matches Morph Y position

// Same shared cube geometry GatesB uses for its inhale (left/right) gates.
const CUBE_ARGS = [0.5, 0.5, 0.5]
const CUBE_RADIUS = 0.1

// MorphD's inhale-state X half-extent (0.5 box half * 1.2 scale = 0.6) is
// identical to MorphB's, since Option D reuses Option B's scale curve -- so
// the same clearance GatesB uses for its inhale gate already fits here.
const GATE_X = 0.9

const EMISSIVE_START_Z = -3
const EMISSIVE_MID_Z = -0.5
const MAX_EMISSIVE = 2
const FADE_OUT_START = 0
const FADE_OUT_DURATION = 2

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}

function calcEmissive(z) {
  if (z >= 0) return MAX_EMISSIVE
  if (z >= EMISSIVE_MID_Z)
    return 1 + smoothstep((z - EMISSIVE_MID_Z) / (-EMISSIVE_MID_Z))
  if (z >= EMISSIVE_START_Z)
    return smoothstep((z - EMISSIVE_START_Z) / (EMISSIVE_MID_Z - EMISSIVE_START_Z))
  return 0
}

function makeSlot() {
  return { z: 0, speed: 0, active: false, fadeElapsed: 0, hasTriggeredNext: false }
}

export default function GatesD({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor }) {
  const slots = useRef(Array.from({ length: POOL }, makeSlot))
  const groupRefs = useRef(Array.from({ length: POOL }, () => null))
  const matLeftRefs = useRef(Array.from({ length: POOL }, () => null))
  const matRightRefs = useRef(Array.from({ length: POOL }, () => null))

  const wasEnabled = useRef(false)

  useFrame((_, delta) => {
    const spawn = () => {
      const slot = slots.current.find(s => !s.active)
      if (!slot) return
      Object.assign(slot, makeSlot())
      slot.z = SPAWN_Z
      slot.speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      slot.active = true
    }

    if (gatesEnabledRef.current && !wasEnabled.current) {
      wasEnabled.current = true
      spawn()
    }
    if (!gatesEnabledRef.current) wasEnabled.current = false

    slots.current.forEach((slot, i) => {
      const group = groupRefs.current[i]
      if (!group) return
      if (!slot.active) { group.visible = false; return }

      slot.fadeElapsed += delta
      const emissive = calcEmissive(slot.z)
      const fadeOut = slot.z > FADE_OUT_START
        ? 1 - smoothstep(Math.min((slot.z - FADE_OUT_START) / FADE_OUT_DURATION, 1))
        : 1
      const opacity = smoothstep(Math.min(slot.fadeElapsed / FADE_DURATION, 1)) * fadeOut
      if (matLeftRefs.current[i]) {
        matLeftRefs.current[i].opacity = opacity
        matLeftRefs.current[i].emissiveIntensity = emissive
      }
      if (matRightRefs.current[i]) {
        matRightRefs.current[i].opacity = opacity
        matRightRefs.current[i].emissiveIntensity = emissive
      }

      slot.z += slot.speed * delta

      if (slot.z >= 0 && !slot.hasTriggeredNext) {
        slot.hasTriggeredNext = true
        spawn()
      }

      if (slot.z > DESPAWN_Z) { slot.active = false; group.visible = false; return }

      group.position.z = slot.z
      group.visible = true
    })
  })

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i} ref={el => { groupRefs.current[i] = el }} visible={false}>
          <RoundedBox position={[-GATE_X, GATE_Y, 0]} args={CUBE_ARGS} radius={CUBE_RADIUS} smoothness={3}>
            <meshStandardMaterial ref={el => { matLeftRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} emissiveIntensity={0}
              roughness={0.5} metalness={0.1} transparent opacity={0} />
          </RoundedBox>
          <RoundedBox position={[GATE_X, GATE_Y, 0]} args={CUBE_ARGS} radius={CUBE_RADIUS} smoothness={3}>
            <meshStandardMaterial ref={el => { matRightRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} emissiveIntensity={0}
              roughness={0.5} metalness={0.1} transparent opacity={0} />
          </RoundedBox>
        </group>
      ))}
    </>
  )
}
