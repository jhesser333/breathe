import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { createCubeMorphMaterial, applyGateLook } from './cubeMaterialB'
import { makeTetraGeometry } from './breathCountB'

// Shape B (Morphing Cube) only: landscape shapes on both sides of the road,
// flowing toward the camera with the targets. The kind changes with every
// 5-breath group, at the palette change (landscapeIndexRef, advanced by
// breathCountB): spheres, rounded cubes, tetrahedrons, repeating. Shapes
// already on screen keep their kind, so each new landscape rolls in from the
// far end.
//
// Look: the targets' approach look (the cube Morph's Exhale material, see
// cubeMaterialB) but with the tertiary color for base and glow at emissive
// 0.5 (LANDSCAPE_LOOK). Speed matches the targets: Box Breathing 6/interval,
// Slowing Down/Paced 20/interval (as GatesB and its ties), Breathe at Your
// Own Pace a fixed 20/12 drift.

const KINDS = ['sphere', 'cube', 'tetra']
const POOL = 48
const SPAWN_Z = -20
const DESPAWN_Z = 7.5            // past the camera (z=5)
const Y = 0
const SCALE = [1, 3]             // diameter
const GAP = [2, 5]               // units of travel between spawns, per side
const EXCLUDE_X = 1.5            // keep clear of the targets (outer edge 1.15) and ties
const FADE_S = 1
const OWN_PACE_INTERVAL = 12
// Tertiary color for both base and glow, emissive 0.5 (otherwise the
// targets' approach look).
const LANDSCAPE_LOOK = { roughness: 0.3, metalness: 0, approachEmissive: 0.5, emissiveFrom: 'tertiary' }
const TARGET_SPAWN_DIST = { box: 6, other: 20 }

const _v = new THREE.Vector3()

// X of the camera view's edge at depth z on the y=0 plane (the camera has no
// yaw, so screen x is proportional to world x at a fixed depth).
function viewHalfWidth(camera, z) {
  _v.set(1, Y, z).project(camera)
  return _v.x > 1e-6 ? 1 / _v.x : 0
}

const makeSlot = () => ({ active: false, kind: 'sphere', x: 0, z: 0, s: 1, rx: 0, ry: 0, rz: 0, born: 0 })

export default function LandscapeB({ mode, spawnIntervalRef, landscapeIndexRef, livePaletteRef, palette }) {
  const slots = useRef(Array.from({ length: POOL }, makeSlot))
  const groupRefs = useMemo(() => Array.from({ length: POOL }, () => ({ current: null })), [])
  const meshRefs = useMemo(() => Array.from({ length: POOL }, () => ({ sphere: null, cube: null, tetra: null })), [])
  const mats = useMemo(() => Array.from({ length: POOL }, () => createCubeMorphMaterial(palette.tertiaryColor, palette.tertiaryColor)),
    [palette.tertiaryColor])
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 32, 16), [])
  const tetraGeometry = useMemo(() => {
    const g = makeTetraGeometry()   // circumradius 1
    g.scale(0.5, 0.5, 0.5)
    return g
  }, [])
  // Per side: travel since the last spawn, and the gap to the next one.
  const sides = useRef([-1, 1].map((dir) => ({ dir, travel: 0, next: THREE.MathUtils.randFloat(...GAP) })))
  const filled = useRef(false)

  const spawn = (dir, z, camera, now) => {
    const s = THREE.MathUtils.randFloat(...SCALE)
    const r = s / 2
    const lo = EXCLUDE_X + r
    const hi = viewHalfWidth(camera, z)
    if (hi <= lo) return
    const slot = slots.current.find((o) => !o.active)
    if (!slot) return
    const kind = KINDS[((landscapeIndexRef?.current ?? 0) % KINDS.length + KINDS.length) % KINDS.length]
    const TAU = Math.PI * 2
    Object.assign(slot, {
      active: true, kind, s, z, born: now,
      x: dir * THREE.MathUtils.randFloat(lo, hi),
      rx: kind === 'tetra' ? Math.random() * TAU : 0,
      ry: kind === 'sphere' ? 0 : Math.random() * TAU,
      rz: kind === 'tetra' ? Math.random() * TAU : 0,
    })
  }

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime
    const camera = state.camera
    camera.updateMatrixWorld()

    // Fill the stretch from the spawn depth to the camera right away.
    if (!filled.current) {
      filled.current = true
      for (const side of sides.current) {
        for (let z = SPAWN_Z + side.next; z < DESPAWN_Z; z += THREE.MathUtils.randFloat(...GAP)) spawn(side.dir, z, camera, now)
      }
    }

    const interval = mode === 'basic' || !mode ? OWN_PACE_INTERVAL : spawnIntervalRef.current
    const speed = (mode === 'box' ? TARGET_SPAWN_DIST.box : TARGET_SPAWN_DIST.other) / Math.max(interval, 0.1)
    const step = speed * delta

    for (const side of sides.current) {
      side.travel += step
      if (side.travel >= side.next) {
        side.travel -= side.next
        side.next = THREE.MathUtils.randFloat(...GAP)
        spawn(side.dir, SPAWN_Z + side.travel, camera, now)
      }
    }

    const live = livePaletteRef && livePaletteRef.current
    for (let i = 0; i < POOL; i++) {
      const o = slots.current[i]
      const g = groupRefs[i].current
      if (!g) continue
      if (o.active) {
        o.z += step
        if (o.z > DESPAWN_Z) o.active = false
      }
      g.visible = o.active
      if (!o.active) continue
      g.position.set(o.x, Y, o.z)
      g.rotation.set(o.rx, o.ry, o.rz)
      g.scale.setScalar(o.s)
      const m = meshRefs[i]
      for (const k of KINDS) if (m[k]) m[k].visible = k === o.kind
      const fadeIn = THREE.MathUtils.smoothstep(Math.min((now - o.born) / FADE_S, 1), 0, 1)
      applyGateLook(mats[i], 0, fadeIn, 0, live, LANDSCAPE_LOOK)
    }
  })

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i} ref={(obj) => { groupRefs[i].current = obj }} visible={false}>
          <mesh ref={(obj) => { meshRefs[i].sphere = obj }} geometry={sphereGeometry} material={mats[i].material} />
          <RoundedBox ref={(obj) => { meshRefs[i].cube = obj }} args={[1, 1, 1]} radius={0.1} smoothness={3} material={mats[i].material} />
          <mesh ref={(obj) => { meshRefs[i].tetra = obj }} geometry={tetraGeometry} material={mats[i].material} />
        </group>
      ))}
    </>
  )
}
