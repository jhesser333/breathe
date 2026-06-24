import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const POOL = 3
const ROAD_POOL = 3          // max simultaneous road segments (checkpoints + trailing anchor)
const ROAD_ALPHA = 0.25
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

// Road mesh: a horizontal floor plane filling the gap between consecutive
// gates, width matching the gate's interior (inner-hole) opening in X.
const ROAD_WIDTH = 2 * BASE_INNER * GATE_SCALE[0]

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

// Road material: plane lies flat (rotated -90deg about X), local Y of the
// unrotated geometry maps to world Z (the stretch/depth direction) -- used
// here to build a V-shaped alpha gradient that's full at each gate end and
// zero at the midpoint between them.
function createRoadMaterial(color) {
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

  mat.customProgramCacheKey = () => `road-gates-e-${color}`

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying float vRoadY;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vRoadY = position.y;`
    )

    shader.fragmentShader = 'varying float vRoadY;\n' + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      `{
        float roadMask = clamp(abs(vRoadY) * 2.0, 0.0, 1.0);
        diffuseColor.a *= roadMask;
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

  const roadMaterials = useMemo(
    () => Array.from({ length: ROAD_POOL }, () => createRoadMaterial(gateColor)),
    [gateColor]
  )
  const roadMeshRefs = useRef(Array.from({ length: ROAD_POOL }, () => null))

  // Road checkpoints track every gate spawn independently of the gate-mesh
  // pool above, so the road's continuity isn't tied to when a gate slot
  // gets recycled -- a checkpoint lives until it scrolls past DESPAWN_Z
  // (the same z used to despawn gates, i.e. "off the bottom of the screen").
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
    // screen-bottom cutoff (DESPAWN_Z) -- this is what lets the road persist
    // continuously instead of popping based on the gate pool's own lifecycle.
    checkpoints.current.forEach(cp => {
      cp.z += cp.speed * delta
      cp.fadeElapsed += delta
    })
    checkpoints.current = checkpoints.current.filter(cp => cp.z <= DESPAWN_Z)
    checkpoints.current.sort((a, b) => a.z - b.z)

    // Boundaries = every live checkpoint (ascending z) plus a virtual
    // anchor pinned at the screen-bottom cutoff, so the trailing-most real
    // checkpoint always has somewhere to road-connect to -- this is what
    // makes the road follow the very first gate immediately and never
    // leave a gap near the camera.
    const boundaries = checkpoints.current.map(cp => ({
      z: cp.z,
      fadeIn: smoothstep(Math.min(cp.fadeElapsed / FADE_DURATION, 1)),
    }))
    if (boundaries.length > 0) boundaries.push({ z: DESPAWN_Z, fadeIn: 1 })

    for (let r = 0; r < ROAD_POOL; r++) {
      const mesh = roadMeshRefs.current[r]
      if (!mesh) continue

      const a = boundaries[r]
      const b = boundaries[r + 1]
      if (!a || !b) { mesh.visible = false; continue }

      const depth = b.z - a.z
      mesh.position.set(0, GATE_Y, (a.z + b.z) / 2)
      mesh.scale.set(ROAD_WIDTH, depth, 1)
      mesh.visible = depth > 0.001
      roadMaterials[r].opacity = ROAD_ALPHA * Math.min(a.fadeIn, b.fadeIn)
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
        <mesh key={`road-${i}`} ref={el => { roadMeshRefs.current[i] = el }}
          rotation={[-Math.PI / 2, 0, 0]} visible={false}>
          <planeGeometry args={[1, 1]} />
          <primitive object={roadMaterials[i]} attach="material" />
        </mesh>
      ))}
    </>
  )
}
