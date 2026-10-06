import { useMemo, useRef } from 'react'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { makeTetraGeometry } from './breathCountB'

// Shape F (Hot Air Balloon) only: 5-breath count pieces inside the balloon
// envelope. Same counting engine as the cube's (breathCountB.jsx: deadband
// breath tracker, grow-in, shrink after 5, palette change, count events,
// material), with its own 7 sets fitted to the envelope's Inhale ellipsoid.
//
// Layouts are made in world units at full Inhale, relative to the envelope's
// center. MorphF scales the count group so its local units are those world
// units at Inhale; the pieces travel with the balloon and squash/stretch with
// the envelope at Exhale.

export const COUNT = 5
const FIT_MARGIN = 0.02                  // fraction of the envelope kept clear
const GROW_START = 0.25
const LOCK_AT = 0.98
const SHRINK_S = 1
const SHRINK_STAGGER_S = 0.25
const REVERSAL_DEADBAND = 0.08
const USER_APPEAR_S = 1
const MAX_ALPHA = 0.5
const EMISSIVE = 4
// Alpha scales by REF_LUMINANCE / the live secondary's luminance (capped at
// 1), as in breathCountB, so lighter secondaries don't read as solid blocks.
const REF_LUMINANCE = 0.035

// Sets take turns, one per 5-breath group, in this order.
const NEST_SPHERE_SET = 0   // nested spheres (envelope-shaped)
const TOWER_SET = 1         // tilted cube tower
const NEST_CUBE_SET = 2     // nested rounded cubes
const TETRA_RANDOM_SET = 3  // tetrahedrons, random spawn
const RING_SET = 4          // nested thick circular rings
const NEST_TETRA_SET = 5    // nested tetrahedrons
const CUBE_RANDOM_SET = 6   // rounded cubes, random spawn
const SET_COUNT = 7

// Nested sets: all centered, #1 is 25% of #5, appearing smallest -> largest.
const NEST_STEPS = [0.25, 0.4375, 0.625, 0.8125, 1]
const NEST_SPHERE_FIT = 0.98              // #5 sphere: the envelope's Inhale shape x this
const NEST_CUBE_CHAMFER = 0.15            // RoundedBox radius on the unit cube
const RING_TUBE = 0.1                     // ring tube / ring radius (2x+ the cube's rings)
// Random-spawn sets: sizes per piece; each piece's bounding sphere stays
// inside the envelope, so it can tumble freely without clipping the balloon.
const TETRA_RANDOM_R = [0.6, 1.2]         // circumradius
const CUBE_RANDOM_EDGE = [0.8, 1.6]
const RANDOM_CHAMFER = 0.1
const RANDOM_TRIES = 200

// Cube tower: the cube's stack rules (tilted 30 deg, random Y angle, Y spin).
const STACK_GAP = 0.05
const STACK_FIT_MARGIN = 0.97
const STACK_TILT = -Math.PI / 6
const STACK_FIT_ANGLES = 36
const STACK_CHAMFER = 0.1
const SPIN_SPEED = [0.3125, 0.625]
const CUBE_CORNERS = Array.from({ length: 8 }, (_, k) => [k & 1 ? 0.5 : -0.5, k & 2 ? 0.5 : -0.5, k & 4 ? 0.5 : -0.5])

const randSpin = (range) => (Math.random() < 0.5 ? -1 : 1) * THREE.MathUtils.randFloat(...range)
const smooth = (t) => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t) }
const bisect = (ok, hi) => {
  let lo = 0
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid }
  return lo
}
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Points spread over a unit sphere (Fibonacci).
const SPHERE_SAMPLES = Array.from({ length: 64 }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / 64
  const r = Math.sqrt(1 - y * y)
  const th = i * Math.PI * (3 - Math.sqrt(5))
  return [r * Math.cos(th), y, r * Math.sin(th)]
})

