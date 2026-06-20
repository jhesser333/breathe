import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const POOL = 3
const SPAWN_Z = -20
const DESPAWN_Z = 6
const FADE_DURATION = 1.0

const GATE_Y = 0.25   // matches Morph Y position

// Base torus geometry (unit circle, inner hole = radius - tube)
const BASE_RADIUS = 1.0
const BASE_TUBE = 0.06
const BASE_INNER = BASE_RADIUS - BASE_TUBE  // 0.94

// MorphC inhale half-extents (sphere r=0.5 x scale) -- only a single gate
// type remains (sized for the Inhale state), so it must clear the Morph's
// widest/tallest point at full inhale.
const INHALE_X = 0.5 * 2.25   // 1.125
const INHALE_Y = 0.5 * 3.5    // 1.75

// Non-uniform scale to stretch the circular torus into the inhale ellipse,
// same clearance ratios used by GatesA's inhale gate.
const GATE_SCALE = [INHALE_X * 1.15 / BASE_INNER, INHALE_Y * 1.05 / BASE_INNER, 1]

const EMISSIVE_START_Z = -3   // begin ramp: 0 → 1
const EMISSIVE_MID_Z = -0.5  // steeper ramp: 1 → 2
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

export default function GatesC({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor }) {
  const slots = useRef(Array.from({ length: POOL }, makeSlot))
  const groupRefs = useRef(Array.from({ length: POOL }, () => null))
  const matRefs = useRef(Array.from({ length: POOL }, () => null))

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
      if (matRefs.current[i]) {
        matRefs.current[i].opacity = opacity
        matRefs.current[i].emissiveIntensity = emissive
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
          <mesh position={[0, GATE_Y, 0]} scale={GATE_SCALE}>
            <torusGeometry args={[BASE_RADIUS, BASE_TUBE, 16, 64]} />
            <meshStandardMaterial ref={el => { matRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} emissiveIntensity={0}
              roughness={0.5} metalness={0.1} transparent opacity={0} />
          </mesh>
        </group>
      ))}
    </>
  )
}
