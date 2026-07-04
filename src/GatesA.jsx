import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

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
const EXHALE_Y = 0.5 * 0.4   // 0.2
const INHALE_X = 0.5 * 1.2   // 0.6
const INHALE_Y = 0.5 * 3.5   // 1.75

// Non-uniform scale to stretch the circular torus into the right ellipse shape
// Exhale gate: X reduced to 1.05x clearance; Inhale gate: Y reduced to 1.05x clearance
const EXHALE_SCALE = [EXHALE_X * 1.05 / BASE_INNER, EXHALE_Y * 1.15 / BASE_INNER, 1]
const INHALE_SCALE = [INHALE_X * 1.15 / BASE_INNER, INHALE_Y * 1.05 / BASE_INNER, 1]

const EMISSIVE_START_Z = -3   // begin ramp: 0 → 1
const EMISSIVE_MID_Z = -0.5  // steeper ramp: 1 → 2
const MAX_EMISSIVE = 2
const FADE_OUT_START = 0
const FADE_OUT_DURATION = 2

const TIES_PER_SEGMENT = 6   // 1 tie at the segment's leading gate + 5 equally spaced before the next gate
const LERP_SEGMENTS_MAX = 2  // max simultaneous real-gate-to-real-gate intervals (normally 1, with headroom)
const TIE_ALPHA = 0.15
const TIE_GAP = 0.1          // inset so ties don't overlap the narrower (inhale) gate's interior edge
const TIE_HEIGHT_Y = 0.02
const TIE_DEPTH_Z = 0.03
const TIE_RADIUS = 0.005
// Exhale (A) and Inhale (B) gates spawn together every interval, 10 units
// apart (SPAWN_Z to GATE_B_Z) and alternate at a steady 10-unit spacing
// thereafter -- that's the standard real-gate-to-real-gate distance here
// (half of GatesC/D/E's 20, since this option has two gate types per cycle
// instead of one). Ties in the preview/trailing fixed-speed zones use this
// distance divided into TIES_PER_SEGMENT equal steps, scrolling at their
// owning gate's own speed rather than stretching toward a virtual anchor
// (which would cause a jerk whenever a gate spawns/despawns).
const TIE_SPACING = Math.abs(SPAWN_Z - GATE_B_Z) / TIES_PER_SEGMENT

// Ties must clear both gate shapes as they scroll past, so size to the
// narrower of the two -- the inhale torus's interior (inner-hole) half-width
// -- inset by TIE_GAP so they just touch (not overlap) that edge.
const GATE_INNER_HALF_X = BASE_INNER * INHALE_SCALE[0]
const TIE_WIDTH_X = 2 * (GATE_INNER_HALF_X - TIE_GAP)
const TIE_ARGS = [TIE_WIDTH_X, TIE_HEIGHT_Y, TIE_DEPTH_Z]

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

function makeSlotA() {
  return { z: 0, speed: 0, active: false, fadeElapsed: 0, hasTriggeredNext: false }
}
function makeSlotB() {
  return { z: 0, speed: 0, active: false, fadeElapsed: 0, hasTriggeredNext: false }
}

function createTieMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.5,
    metalness: 0.1,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
}

function makeTieRefArray() {
  return Array.from({ length: TIES_PER_SEGMENT }, () => null)
}