// Fit helpers and fixed sizes for an envelope with Inhale half-extents E.
function makeFit(E) {
  const lim = (1 - FIT_MARGIN) ** 2
  const inside = (x, y, z) => (x / E[0]) ** 2 + (y / E[1]) ** 2 + (z / E[2]) ** 2 <= lim
  const sphereFits = (x, y, z, r) => SPHERE_SAMPLES.every(([sx, sy, sz]) => inside(x + sx * r, y + sy * r, z + sz * r))
  const maxE = Math.max(...E)

  // Largest sphere at the center: nested tetrahedrons' #5 circumradius.
  const centerRadius = bisect((r) => sphereFits(0, 0, 0, r), maxE)

  // Nested cubes: box proportional to E with the unit cube's corner rounding
  // (scaled with it); #5 = the largest that fits, from sampled corner points.
  const roundedPts = []
  for (const [cx, cy, cz] of CUBE_CORNERS) {
    const inner = 0.5 - NEST_CUBE_CHAMFER
    for (const [sx, sy, sz] of SPHERE_SAMPLES) {
      roundedPts.push([Math.sign(cx) * inner + sx * NEST_CUBE_CHAMFER, Math.sign(cy) * inner + sy * NEST_CUBE_CHAMFER, Math.sign(cz) * inner + sz * NEST_CUBE_CHAMFER])
    }
  }
  const nestCubeK = bisect((k) => roundedPts.every(([x, y, z]) => inside(x * 2 * k * E[0], y * 2 * k * E[1], z * 2 * k * E[2])), 1)
  const nestCubeSize = E.map((v) => 2 * nestCubeK * v)

  // Rings: largest circle (radius R, tube RING_TUBE x R) whose whole tube
  // stays inside at every Y angle, so the Y spin never clips.
  const ringPts = []
  for (let a = 0; a < 24; a++) {
    const phi = (a / 24) * Math.PI * 2
    for (let b = 0; b < 12; b++) {
      const psi = (b / 12) * Math.PI * 2
      const rr = 1 + RING_TUBE * Math.cos(psi)
      ringPts.push([rr * Math.cos(phi), rr * Math.sin(phi), RING_TUBE * Math.sin(psi)])
    }
  }
  const ringFits = (R) => {
    for (let n = 0; n < 12; n++) {
      const th = (n / 12) * Math.PI, c = Math.cos(th), s = Math.sin(th)
      for (const [x, y, z] of ringPts) {
        if (!inside(R * (c * x + s * z), R * y, R * (-s * x + c * z))) return false
      }
    }
    return true
  }
  const ringRadius = bisect(ringFits, maxE)

  // Cube tower (the cube's layoutStack, fitted to the ellipsoid).
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
        if (!inside(x1, y2 + yc, z2)) return false
      }
    }
    return true
  }
  const towerEdge = bisect((e) => [-2, -1, 0, 1, 2].every((k) => pieceFits(e, e, k * spacingFor(e))), 2 * maxE) * STACK_FIT_MARGIN
  const towerWidths = [-2, -1, 0, 1, 2].map((k) => (Math.abs(k) <= 1
    ? bisect((w) => pieceFits(w, towerEdge, k * spacingFor(towerEdge)), 2 * maxE) * STACK_FIT_MARGIN
    : towerEdge))

  // Random point where a bounding sphere of radius r fits.
  const randomFit = (r) => {
    for (let t = 0; t < RANDOM_TRIES; t++) {
      const x = THREE.MathUtils.randFloatSpread(2 * E[0]), y = THREE.MathUtils.randFloatSpread(2 * E[1]), z = THREE.MathUtils.randFloatSpread(2 * E[2])
      if (sphereFits(x, y, z, r)) return [x, y, z]
    }
    return [0, 0, 0]
  }

  return { centerRadius, nestCubeSize, ringRadius, towerEdge, towerWidths, spacingFor, randomFit }
}

const centered = (sx, sy, sz, ry = 0) => ({ x: 0, y: 0, z: 0, rx: 0, ry, rz: 0, sx, sy, sz })
const randAngle = () => Math.random() * Math.PI * 2
const randomPiece = (fit, r, size) => {
  const [x, y, z] = fit.randomFit(r)
  return { x, y, z, rx: randAngle(), ry: randAngle(), rz: randAngle(), sx: size, sy: size, sz: size }
}

