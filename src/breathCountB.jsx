import { useMemo, useRef } from 'react'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

// Shape B (Morphing Cube) only: 5-breath count pieces inside the cube.
//
// Pieces are children of the cube's scaled group, so they squash and stretch
// with it, but each sits inside a counter-scale of 1/INHALE_SCALE, so at full
// Inhale they're their true size (spheres perfectly round). Layouts are made
// in world units at Inhale, then converted to the group's local space.
//
// Each breath's Inhale grows the next piece 0 -> 1 as the count source (the
// left slider) moves GROW_START -> LOCK_AT; it follows the slider back down
// until it locks. Once all 5 are locked, the downward turn that starts breath
// 5's Exhale shrinks them away (SHRINK_S each, SHRINK_STAGGER_S apart), queues
// the palette change for breath 1 of the next group (same as MorphC), and
// counting moves to the next set.

export const COUNT = 5
const INHALE_SCALE = [1.2, 3.5, 1.2]     // MorphB's group scale at full Inhale (unit cube)
const HALF = INHALE_SCALE.map((v) => v / 2)
const MORPH_CORNER_RADIUS = 0.15         // MorphB's RoundedBox radius (unit cube)
const FIT_MARGIN = 0.01                  // local units kept clear of the cube's surface
const GROW_START = 0.25
const LOCK_AT = 0.98
const SHRINK_S = 1
const SHRINK_STAGGER_S = 0.25
const REVERSAL_DEADBAND = 0.08           // same as MorphC
const MAX_ALPHA = 0.5                    // MorphC's Count Cube material
const EMISSIVE = 2

// Sets take turns, one per 5-breath group.
const SPHERE_SET = 0
const STACK_SET = 1
const SET_COUNT = 2

// Spheres: radius 0.5 x a random 0.5-1, random spots inside the cube.
const SPHERE_RADIUS = 0.5
const SPHERE_SCALE = [0.5, 1]
const SPHERE_TRIES = 300

// Cube stack: same rules as MorphC's (tilted 30 deg, random Y angle, Y spin).
const STACK_GAP = 0.05
const STACK_FIT_MARGIN = 0.97
const STACK_TILT = -Math.PI / 6
const STACK_FIT_ANGLES = 36
const STACK_SPIN_SPEED = [0.3125, 0.625]
const STACK_CHAMFER = 0.1
const CUBE_CORNERS = Array.from({ length: 8 }, (_, k) => [k & 1 ? 0.5 : -0.5, k & 2 ? 0.5 : -0.5, k & 4 ? 0.5 : -0.5])

const randSpin = (range) => (Math.random() < 0.5 ? -1 : 1) * THREE.MathUtils.randFloat(...range)
const smooth = (t) => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t) }

// Is a world-at-Inhale point (relative to the cube's center) inside the
// cube's rounded box? The cube is convex, so a piece fits if all its corners
// (or sampled surface points) do.
function insideMorph(x, y, z) {
  const inner = 0.5 - MORPH_CORNER_RADIUS
  const qx = Math.max(Math.abs(x / INHALE_SCALE[0]) - inner, 0)
  const qy = Math.max(Math.abs(y / INHALE_SCALE[1]) - inner, 0)
  const qz = Math.max(Math.abs(z / INHALE_SCALE[2]) - inner, 0)
  return Math.sqrt(qx * qx + qy * qy + qz * qz) <= MORPH_CORNER_RADIUS - FIT_MARGIN
}

// Points spread over a unit sphere (Fibonacci), for the sphere fit test.
const SPHERE_SAMPLES = Array.from({ length: 64 }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / 64
  const r = Math.sqrt(1 - y * y)
  const th = i * Math.PI * (3 - Math.sqrt(5))
  return [r * Math.cos(th), y, r * Math.sin(th)]
})
const sphereFits = (x, y, z, r) => SPHERE_SAMPLES.every(([sx, sy, sz]) => insideMorph(x + sx * r, y + sy * r, z + sz * r))

