import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const POOL = 3
const ROAD_POOL = 3          // max simultaneous track segments (leading preview + current + trailing)
const TIES_PER_SEGMENT = 6   // 1 tie at the segment's leading gate + 5 equally spaced before the next gate
const TIE_ALPHA = 0.2
const TIE_GAP = 0.1          // inset so the ties' X width would just touch (not overlap) imaginary rails
const TIE_HEIGHT_Y = 0.08
const TIE_DEPTH_Z = 0.15
const TIE_RADIUS = 0.02
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

// Ties span the full track width -- the gate's interior (inner-hole) half-width
// at its vertical center, minus TIE_GAP so they'd just touch (not overlap)
// imaginary rails at that inset.
const GATE_INNER_HALF_X = BASE_INNER * GATE_SCALE[0]
const TIE_WIDTH_X = 2 * (GATE_INNER_HALF_X - TIE_GAP)
const TIE_ARGS = [TIE_WIDTH_X, TIE_HEIGHT_Y, TIE_DEPTH_Z]

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
  return { z: 0, speed: 0, active: false, fadeElapsed: 0, hasTriggeredNext: false, opacity: 0 }
}

function createTieMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.5,
    roughness: 0.5,
    metalness: 0.1,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
}

export default function GatesE({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor }) {
  const slots = useRef(Array.from({ length: POOL }, makeSlot))
  const groupRefs = useRef(Array.from({ length: POOL }, () => null))
  const matRefs = useRef(Array.from({ length: POOL }, () => null))

  // Ties laid out as ROAD_POOL segments x TIES_PER_SEGMENT ties each, flattened.
  const tieMaterials = useMemo(
    () => Array.from({ length: ROAD_POOL * TIES_PER_SEGMENT }, () => createTieMaterial(gateColor)),
    [gateColor]
  )
  const tieMeshRefs = useRef(Array.from({ length: ROAD_POOL * TIES_PER_SEGMENT }, () => null))

  // Checkpoints track every gate spawn independently of the gate-mesh pool
  // above, so track continuity isn't tied to when a gate slot gets recycled --
  // a checkpoint lives until it scrolls past DESPAWN_Z (the same z used to
  // despawn gates, i.e. "off the bottom of the screen").
  const checkpoints = useRef([])

  const wasEnabled = useRef(false)

  useFrame((_, delta) => {
    const spawn = () => {
      const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      checkpoints.current.push({ z: SPAWN_Z, speed, fadeElapsed: 0 })

      const slot = slots.current.find(s => !s.active)
      if (!slot) return
      Object.assign(slot, makeSlot())
      slot.z = SPAWN_Z
      slot.speed = speed
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
      const fadeIn = smoothstep(Math.min(slot.fadeElapsed / FADE_DURATION, 1))
      const fadeOut = slot.z > FADE_OUT_START
        ? 1 - smoothstep(Math.min((slot.z - FADE_OUT_START) / FADE_OUT_DURATION, 1))
        : 1
      const opacity = fadeIn * fadeOut
      slot.opacity = opacity
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

    // Advance every checkpoint and drop any that have scrolled past the
    // screen-bottom cutoff (DESPAWN_Z).
    checkpoints.current.forEach(cp => {
      cp.z += cp.speed * delta
      cp.fadeElapsed += delta
    })
    checkpoints.current = checkpoints.current.filter(cp => cp.z <= DESPAWN_Z)
    checkpoints.current.sort((a, b) => a.z - b.z)

    // Boundaries = a virtual leading anchor pinned at SPAWN_Z (a preview of
    // where the *next* gate will spawn, so its ties are visible in advance
    // instead of only appearing once the Morph passes through the current
    // gate) + every live checkpoint (ascending z) + a virtual trailing
    // anchor pinned at DESPAWN_Z (so the most recently passed checkpoint
    // always has somewhere to connect to, keeping ties continuous all the
    // way to the screen-bottom cutoff).
    const boundaries = []
    if (checkpoints.current.length > 0) {
      boundaries.push({ z: SPAWN_Z, fadeIn: 1 })
      checkpoints.current.forEach(cp => boundaries.push({
        z: cp.z,
        fadeIn: smoothstep(Math.min(cp.fadeElapsed / FADE_DURATION, 1)),
      }))
      boundaries.push({ z: DESPAWN_Z, fadeIn: 1 })
    }

    for (let r = 0; r < ROAD_POOL; r++) {
      const a = boundaries[r]
      const b = boundaries[r + 1]
      const segFade = a && b ? Math.min(a.fadeIn, b.fadeIn) : 0
      const depth = a && b ? b.z - a.z : 0

      for (let i = 0; i < TIES_PER_SEGMENT; i++) {
        const mesh = tieMeshRefs.current[r * TIES_PER_SEGMENT + i]
        const mat = tieMaterials[r * TIES_PER_SEGMENT + i]
        if (!mesh) continue

        if (!a || !b) { mesh.visible = false; continue }

        const frac = i / TIES_PER_SEGMENT
        const z = a.z + frac * depth
        const tieMask = clamp01(Math.abs(frac - 0.5) * 2)

        mesh.position.z = z
        mesh.visible = true
        mat.opacity = TIE_ALPHA * tieMask * segFade
      }
    }
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
      {Array.from({ length: ROAD_POOL * TIES_PER_SEGMENT }, (_, idx) => (
        <RoundedBox key={`tie-${idx}`}
          ref={el => { tieMeshRefs.current[idx] = el }}
          position={[0, GATE_Y, 0]} args={TIE_ARGS} radius={TIE_RADIUS} smoothness={2}
          visible={false}>
          <primitive object={tieMaterials[idx]} attach="material" />
        </RoundedBox>
      ))}
    </>
  )
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}
