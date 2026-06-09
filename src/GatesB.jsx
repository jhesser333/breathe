import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'

const POOL_A = 3
const POOL_B = 3
const SPAWN_Z = -20
const GATE_B_Z = -30
const GATE_B_FADE_Z = -20
const DESPAWN_Z = 6
const FADE_DURATION = 1.0
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

// Gate A (exhale) — top and bottom bars framing the flat morph
const GATE_A_ARGS = [2.8, 0.25, 0.5]
const GATE_A_RADIUS = 0.07
const GATE_A_TOP_Y = 0.65    // above morph at exhale (center 0.25 + half-extent 0.2 + clearance)
const GATE_A_BOT_Y = -0.15   // below morph at exhale

// Gate B (inhale) — left and right pillars framing the tall morph
const GATE_B_ARGS = [0.4, 4.5, 0.5]
const GATE_B_RADIUS = 0.07
const GATE_B_X = 0.9         // morph X half-extent (0.6) + clearance + pillar half-width
const GATE_B_Y = 0.25        // centered at morph height

function makeSlotA() {
  return { z: 0, speed: 0, active: false, fadeElapsed: 0, hasTriggeredNext: false }
}
function makeSlotB() {
  return { z: 0, speed: 0, active: false, fadeElapsed: 0 }
}

export default function GatesB({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor }) {
  const slotsA = useRef(Array.from({ length: POOL_A }, makeSlotA))
  const groupRefsA = useRef(Array.from({ length: POOL_A }, () => null))
  const matTopRefsA = useRef(Array.from({ length: POOL_A }, () => null))
  const matBotRefsA = useRef(Array.from({ length: POOL_A }, () => null))

  const slotsB = useRef(Array.from({ length: POOL_B }, makeSlotB))
  const groupRefsB = useRef(Array.from({ length: POOL_B }, () => null))
  const matLeftRefsB = useRef(Array.from({ length: POOL_B }, () => null))
  const matRightRefsB = useRef(Array.from({ length: POOL_B }, () => null))

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
      const emissive = calcEmissive(slot.z)
      const fadeOut = slot.z > FADE_OUT_START
        ? 1 - smoothstep(Math.min((slot.z - FADE_OUT_START) / FADE_OUT_DURATION, 1))
        : 1
      const opacity = smoothstep(Math.min(slot.fadeElapsed / FADE_DURATION, 1)) * fadeOut
      if (matTopRefsA.current[i]) {
        matTopRefsA.current[i].opacity = opacity
        matTopRefsA.current[i].emissiveIntensity = emissive
      }
      if (matBotRefsA.current[i]) {
        matBotRefsA.current[i].opacity = opacity
        matBotRefsA.current[i].emissiveIntensity = emissive
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
      const emissive = calcEmissive(slot.z)
      const fadeOut = slot.z > FADE_OUT_START
        ? 1 - smoothstep(Math.min((slot.z - FADE_OUT_START) / FADE_OUT_DURATION, 1))
        : 1
      const opacity = smoothstep(Math.min(slot.fadeElapsed / FADE_DURATION, 1)) * fadeOut
      if (matLeftRefsB.current[i]) {
        matLeftRefsB.current[i].opacity = opacity
        matLeftRefsB.current[i].emissiveIntensity = emissive
      }
      if (matRightRefsB.current[i]) {
        matRightRefsB.current[i].opacity = opacity
        matRightRefsB.current[i].emissiveIntensity = emissive
      }
      group.visible = true
    })
  })

  return (
    <>
      {Array.from({ length: POOL_A }, (_, i) => (
        <group key={`a${i}`} ref={el => { groupRefsA.current[i] = el }} visible={false}>
          <RoundedBox position={[0, GATE_A_TOP_Y, 0]} args={GATE_A_ARGS} radius={GATE_A_RADIUS} smoothness={3}>
            <meshStandardMaterial ref={el => { matTopRefsA.current[i] = el }}
              color={gateColor} emissive={emissiveColor} emissiveIntensity={0}
              roughness={0.5} metalness={0.1} transparent opacity={0} />
          </RoundedBox>
          <RoundedBox position={[0, GATE_A_BOT_Y, 0]} args={GATE_A_ARGS} radius={GATE_A_RADIUS} smoothness={3}>
            <meshStandardMaterial ref={el => { matBotRefsA.current[i] = el }}
              color={gateColor} emissive={emissiveColor} emissiveIntensity={0}
              roughness={0.5} metalness={0.1} transparent opacity={0} />
          </RoundedBox>
        </group>
      ))}
      {Array.from({ length: POOL_B }, (_, i) => (
        <group key={`b${i}`} ref={el => { groupRefsB.current[i] = el }} visible={false}>
          <RoundedBox position={[-GATE_B_X, GATE_B_Y, 0]} args={GATE_B_ARGS} radius={GATE_B_RADIUS} smoothness={3}>
            <meshStandardMaterial ref={el => { matLeftRefsB.current[i] = el }}
              color={gateColor} emissive={emissiveColor} emissiveIntensity={0}
              roughness={0.5} metalness={0.1} transparent opacity={0} />
          </RoundedBox>
          <RoundedBox position={[GATE_B_X, GATE_B_Y, 0]} args={GATE_B_ARGS} radius={GATE_B_RADIUS} smoothness={3}>
            <meshStandardMaterial ref={el => { matRightRefsB.current[i] = el }}
              color={gateColor} emissive={emissiveColor} emissiveIntensity={0}
              roughness={0.5} metalness={0.1} transparent opacity={0} />
          </RoundedBox>
        </group>
      ))}
    </>
  )
}