function layoutSpheres() {
  const placed = []
  for (let k = 0; k < COUNT; k++) {
    let r = SPHERE_RADIUS * THREE.MathUtils.randFloat(...SPHERE_SCALE)
    let best = null
    for (let attempt = 0; attempt < SPHERE_TRIES * 4 && !best; attempt++) {
      // Shrink slightly if a big sphere keeps failing to fit at all.
      if (attempt > 0 && attempt % SPHERE_TRIES === 0) r *= 0.95
      const x = THREE.MathUtils.randFloatSpread(2 * Math.max(HALF[0] - r, 0))
      const y = THREE.MathUtils.randFloatSpread(2 * Math.max(HALF[1] - r, 0))
      const z = THREE.MathUtils.randFloatSpread(2 * Math.max(HALF[2] - r, 0))
      if (!sphereFits(x, y, z, r)) continue
      // Keep centers at least the larger radius apart, so none hides fully
      // inside another; after enough tries, take any spot that fits.
      const clear = placed.every((p) => Math.hypot(p.x - x, p.y - y, p.z - z) >= Math.max(p.s, r))
      if (clear || attempt >= SPHERE_TRIES * 2) best = { x, y, z, rx: 0, ry: 0, rz: 0, sx: r, sy: r, sz: r }
    }
    placed.push(best || { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: r, sy: r, sz: r })
    placed[placed.length - 1].s = r
  }
  return placed
}

// MorphC's layoutStack, fitted against the cube instead of an ellipsoid.
function layoutStack() {
  const ct = Math.cos(STACK_TILT), st = Math.sin(STACK_TILT)
  const spacingFor = (e) => (e + STACK_GAP) / ct
  const pieceFits = (w, e, yc) => {
    for (let n = 0; n < STACK_FIT_ANGLES; n++) {
      const th = (n / STACK_FIT_ANGLES) * Math.PI * 2, cy = Math.cos(th), sy = Math.sin(th)
      for (const [vx, vy, vz] of CUBE_CORNERS) {
        // scale, turn about Y, then tilt about X
        const x0 = vx * w, y0 = vy * e, z0 = vz * w
        const x1 = cy * x0 + sy * z0, z1 = -sy * x0 + cy * z0
        const y2 = ct * y0 - st * z1, z2 = st * y0 + ct * z1
        if (!insideMorph(x1, y2 + yc, z2)) return false
      }
    }
    return true
  }
  const search = (ok, hi) => {
    let lo = 0
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid }
    return lo
  }
  const e = search((e) => [-2, -1, 0, 1, 2].every((k) => pieceFits(e, e, k * spacingFor(e))), 2) * STACK_FIT_MARGIN
  return [-2, -1, 0, 1, 2].map((k) => {
    const y = k * spacingFor(e)
    const w = Math.abs(k) <= 1 ? search((w) => pieceFits(w, e, y), 2) * STACK_FIT_MARGIN : e
    return { x: 0, y, z: 0, rx: STACK_TILT, ry: Math.random() * Math.PI * 2, rz: 0, sx: w, sy: e, sz: w }
  })
}

const makePieceState = () => ({ grow: 0, shrinkStart: null, spinStart: null, spin: 0 })