// Layout for a set; pieces appear in array order.
function layoutSet(set, E, fit) {
  if (set === NEST_SPHERE_SET) return NEST_STEPS.map((k) => centered(E[0] * NEST_SPHERE_FIT * k, E[1] * NEST_SPHERE_FIT * k, E[2] * NEST_SPHERE_FIT * k))
  if (set === TOWER_SET) {
    // Random spawn: slots fill in shuffled order.
    return shuffle([-2, -1, 0, 1, 2].map((k, i) => {
      const w = fit.towerWidths[i]
      return { x: 0, y: k * fit.spacingFor(fit.towerEdge), z: 0, rx: STACK_TILT, ry: randAngle(), rz: 0, sx: w, sy: fit.towerEdge, sz: w }
    }))
  }
  if (set === NEST_CUBE_SET) return NEST_STEPS.map((k) => centered(fit.nestCubeSize[0] * k, fit.nestCubeSize[1] * k, fit.nestCubeSize[2] * k))
  if (set === TETRA_RANDOM_SET) {
    return Array.from({ length: COUNT }, () => {
      const r = THREE.MathUtils.randFloat(...TETRA_RANDOM_R)
      return randomPiece(fit, r, r)
    })
  }
  if (set === RING_SET) return shuffle(NEST_STEPS.slice()).map((k) => centered(fit.ringRadius * k, fit.ringRadius * k, fit.ringRadius * k, randAngle()))
  if (set === NEST_TETRA_SET) {
    return NEST_STEPS.map((k) => {
      const r = fit.centerRadius * k
      return { x: 0, y: 0, z: 0, rx: randAngle(), ry: randAngle(), rz: randAngle(), sx: r, sy: r, sz: r }
    })
  }
  // CUBE_RANDOM_SET
  return Array.from({ length: COUNT }, () => {
    const edge = THREE.MathUtils.randFloat(...CUBE_RANDOM_EDGE)
    return randomPiece(fit, edge * Math.sqrt(3) / 2, edge)
  })
}

// Spin (rad/s per axis) a piece starts when it begins to appear.
function makeSpin(set) {
  if (set === TOWER_SET || set === RING_SET) return [0, randSpin(SPIN_SPEED), 0]
  if (set === TETRA_RANDOM_SET || set === NEST_TETRA_SET || set === CUBE_RANDOM_SET) return [randSpin(SPIN_SPEED), randSpin(SPIN_SPEED), randSpin(SPIN_SPEED)]
  return null
}

const makePieceState = () => ({ grow: 0, appearStart: null, shrinkStart: null, spinStart: null, spin: null })

