import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const POOL = 3
const TIES_PER_SEGMENT = 6   // 1 tie at the segment's leading gate + 5 equally spaced before the next gate
const LERP_SEGMENTS_MAX = 2  // max simultaneous real-gate-to-real-gate intervals (normally 1, with headroom)
const TIE_ALPHA = 0.15
const TIE_GAP = 0.1          // inset so the ties' X width would just touch (not overlap) imaginary rails
const TIE_HEIGHT_Y = 0.02
const TIE_DEPTH_Z = 0.03
const TIE_RADIUS = 0.005
const SPAWN_Z = -20
const DESPAWN_Z = 6
const FADE_DURATION = 1.0
const SPHERE_RADIUS = 0.25   // diameter = 0.5, matching Option B's cube block width
const POOL_EXHALE = 3
const EXHALE_SPAWN_Z = -30
const EXHALE_FADE_Z = -20
// Fixed real-world tie spacing, matching the standard 20-unit gate-to-gate
// distance divided into TIES_PER_SEGMENT equal steps. Ties in the preview
// (ahead of the next gate) and trailing (behind the last passed gate) zones
// use this constant spacing and scroll at their owning gate's own speed,
// rather than stretching to fit a virtual anchor -- that stretching was what
// caused individual ties to speed up/slow down with a jerk whenever a gate
// spawned or despawned and the segment's far boundary swapped from a fixed
// anchor to a real (or vice versa) moving gate.
const TIE_SPACING = Math.abs(SPAWN_Z) / TIES_PER_SEGMENT

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

function makeSlotExhale() {
  return { z: 0, speed: 0, active: false, fadeElapsed: 0 }
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

export default function GatesE({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor }) {
  const slots = useRef(Array.from({ length: POOL }, makeSlot))
  const groupRefs = useRef(Array.from({ length: POOL }, () => null))
  const matRefs = useRef(Array.from({ length: POOL }, () => null))
  const slotsExhale = useRef(Array.from({ length: POOL_EXHALE }, makeSlotExhale))
  const groupRefsExhale = useRef(Array.from({ length: POOL_EXHALE }, () => null))
  const matSphereRefs = useRef(Array.from({ length: POOL_EXHALE }, () => null))

  // Preview ties: the 6 ties (including the at-gate tie) ahead of the
  // frontmost real checkpoint, toward where the next gate will eventually
  // spawn. Scroll at the frontmost checkpoint's own speed, fixed spacing.
  const previewMaterials = useMemo(
    () => Array.from({ length: TIES_PER_SEGMENT }, () => createTieMaterial(gateColor)),
    [gateColor]
  )
  const previewRefs = useRef(makeTieRefArray())

  // Trailing-filler ties: continue past the backmost real checkpoint at the
  // same fixed spacing/speed, purely for visual continuity toward DESPAWN_Z
  // (most are hidden once they'd land past the cutoff -- usually only 1-2
  // are ever visible since the gap to DESPAWN_Z is small).
  const trailingMaterials = useMemo(
    () => Array.from({ length: TIES_PER_SEGMENT }, () => createTieMaterial(gateColor)),
    [gateColor]
  )
  const trailingRefs = useRef(makeTieRefArray())

  // Real-gate-to-real-gate segments: the dynamic "6 evenly spaced between two
  // gates" behavior the spacing was originally requested for. Both ends are
  // always real, equally-paced gates, so there's no anchor-swap velocity
  // jump here.
  const lerpMaterials = useMemo(
    () => Array.from({ length: LERP_SEGMENTS_MAX }, () => Array.from({ length: TIES_PER_SEGMENT }, () => createTieMaterial(gateColor))),
    [gateColor]
  )
  const lerpRefs = useRef(Array.from({ length: LERP_SEGMENTS_MAX }, makeTieRefArray))

  // Checkpoints track every gate spawn independently of the gate-mesh pool
  // above, so track continuity isn't tied to when a gate slot gets recycled --
  // a checkpoint lives until it scrolls past DESPAWN_Z (the same z used to
  // despawn gates, i.e. "off the bottom of the screen").
  const checkpoints = useRef([])

  const wasEnabled = useRef(false)
  const preSeedRef = useRef({ elapsed: 0, needsInitial: true })

  useFrame((_, delta) => {
    const spawnExhale = (speed) => {
      const slot = slotsExhale.current.find(s => !s.active)
      if (!slot) return
      Object.assign(slot, makeSlotExhale())
      slot.z = EXHALE_SPAWN_Z
      slot.speed = speed
      slot.active = true
    }

    const spawn = () => {
      const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      checkpoints.current.push({ z: SPAWN_Z, speed, fadeElapsed: 0 })

      const slot = slots.current.find(s => !s.active)
      if (!slot) return
      Object.assign(slot, makeSlot())
      slot.z = SPAWN_Z
      slot.speed = speed
      slot.active = true
      spawnExhale(speed)
    }

    if (!wasEnabled.current) {
      const pre = preSeedRef.current
      if (pre.needsInitial) {
        pre.needsInitial = false
        const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
        checkpoints.current.push({ z: SPAWN_Z, speed, fadeElapsed: 0 })
      } else {
        pre.elapsed += delta
        if (pre.elapsed >= spawnIntervalRef.current) {
          pre.elapsed -= spawnIntervalRef.current
          const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
          checkpoints.current.push({ z: SPAWN_Z, speed, fadeElapsed: 0 })
        }
      }
    }

    if (gatesEnabledRef.current && !wasEnabled.current) {
      wasEnabled.current = true
      checkpoints.current = []
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

    slotsExhale.current.forEach((slot, i) => {
      const group = groupRefsExhale.current[i]
      if (!group) return
      if (!slot.active) { group.visible = false; return }

      slot.z += slot.speed * delta

      if (slot.z > DESPAWN_Z) { slot.active = false; group.visible = false; return }

      group.position.z = slot.z

      if (slot.z < EXHALE_FADE_Z) { group.visible = false; return }

      slot.fadeElapsed += delta
      const fadeOut = slot.z > FADE_OUT_START
        ? 1 - smoothstep(Math.min((slot.z - FADE_OUT_START) / FADE_OUT_DURATION, 1))
        : 1
      const opacity = smoothstep(Math.min(slot.fadeElapsed / FADE_DURATION, 1)) * fadeOut
      if (matSphereRefs.current[i]) {
        matSphereRefs.current[i].opacity = opacity * 0.25
        matSphereRefs.current[i].emissiveIntensity = calcEmissive(slot.z) * 0.375
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
      {Array.from({ length: POOL_EXHALE }, (_, i) => (
        <group key={`exhale-${i}`} ref={el => { groupRefsExhale.current[i] = el }} visible={false}>
          <mesh position={[0, GATE_Y, 0]}>
            <sphereGeometry args={[SPHERE_RADIUS, 16, 16]} />
            <meshStandardMaterial ref={el => { matSphereRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} emissiveIntensity={0}
              roughness={0.5} metalness={0.1}
              transparent opacity={0} depthWrite={false} />
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