export function useBreathCountB(palette) {
  const total = COUNT * SET_COUNT
  const wrapperRefs = useMemo(() => Array.from({ length: total }, () => ({ current: null })), [total])
  const pieceRefs = useMemo(() => Array.from({ length: total }, () => ({ current: null })), [total])
  const materials = useMemo(() => Array.from({ length: total }, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.primaryColor),
    emissive: new THREE.Color(palette.primaryColor),
    emissiveIntensity: EMISSIVE,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: MAX_ALPHA,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [total])
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(1, 32, 16), [])

  const layoutRef = useRef(Array.from({ length: total }, () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 })))
  const pieceStateRef = useRef(Array.from({ length: total }, makePieceState))
  const s = useRef({
    wasEnabled: false, cycle: 0, activeSet: SPHERE_SET, locked: 0,
    dir: -1, extreme: 0, armed: true, palettePending: false,
  })

  const applyLayout = (i) => {
    const w = wrapperRefs[i].current
    const b = layoutRef.current[i]
    if (w) w.position.set(b.x / INHALE_SCALE[0], b.y / INHALE_SCALE[1], b.z / INHALE_SCALE[2])
  }
  const resetSet = (set) => {
    for (let i = set * COUNT; i < (set + 1) * COUNT; i++) {
      pieceStateRef.current[i] = makePieceState()
      const p = pieceRefs[i].current
      if (p) { p.visible = false; p.scale.setScalar(0) }
    }
  }
  const activateSet = (set) => {
    const layout = set === SPHERE_SET ? layoutSpheres() : layoutStack()
    layout.forEach((b, k) => { layoutRef.current[set * COUNT + k] = b; applyLayout(set * COUNT + k) })
    resetSet(set)
    s.current.activeSet = set
  }

  // raw: count source (0 exhale -> 1 inhale); countingEnabled: from App.
  const update = (now, raw, countingEnabled, onBreathPaletteCycle, livePaletteRef) => {
    const st = s.current
    if (countingEnabled !== st.wasEnabled) {
      st.cycle = 0; st.locked = 0; st.dir = -1; st.extreme = raw; st.armed = true; st.palettePending = false
      for (let set = 0; set < SET_COUNT; set++) resetSet(set)
      activateSet(SPHERE_SET)
    }
    st.wasEnabled = countingEnabled

    if (countingEnabled) {
      // Deadband rise/fall tracker (same as MorphC): a confirmed rise from a
      // trough arms the next piece, so one held Inhale can't lock several.
      if (st.dir >= 0) {
        if (raw > st.extreme) st.extreme = raw
        else if (st.extreme - raw > REVERSAL_DEADBAND) { st.dir = -1; st.extreme = raw }
      } else if (raw < st.extreme) {
        st.extreme = raw
      } else if (raw - st.extreme > REVERSAL_DEADBAND) {
        st.dir = 1; st.extreme = raw; st.armed = true
        if (st.palettePending) {
          st.palettePending = false
          if (onBreathPaletteCycle) onBreathPaletteCycle(now)
        }
      }

      const base = st.activeSet * COUNT
      if (st.locked < COUNT) {
        if (st.armed) {
          const i = base + st.locked
          const ps = pieceStateRef.current[i]
          ps.grow = smooth((raw - GROW_START) / (LOCK_AT - GROW_START))
          if (ps.grow > 0 && ps.spinStart === null && st.activeSet === STACK_SET) {
            ps.spinStart = now
            ps.spin = randSpin(STACK_SPIN_SPEED)
          }
          if (raw >= LOCK_AT) { ps.grow = 1; st.locked += 1; st.armed = false }
        }
      } else if (st.dir === -1) {
        // All 5 locked and breath 5's Exhale has begun: shrink them away.
        const order = [0, 1, 2, 3, 4]
        if (st.activeSet === STACK_SET) {
          order.sort((p, q) => layoutRef.current[base + q].y - layoutRef.current[base + p].y)   // top-down
        } else {
          for (let k = order.length - 1; k > 0; k--) {
            const j = Math.floor(Math.random() * (k + 1))
            ;[order[k], order[j]] = [order[j], order[k]]
          }
        }
        order.forEach((k, pos) => { pieceStateRef.current[base + k].shrinkStart = now + pos * SHRINK_STAGGER_S })
        st.palettePending = true
        st.cycle += 1
        st.locked = 0
        activateSet(st.cycle % SET_COUNT)
      }
    }

    // Pose every piece: grow/shrink scale x size, rotation (+ stack Y spin).
    for (let i = 0; i < total; i++) {
      const p = pieceRefs[i].current
      if (!p) continue
      const ps = pieceStateRef.current[i]
      const b = layoutRef.current[i]
      let f = ps.grow
      if (ps.shrinkStart !== null && now >= ps.shrinkStart) {
        const t = (now - ps.shrinkStart) / SHRINK_S
        if (t >= 1) { pieceStateRef.current[i] = makePieceState(); p.visible = false; continue }
        f *= 1 - smooth(t)
      }
      if (!countingEnabled && ps.shrinkStart === null) f = 0
      p.visible = f > 0.0001
      p.scale.set(b.sx * f, b.sy * f, b.sz * f)
      const spun = ps.spinStart === null ? 0 : ps.spin * (now - ps.spinStart)
      p.rotation.set(b.rx, b.ry + spun, b.rz)
    }

    if (livePaletteRef && livePaletteRef.current) {
      const live = livePaletteRef.current
      materials.forEach((m) => { m.color.copy(live.primary); m.emissive.copy(live.primary) })
    }
  }

  const elements = Array.from({ length: total }, (_, i) => (
    <group key={`count-${i}`} ref={(obj) => { wrapperRefs[i].current = obj; applyLayout(i) }}
      scale={[1 / INHALE_SCALE[0], 1 / INHALE_SCALE[1], 1 / INHALE_SCALE[2]]}>
      <group ref={(obj) => { pieceRefs[i].current = obj }} visible={false} scale={0}>
        {Math.floor(i / COUNT) === SPHERE_SET ? (
          <mesh geometry={sphereGeometry} material={materials[i]} />
        ) : (
          <RoundedBox args={[1, 1, 1]} radius={STACK_CHAMFER} smoothness={4} material={materials[i]} />
        )}
      </group>
    </group>
  ))

  return { elements, update }
}