// inhaleHalf: the envelope's world half-extents at full Inhale.
export function useBreathCountF(palette, inhaleHalf) {
  const total = COUNT * SET_COUNT
  const [e0, e1, e2] = inhaleHalf
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const E = useMemo(() => [e0, e1, e2], [e0, e1, e2])
  const fit = useMemo(() => makeFit(E), [E])
  const pieceRefs = useMemo(() => Array.from({ length: total }, () => ({ current: null })), [total])
  const materials = useMemo(() => Array.from({ length: total }, () => new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.secondaryColor),
    emissive: new THREE.Color(palette.secondaryColor),
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
  const tetraGeometry = useMemo(() => makeTetraGeometry(), [])
  const ringGeometry = useMemo(() => new THREE.TorusGeometry(1, RING_TUBE, 16, 64), [])

  const layoutRef = useRef(Array.from({ length: total }, () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 })))
  const pieceStateRef = useRef(Array.from({ length: total }, makePieceState))
  const s = useRef({
    wasEnabled: false, cycle: 0, activeSet: NEST_SPHERE_SET, locked: 0,
    dir: -1, extreme: 0, armed: true, palettePending: false,
  })

  const applyLayout = (i) => {
    const p = pieceRefs[i].current
    const b = layoutRef.current[i]
    if (p) p.position.set(b.x, b.y, b.z)
  }
  const resetSet = (set) => {
    for (let i = set * COUNT; i < (set + 1) * COUNT; i++) {
      pieceStateRef.current[i] = makePieceState()
      const p = pieceRefs[i].current
      if (p) { p.visible = false; p.scale.setScalar(0) }
    }
  }
  const activateSet = (set) => {
    const layout = layoutSet(set, E, fit)
    layout.forEach((b, k) => { layoutRef.current[set * COUNT + k] = b; applyLayout(set * COUNT + k) })
    resetSet(set)
    s.current.activeSet = set
  }

  // Same signature and counting as breathCountB's update.
  const update = (now, raw, countingEnabled, onBreathPaletteCycle, livePaletteRef, landscapeIndexRef, onBreathCountEvent, userDriven = false) => {
    const st = s.current
    if (countingEnabled !== st.wasEnabled) {
      st.cycle = 0; st.locked = 0; st.dir = -1; st.extreme = raw; st.armed = raw <= GROW_START; st.palettePending = false
      if (landscapeIndexRef) landscapeIndexRef.current = 0
      for (let set = 0; set < SET_COUNT; set++) resetSet(set)
      activateSet(NEST_SPHERE_SET)
    }
    st.wasEnabled = countingEnabled

    if (countingEnabled) {
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
          if (landscapeIndexRef) landscapeIndexRef.current += 1
        }
        if (userDriven && st.locked < COUNT) {
          const ps = pieceStateRef.current[st.activeSet * COUNT + st.locked]
          ps.appearStart = now
          ps.spinStart = now
          ps.spin = makeSpin(st.activeSet)
          if (onBreathCountEvent) onBreathCountEvent('breath', st.cycle, st.locked + 1)
          st.locked += 1
          st.armed = false
        }
      }

      const base = st.activeSet * COUNT
      if (st.locked < COUNT) {
        if (st.armed && !userDriven) {
          const i = base + st.locked
          const ps = pieceStateRef.current[i]
          ps.grow = smooth((raw - GROW_START) / (LOCK_AT - GROW_START))
          if (ps.grow > 0 && ps.spinStart === null) {
            ps.spinStart = now
            ps.spin = makeSpin(st.activeSet)
            if (onBreathCountEvent) onBreathCountEvent('breath', st.cycle, st.locked + 1)
          }
          if (raw >= LOCK_AT) { ps.grow = 1; st.locked += 1; st.armed = false }
        }
      } else if (st.dir === -1) {
        // All 5 locked and breath 5's Exhale has begun: shrink them away.
        const order = [0, 1, 2, 3, 4]
        if (st.activeSet === TOWER_SET) {
          order.sort((p, q) => layoutRef.current[base + q].y - layoutRef.current[base + p].y)   // top-down
        } else if (st.activeSet === NEST_SPHERE_SET || st.activeSet === NEST_CUBE_SET || st.activeSet === NEST_TETRA_SET) {
          order.reverse()   // largest first, so the inner ones go last
        } else {
          shuffle(order)
        }
        order.forEach((k, pos) => { pieceStateRef.current[base + k].shrinkStart = now + pos * SHRINK_STAGGER_S })
        st.palettePending = true
        if (onBreathCountEvent) onBreathCountEvent('cycleDone', st.cycle)
        st.cycle += 1
        st.locked = 0
        activateSet(st.cycle % SET_COUNT)
      }
    }

    // Pose every piece: grow/shrink scale x size, rotation + spin.
    for (let i = 0; i < total; i++) {
      const p = pieceRefs[i].current
      if (!p) continue
      const ps = pieceStateRef.current[i]
      const b = layoutRef.current[i]
      let f = ps.appearStart !== null ? smooth((now - ps.appearStart) / USER_APPEAR_S) : ps.grow
      if (ps.shrinkStart !== null && now >= ps.shrinkStart) {
        const t = (now - ps.shrinkStart) / SHRINK_S
        if (t >= 1) { pieceStateRef.current[i] = makePieceState(); p.visible = false; continue }
        f *= 1 - smooth(t)
      }
      if (!countingEnabled && ps.shrinkStart === null) f = 0
      p.visible = f > 0.0001
      p.scale.set(b.sx * f, b.sy * f, b.sz * f)
      const w = ps.spin || [0, 0, 0]
      const t = ps.spinStart === null ? 0 : now - ps.spinStart
      p.rotation.set(b.rx + w[0] * t, b.ry + w[1] * t, b.rz + w[2] * t)
    }

    if (livePaletteRef && livePaletteRef.current) {
      const live = livePaletteRef.current
      const c = live.secondary
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b   // live colors are linear
      const alpha = MAX_ALPHA * Math.min(1, REF_LUMINANCE / Math.max(lum, 1e-4))
      materials.forEach((m) => { m.color.copy(c); m.emissive.copy(c); m.opacity = alpha })
    }
  }

  const elements = Array.from({ length: total }, (_, i) => {
    const set = Math.floor(i / COUNT)
    return (
      <group key={`count-${i}`} ref={(obj) => { pieceRefs[i].current = obj; applyLayout(i) }} visible={false} scale={0}>
        {set === NEST_SPHERE_SET ? (
          <mesh geometry={sphereGeometry} material={materials[i]} />
        ) : set === TETRA_RANDOM_SET || set === NEST_TETRA_SET ? (
          <mesh geometry={tetraGeometry} material={materials[i]} />
        ) : set === RING_SET ? (
          <mesh geometry={ringGeometry} material={materials[i]} />
        ) : (
          <RoundedBox args={[1, 1, 1]} radius={set === NEST_CUBE_SET ? NEST_CUBE_CHAMFER : set === TOWER_SET ? STACK_CHAMFER : RANDOM_CHAMFER} smoothness={4} material={materials[i]} />
        )}
      </group>
    )
  })

  return { elements, update }
}
