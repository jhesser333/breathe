import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { makeCloud, applyCloud, CLOUD_MESH_COUNT, EMISSIVE_INTENSITY, OPACITY } from './cloudShapeF'

// Shape F (Hot Air Balloon): side clouds, scenery like the cube's landscape.
// A row on each side (X -20 / +20, y -6) drifts toward the camera at half the
// gate clouds' speed, one new random cloud (cloudShapeF's makeCloud) every
// SPACING units per side. The slider blows them around: Inhale slides them in
// to X -10 / +10, Exhale back out to -20 / +20. Each cloud follows the slider
// with a delay that grows with depth, so the nearest move first and farther
// ones follow, in both directions.
const POOL = 16
const SPAWN_Z = -30
const DESPAWN_Z = 14          // just behind the camera (z 12)
const SPACING = 10            // gate clouds' Exhale -> Inhale spacing (Slowing Down)
const Y = -6
const CLOUD_SCALE = 3       // whole cloud (parent and children) scaled up
const EXHALE_X = 20
const INHALE_X = 10
const FADE_S = 1
const SLIDE_DELAY_S = 1       // delay of the farthest clouds (SPAWN_Z); nearest 0
const HISTORY_S = SLIDE_DELAY_S + 0.5
// Half the gate clouds' travel per interval: Box 6 -> 3, others 20 -> 10.
// Own Pace has no gates: half the landscape's fixed 20/12 drift.
const TRAVEL = { box: 3, other: 10 }
const OWN_PACE_INTERVAL = 12

const makeSlot = () => ({ active: false, side: 1, z: 0, born: 0, cloud: makeCloud() })

export default function SideCloudsF({ mode, spawnIntervalRef, leftVal, livePaletteRef, palette }) {
  const slots = useRef(Array.from({ length: POOL }, makeSlot))
  const groupRefs = useRef([])
  const meshRefs = useRef(Array.from({ length: POOL }, () => []))

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 32, 16), [])
  const materials = useMemo(() => Array.from({ length: POOL }, () => new THREE.MeshStandardMaterial({
    color: palette.tertiaryColor,
    emissive: palette.tertiaryColor,
    emissiveIntensity: EMISSIVE_INTENSITY,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })), [palette])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  const travelRef = useRef(0)
  const filled = useRef(false)
  // Eased slider history: [time, lv] samples, oldest first.
  const history = useRef([])

  const spawn = (side, z, now) => {
    const i = slots.current.findIndex((o) => !o.active)
    if (i === -1) return
    const o = slots.current[i]
    Object.assign(o, makeSlot(), { active: true, side, z, born: now })
    applyCloud(meshRefs.current[i], o.cloud)
  }

  // Eased slider value at time t (interpolated from the history).
  const lvAt = (t) => {
    const h = history.current
    if (h.length === 0) return 0
    if (t <= h[0][0]) return h[0][1]
    for (let k = h.length - 1; k > 0; k--) {
      if (h[k - 1][0] <= t) {
        const [t0, v0] = h[k - 1], [t1, v1] = h[k]
        return t1 > t0 ? THREE.MathUtils.lerp(v0, v1, (t - t0) / (t1 - t0)) : v1
      }
    }
    return h[h.length - 1][1]
  }

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime

    const lv = THREE.MathUtils.smoothstep(leftVal.current, 0, 1)
    history.current.push([now, lv])
    while (history.current.length > 2 && history.current[1][0] < now - HISTORY_S) history.current.shift()

    // Fill the stretch from the spawn depth to the camera right away.
    if (!filled.current) {
      filled.current = true
      for (let z = SPAWN_Z; z < DESPAWN_Z; z += SPACING) { spawn(-1, z, now); spawn(1, z, now) }
      travelRef.current = 0
    }

    const interval = mode === 'basic' || !mode ? OWN_PACE_INTERVAL : spawnIntervalRef.current
    const speed = (mode === 'box' ? TRAVEL.box : TRAVEL.other) / Math.max(interval, 0.1)
    const step = speed * delta

    travelRef.current += step
    if (travelRef.current >= SPACING) {
      travelRef.current -= SPACING
      spawn(-1, SPAWN_Z + travelRef.current, now)
      spawn(1, SPAWN_Z + travelRef.current, now)
    }

    const live = livePaletteRef && livePaletteRef.current
    slots.current.forEach((o, i) => {
      const g = groupRefs.current[i]
      if (!g) return
      if (o.active) {
        o.z += step
        if (o.z > DESPAWN_Z) o.active = false
      }
      g.visible = o.active
      if (!o.active) return

      const depthFrac = THREE.MathUtils.clamp((DESPAWN_Z - o.z) / (DESPAWN_Z - SPAWN_Z), 0, 1)
      const v = lvAt(now - depthFrac * SLIDE_DELAY_S)
      g.position.set(o.side * THREE.MathUtils.lerp(EXHALE_X, INHALE_X, v), Y, o.z)

      const m = materials[i]
      m.opacity = OPACITY * THREE.MathUtils.smoothstep((now - o.born) / FADE_S, 0, 1)
      if (live) { m.color.copy(live.tertiary); m.emissive.copy(live.tertiary) }
    })
  })

  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <group key={i} ref={(el) => { groupRefs.current[i] = el }} visible={false} scale={CLOUD_SCALE}>
          {Array.from({ length: CLOUD_MESH_COUNT }, (_, k) => (
            <mesh key={k} ref={(el) => { meshRefs.current[i][k] = el }} geometry={geometry} material={materials[i]} />
          ))}
        </group>
      ))}
    </>
  )
}