export default function GatesA({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor, breathPhaseRef }) {
  const slotsA = useRef(Array.from({ length: POOL_A }, makeSlotA))
  const groupRefsA = useRef(Array.from({ length: POOL_A }, () => null))
  const matRefsA = useRef(Array.from({ length: POOL_A }, () => null))

  const slotsB = useRef(Array.from({ length: POOL_B }, makeSlotB))
  const groupRefsB = useRef(Array.from({ length: POOL_B }, () => null))
  const matRefsB = useRef(Array.from({ length: POOL_B }, () => null))

  // Preview ties: the 6 ties (including the at-gate tie) ahead of the
  // frontmost real checkpoint (whichever of A/B is currently furthest
  // ahead), toward where the next gate will eventually spawn. Scroll at
  // that checkpoint's own speed, fixed spacing.
  const previewMaterials = useMemo(
    () => Array.from({ length: TIES_PER_SEGMENT }, () => createTieMaterial(gateColor)),
    [gateColor]
  )
  const previewRefs = useRef(makeTieRefArray())

  // Trailing-filler ties: continue past the backmost real checkpoint at the
  // same fixed spacing/speed, purely for visual continuity toward DESPAWN_Z.
  const trailingMaterials = useMemo(
    () => Array.from({ length: TIES_PER_SEGMENT }, () => createTieMaterial(gateColor)),
    [gateColor]
  )
  const trailingRefs = useRef(makeTieRefArray())

  // Real-gate-to-real-gate segments: the dynamic "6 evenly spaced between two
  // gates" behavior, applied between every consecutive pair of real gates
  // regardless of whether they're A (exhale) or B (inhale) type.
  const lerpMaterials = useMemo(
    () => Array.from({ length: LERP_SEGMENTS_MAX }, () => Array.from({ length: TIES_PER_SEGMENT }, () => createTieMaterial(gateColor))),
    [gateColor]
  )
  const lerpRefs = useRef(Array.from({ length: LERP_SEGMENTS_MAX }, makeTieRefArray))

  // Checkpoints track every gate spawn (both A and B) independently of the
  // gate-mesh pools above, in one combined list sorted by z regardless of
  // type, so ties fill evenly between whichever two real gates are adjacent.
  const checkpoints = useRef([])

  const wasEnabled = useRef(false)
  const preSeedRef = useRef({ elapsed: 0, needsInitial: true })

  useFrame((_, delta) => {
    const spawnB = (speed) => {
      checkpoints.current.push({ z: GATE_B_Z, speed, fadeElapsed: 0 })

      const slot = slotsB.current.find(s => !s.active)
      if (!slot) return
      Object.assign(slot, makeSlotB())
      slot.z = GATE_B_Z
      slot.speed = speed
      slot.active = true
    }

    const spawnA = () => {
      const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      checkpoints.current.push({ z: SPAWN_Z, speed, fadeElapsed: 0 })

      const slot = slotsA.current.find(s => !s.active)
      if (!slot) return
      Object.assign(slot, makeSlotA())
      slot.z = SPAWN_Z
      slot.speed = speed
      slot.active = true
      spawnB(speed)
    }

    if (!wasEnabled.current) {
      const pre = preSeedRef.current
      if (pre.needsInitial) {
        pre.needsInitial = false
        const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
        checkpoints.current.push({ z: SPAWN_Z, speed, fadeElapsed: 0 })
        checkpoints.current.push({ z: GATE_B_Z, speed, fadeElapsed: 0 })
      } else {
        pre.elapsed += delta
        if (pre.elapsed >= spawnIntervalRef.current) {
          pre.elapsed -= spawnIntervalRef.current
          const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
          checkpoints.current.push({ z: SPAWN_Z, speed, fadeElapsed: 0 })
          checkpoints.current.push({ z: GATE_B_Z, speed, fadeElapsed: 0 })
        }
      }
    }

    if (gatesEnabledRef.current && !wasEnabled.current) {
      wasEnabled.current = true
      checkpoints.current = []
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
      if (matRefsA.current[i]) {
        matRefsA.current[i].opacity = opacity
        matRefsA.current[i].emissiveIntensity = emissive
      }

      slot.z += slot.speed * delta

      if (slot.z >= 0 && !slot.hasTriggeredNext) {
        slot.hasTriggeredNext = true
        if (breathPhaseRef) breathPhaseRef.current = 'exhale'
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

      if (slot.z >= 0 && !slot.hasTriggeredNext) {
        slot.hasTriggeredNext = true
        if (breathPhaseRef) breathPhaseRef.current = 'inhale'
      }

      if (slot.z > DESPAWN_Z) { slot.active = false; group.visible = false; return }

      group.position.z = slot.z

      if (slot.z < GATE_B_FADE_Z) { group.visible = false; return }

      slot.fadeElapsed += delta
      const emissive = calcEmissive(slot.z)
      const fadeOut = slot.z > FADE_OUT_START
        ? 1 - smoothstep(Math.min((slot.z - FADE_OUT_START) / FADE_OUT_DURATION, 1))
        : 1
      const opacity = smoothstep(Math.min(slot.fadeElapsed / FADE_DURATION, 1)) * fadeOut
      if (matRefsB.current[i]) {
        matRefsB.current[i].opacity = opacity
        matRefsB.current[i].emissiveIntensity = emissive
      }
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

    const cps = checkpoints.current
    const frontmost = cps[0]
    const backmost = cps[cps.length - 1]

    // Preview: ties ahead of the frontmost gate, fixed spacing, scrolling at
    // its speed -- includes the at-gate tie (i=0).
    for (let i = 0; i < TIES_PER_SEGMENT; i++) {
      const mesh = previewRefs.current[i]
      if (!mesh) continue
      if (!frontmost) { mesh.visible = false; continue }
      mesh.position.z = frontmost.z - i * TIE_SPACING
      mesh.visible = true
      previewMaterials[i].opacity = TIE_ALPHA * smoothstep(Math.min(frontmost.fadeElapsed / FADE_DURATION, 1))
    }

    // Trailing filler: continues past the backmost gate at the same fixed
    // spacing/speed. Skip its own i=0 (at-gate) tie when it's also the
    // frontmost (only one checkpoint alive) since preview already drew it.
    const trailingStart = cps.length <= 1 ? 1 : 0
    for (let i = 0; i < TIES_PER_SEGMENT; i++) {
      const mesh = trailingRefs.current[i]
      if (!mesh) continue
      const z = backmost ? backmost.z + i * TIE_SPACING : 0
      if (!backmost || i < trailingStart || z > DESPAWN_Z) { mesh.visible = false; continue }
      mesh.position.z = z
      mesh.visible = true
      trailingMaterials[i].opacity = TIE_ALPHA * smoothstep(Math.min(backmost.fadeElapsed / FADE_DURATION, 1))
    }

    // Real-to-real: the dynamic "fill the gap with 6 evenly spaced ties"
    // behavior, applied only between two already-spawned (real) gates.
    for (let s = 0; s < LERP_SEGMENTS_MAX; s++) {
      const a = cps[s]
      const b = cps[s + 1]
      const depth = a && b ? b.z - a.z : 0
      const fadeIn = a && b ? Math.min(
        smoothstep(Math.min(a.fadeElapsed / FADE_DURATION, 1)),
        smoothstep(Math.min(b.fadeElapsed / FADE_DURATION, 1))
      ) : 0

      for (let i = 0; i < TIES_PER_SEGMENT; i++) {
        const mesh = lerpRefs.current[s][i]
        if (!mesh) continue
        if (!a || !b) { mesh.visible = false; continue }

        mesh.position.z = a.z + (i / TIES_PER_SEGMENT) * depth
        mesh.visible = true
        lerpMaterials[s][i].opacity = TIE_ALPHA * fadeIn
      }
    }
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
      {Array.from({ length: TIES_PER_SEGMENT }, (_, i) => (
        <RoundedBox key={`preview-${i}`}
          ref={el => { previewRefs.current[i] = el }}
          position={[0, GATE_Y, 0]} args={TIE_ARGS} radius={TIE_RADIUS} smoothness={2}
          visible={false}>
          <primitive object={previewMaterials[i]} attach="material" />
        </RoundedBox>
      ))}
      {Array.from({ length: TIES_PER_SEGMENT }, (_, i) => (
        <RoundedBox key={`trailing-${i}`}
          ref={el => { trailingRefs.current[i] = el }}
          position={[0, GATE_Y, 0]} args={TIE_ARGS} radius={TIE_RADIUS} smoothness={2}
          visible={false}>
          <primitive object={trailingMaterials[i]} attach="material" />
        </RoundedBox>
      ))}
      {Array.from({ length: LERP_SEGMENTS_MAX }, (_, s) => (
        Array.from({ length: TIES_PER_SEGMENT }, (_, i) => (
          <RoundedBox key={`lerp-${s}-${i}`}
            ref={el => { lerpRefs.current[s][i] = el }}
            position={[0, GATE_Y, 0]} args={TIE_ARGS} radius={TIE_RADIUS} smoothness={2}
            visible={false}>
            <primitive object={lerpMaterials[s][i]} attach="material" />
          </RoundedBox>
        ))
      ))}
    </>
  )
}
