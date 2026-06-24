import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const POOL = 3
const ROAD_POOL = 3          // max simultaneous rail segments (leading preview + current + trailing)
const RAIL_ALPHA = 0.2
const RAIL_RADIUS = 0.05
const RAIL_GAP = 0.1         // inset from the gate's interior edge so rails don't touch it
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

// Rails: two thin cylinders ("train tracks") inset from the gate's interior
// (inner-hole) edge at the gate's vertical center, one on each side of X=0.
const GATE_INNER_HALF_X = BASE_INNER * GATE_SCALE[0]
const RAIL_X = GATE_INNER_HALF_X - RAIL_GAP

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

// Rail material: cylinder lies flat (rotated -90deg about X), local Y of the
// unrotated geometry maps to world Z (the stretch/depth direction) -- used
// here to build a V-shaped alpha gradient that's at RAIL_ALPHA at each gate
// end and zero at the midpoint between them.
function createRailMaterial(color) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.5,
    roughness: 0.5,
    metalness: 0.1,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  mat.customProgramCacheKey = () => `rail-gates-e-${color}`

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying float vRailY;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vRailY = position.y;`
    )

    shader.fragmentShader = 'varying float vRailY;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      `{
        float railMask = clamp(abs(vRailY) * 2.0, 0.0, 1.0);
        diffuseColor.a *= railMask;
      }
      #include <output_fragment>`
    )
  }

  return mat
}

export default function GatesE({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor }) {
  const slots = useRef(Array.from({ length: POOL }, makeSlot))
  const groupRefs = useRef(Array.from({ length: POOL }, () => null))
  const matRefs = useRef(Array.from({ length: POOL }, () => null))

  const railMaterials = useMemo(
    () => Array.from({ length: ROAD_POOL }, () => createRailMaterial(gateColor)),
    [gateColor]
  )
  const leftRailRefs = useRef(Array.from({ length: ROAD_POOL }, () => null))
  const rightRailRefs = useRef(Array.from({ length: ROAD_POOL }, () => null))

  // Checkpoints track every gate spawn independently of the gate-mesh pool
  // above, so rail continuity isn't tied to when a gate slot gets recycled --
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
    // where the *next* gate will spawn, so the segment beyond the upcoming
    // gate is visible in advance instead of only appearing once the Morph
    // passes through the current gate) + every live checkpoint (ascending z)
    // + a virtual trailing anchor pinned at DESPAWN_Z (so the most recently
    // passed checkpoint always has somewhere to connect to, keeping the
    // rails continuous all the way to the screen-bottom cutoff).
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
      const left = leftRailRefs.current[r]
      const right = rightRailRefs.current[r]
      if (!left || !right) continue

      const a = boundaries[r]
      const b = boundaries[r + 1]
      if (!a || !b) { left.visible = false; right.visible = false; continue }

      const depth = b.z - a.z
      const midZ = (a.z + b.z) / 2
      const visible = depth > 0.001
      left.position.set(-RAIL_X, GATE_Y, midZ)
      right.position.set(RAIL_X, GATE_Y, midZ)
      left.scale.set(1, depth, 1)
      right.scale.set(1, depth, 1)
      left.visible = visible
      right.visible = visible
      railMaterials[r].opacity = RAIL_ALPHA * Math.min(a.fadeIn, b.fadeIn)
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
      {Array.from({ length: ROAD_POOL }, (_, i) => (
        <group key={`rail-${i}`}>
          <mesh ref={el => { leftRailRefs.current[i] = el }}
            rotation={[-Math.PI / 2, 0, 0]} visible={false}>
            <cylinderGeometry args={[RAIL_RADIUS, RAIL_RADIUS, 1, 12]} />
            <primitive object={railMaterials[i]} attach="material" />
          </mesh>
          <mesh ref={el => { rightRailRefs.current[i] = el }}
            rotation={[-Math.PI / 2, 0, 0]} visible={false}>
            <cylinderGeometry args={[RAIL_RADIUS, RAIL_RADIUS, 1, 12]} />
            <primitive object={railMaterials[i]} attach="material" />
          </mesh>
        </group>
      ))}
    </>
  )
}
