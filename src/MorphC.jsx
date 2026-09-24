import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { BASE_RADIUS, BASE_TUBE, GATE_SCALE } from './BackgroundRingsD'

const PARTICLE_COUNT = 1500       // system 1: static surface sparkle, no velocity
const PARTICLE_COUNT_2 = 700      // system 2: blown-away / sucked-in, XZ velocity only
const SPHERE_RADIUS = 0.5
const MAX_SPAWN_RATE = 300        // particles/sec, shared by both systems
const SPREAD_2 = 0.9              // max XZ travel distance for system 2
const MAX_SPAWN_PER_FRAME = 150   // safety cap against huge dt spikes (e.g. tab refocus)
const SPAWN_SENTINEL = -1e4
const DIRECTION_DEADBAND = 1e-5   // ignore sub-pixel lv jitter when deciding flow direction
const OPTION_D_EXHALE_X_SCALE = 3     // Option D only: replaces the shared 4 at full exhale
const OPTION_D_EXHALE_Y_SCALE = 0.25  // Option D only: replaces the shared 0.4 at full exhale
const OPTION_D_EXHALE_Z_SCALE = 0.25  // Option D only: replaces the shared 0.2 at full exhale
const OPTION_D_INHALE_X_SCALE = 2     // Option D only: replaces the shared 2.25 at full inhale
const OPTION_D_INHALE_Y_SCALE = 3     // Option D only: replaces the shared 3.5 at full inhale
const OPTION_D_INHALE_Z_SCALE = 2     // Option D only: replaces the shared 1.5 at full inhale

// Breath-count rings: groups of 5 breaths, one ring fades in and locks per
// completed Inhale, all 5 fall away together on the 5th Exhale. "Breath" here
// means literal slider movement (leftRawRef), identical across every mode --
// not any mode's own phase clock.
const BREATH_RING_COUNT = 5
const BREATH_SET_COUNT = 5   // sets take turns so one can fall while the next counts: still rings, spinning rings, sculpture cubes, cube stack, tetrahedron stack
const BREATH_RING_TOTAL = BREATH_RING_COUNT * 2   // ring sets 0-1 (the Morph backlight glow tracks rings only)
const BREATH_TOTAL = BREATH_RING_COUNT * BREATH_SET_COUNT
const BREATH_RING_Z = [-144, -55, -21, -8, -3]
const BREATH_FADE_START = 0.25       // fraction of slider travel where fade-in begins (0 alpha before this)
const BREATH_FADE_THRESHOLD = 0.90   // fraction of slider travel where alpha reaches full and the ring locks in
const BREATH_MAX_ALPHA = 0.5
// Same proportions as the pulse/hold ring in GatesBoxBreathingD.jsx (that
// file's PULSE_RING_TUBE/PULSE_RING_SCALE aren't exported, so the derivation
// is duplicated here from its exported inputs), tube tripled for visibility
// at these distances.
const BREATH_RING_TUBE = 0.015 * 3
// Spinning rings (set 1, see BREATH_SPIN_FROM_APPEAR_SET) have their own
// depths and a chunkier shape: tube 3x thicker, and 3x deeper along their
// own Z (= world/camera depth at rest; the shape tumbles with the spin).
const SPIN_RING_Z = [-45, -35, -25, -15, -5]
const SPIN_RING_TUBE = BREATH_RING_TUBE * 3
const SPIN_RING_Z_SCALE = 3
const BREATH_RING_INNER_EDGE_FACTOR = (BASE_RADIUS - BASE_TUBE) / BASE_RADIUS
const BREATH_RING_SCALE = GATE_SCALE.map(v => v * BREATH_RING_INNER_EDGE_FACTOR)
const SPIN_RING_MESH_SCALE = [BREATH_RING_SCALE[0], BREATH_RING_SCALE[1], BREATH_RING_SCALE[2] * SPIN_RING_Z_SCALE]
const BREATH_REVERSAL_DEADBAND = 0.08  // matches the deadband used elsewhere (App.jsx, SlowingDownController)
const BREATH_FALL_STAGGER_S = 0.2
const BREATH_FALL_HOLD_S = 2.0       // seconds a ring keeps falling/rotating at full opacity before fading
const BREATH_FALL_FADE_S = 1.0       // fade duration after the hold
const BREATH_FALL_Y_SPEED = 0.6 * 1.5  // units/sec, straight down -- 50% faster
const BREATH_FALL_ROT_SPEED = 0.5    // max rad/sec per axis, randomized per ring per group
// Every other cycle (the second set of the leap-frogging pair) starts each
// ring's slow random rotation the moment it first appears, instead of when it
// falls, and keeps that same spin through the fall.
const BREATH_SPIN_FROM_APPEAR_SET = 1
// Count Cubes (set 2, every third cycle): a growing abstract sculpture. For
// each cycle, all 5 get a random depth/size/starting angle up front, then
// each spins slowly from the moment it appears (see BREATH_SPIN_FROM_APPEAR_SET)
// until it falls. Seen from the camera, every cube stays behind the Morph and
// inside its full-Inhale outline, whatever its spin angle. Cubes may intersect
// and overlap, but each keeps at least CUBE_MIN_VISIBLE of its on-screen area
// clear of the others.
//
// The outline math: squash space by the Morph's inhale semi-axes (a, b, c) so
// it becomes a unit sphere; a unit sphere seen from distance d hides a cone
// with tan(theta) = 1/sqrt(d^2 - 1). Back in world units, a point at depth z
// is inside the outline when sqrt((x/a)^2 + (y/b)^2) <= (d - z/c) / sqrt(d^2 - 1)
// -- an ellipse of half-width a*k(z), half-height b*k(z). For Shape D
// (a=1, b=1.5, c=1, camera d=10): k(z) = (10 - z) / 9.95, e.g. X +/-1.41,
// Y +/-2.11 at z=-4 and X +/-1.91, Y +/-2.86 at z=-9. X/Y ranges are
// therefore derived per depth; only depth and size are knobs.
const CUBE_SET = 2
const CUBE_SPAWN_Z = [-9, -5]        // behind the Morph (its back is z=-1); range tuned by simulation for reliable 5-cube layouts
const CUBE_SCALE = [0.75, 1.5]       // edge length, based on a 1-unit cube
const CUBE_CONTOUR_INSET = 1.0       // cubes' bounding spheres stay inside this fraction of the Morph's outline (spheres are already a margin around the cube)
const CUBE_MIN_VISIBLE = 0.5         // each cube keeps at least this much of its on-screen area clear of the others
const CUBE_DISK_RADIUS = Math.sqrt(1.5 / Math.PI)   // x edge length: circle with a cube's average silhouette area (1.5 s^2), so spinning doesn't matter
const CUBE_CHAMFER = 0.1             // RoundedBox radius on the 1-unit cube
const CUBE_MAX_ALPHA = 0.5
const CUBE_PLACE_TRIES = 400
const CUBE_LAYOUT_TRIES = 10
// TEMPORARY for testing: cycle 1 uses Count Cubes too (normally still rings).
const CUBE_STACK_SET = 3
const TETRA_STACK_SET = 4
const isSolidSet = (set) => set >= CUBE_SET
// TEMPORARY for testing: the first cycles use these sets, then the normal
// 5-cycle pattern (set = cycle % 5) takes over.
const TEMP_FIRST_CYCLES = [CUBE_STACK_SET, TETRA_STACK_SET]
const setForCycle = (c) => (c < TEMP_FIRST_CYCLES.length ? TEMP_FIRST_CYCLES[c] : c % BREATH_SET_COUNT)
const maxAlphaFor = (i) => (isSolidSet(Math.floor(i / BREATH_RING_COUNT)) ? CUBE_MAX_ALPHA : BREATH_MAX_ALPHA)

// Stack series (cube stack, tetrahedron stack): 5 identical pieces in a
// vertical stack, the middle one at the Morph's center, sized so every piece
// sits inside the Morph's full-Inhale ellipsoid at any Y angle, with a thin
// gap between pieces. Pieces fill in random order, each at a random Y angle,
// turning about Y only at STACK_SPIN_SPEED rad/s (random direction), through
// the fall too.
const STACK_GAP = 0.05
const STACK_FIT_MARGIN = 0.97
const STACK_SPIN_SPEED = [BREATH_FALL_ROT_SPEED / 2, BREATH_FALL_ROT_SPEED]   // current per-axis max spin as the min, double it as the max
const TETRA_HEIGHT = Math.sqrt(2 / 3)   // regular tetrahedron, edge 1
const TETRA_BASE_R = 1 / Math.sqrt(3)   // circumradius of its base triangle
// Unit-piece vertices, centered on mid-height (tetra: base down, apex up).
const STACK_SHAPES = {
  [CUBE_STACK_SET]: {
    h: 1,
    verts: Array.from({ length: 8 }, (_, k) => [k & 1 ? 0.5 : -0.5, k & 2 ? 0.5 : -0.5, k & 4 ? 0.5 : -0.5]),
  },
  [TETRA_STACK_SET]: {
    h: TETRA_HEIGHT,
    verts: [0, 1, 2].map((k) => {
      const a = Math.PI / 2 + (k * 2 * Math.PI) / 3
      return [TETRA_BASE_R * Math.cos(a), -TETRA_HEIGHT / 2, TETRA_BASE_R * Math.sin(a)]
    }).concat([[0, TETRA_HEIGHT / 2, 0]]),
  },
}
// Largest piece size whose whole 5-piece stack fits in the ellipsoid
// (x/a)^2 + (y/b)^2 + (z/c)^2 <= 1; horizontal extent uses each vertex's
// distance from the Y axis against min(a, c), so any Y angle fits.
function layoutStack(set, morphHalf) {
  const { h, verts } = STACK_SHAPES[set]
  const m = Math.min(morphHalf[0], morphHalf[2]), b = morphHalf[1]
  const fits = (s) => {
    for (let k = -2; k <= 2; k++) {
      const yc = k * (s * h + STACK_GAP)
      for (const [vx, vy, vz] of verts) {
        const r = s * Math.hypot(vx, vz), y = yc + s * vy
        if ((r * r) / (m * m) + (y * y) / (b * b) > 1) return false
      }
    }
    return true
  }
  let lo = 0, hi = 4
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid }
  const s = lo * STACK_FIT_MARGIN
  const slots = [-2, -1, 0, 1, 2].map((k) => k * (s * h + STACK_GAP))
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }
  return slots.map((y) => ({ x: 0, y, z: 0, rx: 0, ry: Math.random() * Math.PI * 2, rz: 0, s }))
}
const makeStackSpin = () => ({
  rx: 0,
  ry: (Math.random() < 0.5 ? -1 : 1) * THREE.MathUtils.randFloat(...STACK_SPIN_SPEED),
  rz: 0,
})
// Shared tetrahedron geometry, built to match STACK_SHAPES (outward winding).
function makeTetraGeometry() {
  const v = STACK_SHAPES[TETRA_STACK_SET].verts.map((p) => new THREE.Vector3(...p))
  const centroid = v.reduce((acc, p) => acc.add(p), new THREE.Vector3()).divideScalar(4)
  const faces = [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]]
  const pos = []
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), c = new THREE.Vector3()
  for (let [i, j, k] of faces) {
    e1.subVectors(v[j], v[i]); e2.subVectors(v[k], v[i]); n.crossVectors(e1, e2)
    c.copy(v[i]).add(v[j]).add(v[k]).divideScalar(3).sub(centroid)
    if (n.dot(c) < 0) [j, k] = [k, j]
    for (const idx of [i, j, k]) pos.push(v[idx].x, v[idx].y, v[idx].z)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

const _p = new THREE.Vector3()
const _u = new THREE.Vector3()
const _v = new THREE.Vector3()
const _view = new THREE.Vector3()

// True when the Morph (ellipsoid at `center` with semi-axes `axes`) lies
// entirely between the camera and point p -- i.e. p is behind the Morph and
// inside its outline as seen from the camera.
function hiddenBehindMorph(camPos, p, center, axes) {
  const ox = (camPos.x - center.x) / axes.x, oy = (camPos.y - center.y) / axes.y, oz = (camPos.z - center.z) / axes.z
  const dx = (p.x - camPos.x) / axes.x, dy = (p.y - camPos.y) / axes.y, dz = (p.z - camPos.z) / axes.z
  const A = dx * dx + dy * dy + dz * dz
  const B = 2 * (ox * dx + oy * dy + oz * dz)
  const C = ox * ox + oy * oy + oz * oz - 1
  const disc = B * B - 4 * A * C
  if (disc < 0) return false
  const sq = Math.sqrt(disc)
  const t1 = (-B - sq) / (2 * A), t2 = (-B + sq) / (2 * A)
  return t1 > 0 && t2 < 1
}

// A cube's bounding sphere (any spin angle) stays hidden behind the Morph:
// test its front point plus a ring of points on its silhouette as seen from
// the camera.
const SILHOUETTE_POINTS = 24
function sphereHiddenBehindMorph(camPos, q, r, center, axes) {
  _view.subVectors(q, camPos)
  const dist = _view.length()
  if (dist <= r) return false
  _view.divideScalar(dist)
  if (!hiddenBehindMorph(camPos, _p.copy(q).addScaledVector(_view, -r), center, axes)) return false
  _u.set(0, 1, 0).cross(_view)
  if (_u.lengthSq() < 1e-6) _u.set(1, 0, 0).cross(_view)
  _u.normalize()
  _v.crossVectors(_view, _u)
  const ringR = r * dist / Math.sqrt(dist * dist - r * r)   // widened so the ring projects onto the true silhouette
  for (let k = 0; k < SILHOUETTE_POINTS; k++) {
    const a = (k / SILHOUETTE_POINTS) * Math.PI * 2
    _p.copy(q).addScaledVector(_u, Math.cos(a) * ringR).addScaledVector(_v, Math.sin(a) * ringR)
    if (!hiddenBehindMorph(camPos, _p, center, axes)) return false
  }
  return true
}

// Fixed sunflower pattern of points in the unit disk, for area estimates.
const DISK_SAMPLES = Array.from({ length: 200 }, (_, i) => {
  const rho = Math.sqrt((i + 0.5) / 200), ang = i * 2.399963229728653
  return { x: rho * Math.cos(ang), y: rho * Math.sin(ang) }
})
// Fraction of disk i's area not covered by any other disk.
function visibleFraction(disks, i) {
  const d = disks[i]
  let clear = 0
  for (const s of DISK_SAMPLES) {
    const px = d.x + s.x * d.r, py = d.y + s.y * d.r
    let covered = false
    for (let j = 0; j < disks.length; j++) {
      if (j === i) continue
      const o = disks[j]
      if ((px - o.x) ** 2 + (py - o.y) ** 2 < o.r * o.r) { covered = true; break }
    }
    if (!covered) clear++
  }
  return clear / DISK_SAMPLES.length
}

// One attempt at a 5-cube layout (local to MorphC's root group, whose world y
// offset is rootY). morphHalf = the Morph's full-Inhale semi-axes. Keeps the
// best candidate per cube; `clean` reports whether every rule was met.
function placeCountCubesOnce(camera, rootY, morphHalf) {
  camera.updateMatrixWorld()
  const aspect = camera.aspect || 1
  const center = new THREE.Vector3(0, rootY, 0)
  const axes = new THREE.Vector3(morphHalf[0], morphHalf[1], morphHalf[2]).multiplyScalar(CUBE_CONTOUR_INSET)
  const camPos = camera.position
  const dScaled = (camPos.z - center.z) / axes.z
  const coneK = (z) => (dScaled - (z - center.z) / axes.z) / Math.sqrt(Math.max(1e-6, dScaled * dScaled - 1))
  const q = new THREE.Vector3()
  const placed = []
  placed.clean = true
  for (let n = 0; n < BREATH_RING_COUNT; n++) {
    let best = null, bestScore = -Infinity
    for (let t = 0; t < CUBE_PLACE_TRIES; t++) {
      const c = {
        z: THREE.MathUtils.randFloat(...CUBE_SPAWN_Z),
        s: THREE.MathUtils.randFloat(...CUBE_SCALE),
        rx: Math.random() * Math.PI * 2,
        ry: Math.random() * Math.PI * 2,
        rz: Math.random() * Math.PI * 2,
      }
      // Uniform point inside the depth's allowed ellipse, shrunk by the
      // bounding-sphere radius; the silhouette test below has the final say.
      const k = coneK(c.z)
      const r = c.s * Math.sqrt(3) / 2
      const hw = axes.x * k - r, hh = axes.y * k - r
      if (hw <= 0 || hh <= 0) continue
      const rho = Math.sqrt(Math.random()), ang = Math.random() * Math.PI * 2
      c.x = center.x + hw * rho * Math.cos(ang)
      c.y = hh * rho * Math.sin(ang)
      q.set(c.x, c.y + rootY, c.z)
      if (!sphereHiddenBehindMorph(camPos, q, r, center, axes)) continue
      // On-screen disk (aspect-corrected NDC) with the cube's average silhouette area.
      _p.copy(q).project(camera)
      const sx = _p.x * aspect, sy = _p.y
      _p.copy(q).add(_u.set(0, CUBE_DISK_RADIUS * c.s, 0)).project(camera)
      c.disk = { x: sx, y: sy, r: Math.abs(_p.y - sy) }
      // Every cube -- including ones already placed -- must stay at least
      // CUBE_MIN_VISIBLE clear once this one is added.
      const disks = placed.map((o) => o.disk).concat(c.disk)
      let score = Infinity
      for (let i = 0; i < disks.length; i++) score = Math.min(score, visibleFraction(disks, i) - CUBE_MIN_VISIBLE)
      if (score > bestScore) { best = c; bestScore = score }
      if (score >= 0) break
    }
    if (!best || bestScore < 0) placed.clean = false
    placed.push(best || { x: 0, y: 0, z: CUBE_SPAWN_Z[1], rx: 0, ry: 0, rz: 0, s: CUBE_SCALE[0], disk: { x: 0, y: 0, r: 0 } })
  }
  return placed
}

// A layout occasionally paints itself into a corner; retry the full 5-cube
// layout a few times before settling for the best-effort one.
function placeCountCubes(camera, rootY, morphHalf) {
  let layout
  for (let i = 0; i < CUBE_LAYOUT_TRIES; i++) {
    layout = placeCountCubesOnce(camera, rootY, morphHalf)
    if (layout.clean) break
  }
  return layout
}
const makeBreathSpin = () => ({
  rx: THREE.MathUtils.randFloatSpread(BREATH_FALL_ROT_SPEED),
  ry: THREE.MathUtils.randFloatSpread(BREATH_FALL_ROT_SPEED),
  rz: THREE.MathUtils.randFloatSpread(BREATH_FALL_ROT_SPEED),
})
const BREATH_EMISSIVE_MULT = 10      // baseline emissive multiplier while fading in / persistent
const CUBE_EMISSIVE_MULT = 2         // solid count shapes' baseline (cubes, stacks); rings use BREATH_EMISSIVE_MULT
const emissiveMultFor = (i) => (isSolidSet(Math.floor(i / BREATH_RING_COUNT)) ? CUBE_EMISSIVE_MULT : BREATH_EMISSIVE_MULT)
const BREATH_EMISSIVE_FALL_TARGET = 1  // ramped down to this over the first second of the fall
const BREATH_EMISSIVE_FALL_RAMP_S = 1.0
const BREATH_FADE_IN_DURATION_S = 1.5  // time to fade a ring from 0 to full opacity, independent of slider speed
const BREATH_FADE_RATE = BREATH_MAX_ALPHA / BREATH_FADE_IN_DURATION_S  // alpha/sec, slew-rate limits opacity changes
// "Backlight" glow: rather than relying on transparent-object draw order
// (which didn't reliably show the rings through the Morph's own surface),
// each ring's position/intensity is fed into the Morph's own fragment
// shader as a fake point-light term added straight to its emissive, so it
// reads as light glowing through from behind regardless of depth/blend order.
const BREATH_GLOW_STRENGTH = 3.0     // multiplies each ring's opacity (0-0.5) into an emissive contribution
const BREATH_GLOW_FALLOFF = 0.15     // exponential distance falloff rate

const SPARKLE_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSeed;
uniform float uTime;
uniform float uSize;
varying float vAlpha;
varying float vSeed;

void main() {
  float age = max(uTime - aSpawnTime, 0.0);
  float lifeT = clamp(age / aLifetime, 0.0, 1.0);
  float fadeIn = smoothstep(0.0, 0.15, lifeT);
  float fadeOut = 1.0 - smoothstep(0.7, 1.0, lifeT);
  float envelope = fadeIn * fadeOut;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (1.0 + aSeed) * envelope / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;

  vAlpha = envelope;
  vSeed = aSeed;
}
`

const FLOW_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSpeed;
attribute float aMode;
attribute float aStartOffset;
attribute float aSeed;
attribute float aSwoopSpeed;
uniform float uTime;
uniform float uSpread;
uniform float uSize;
uniform float uPullRate;
varying float vAlpha;
varying float vSeed;

void main() {
  float age = max(uTime - aSpawnTime, 0.0);
  float lifeT = clamp(age / aLifetime, 0.0, 1.0);
  float fadeIn = smoothstep(0.0, 0.15, lifeT);
  float fadeOut = 1.0 - smoothstep(0.7, 1.0, lifeT);
  float envelope = fadeIn * fadeOut;

  // X-only travel, replacing the old radial XZ motion -- the random aSpeed
  // range still applies, just along a single axis now. Some particles get a
  // speed near 0, so they barely drift in X and are mostly just drawn toward
  // the center line.
  float dirX = position.x >= 0.0 ? 1.0 : -1.0;
  float travel = aSpeed * age;
  float extraX = aMode > 0.0
    ? min(travel, uSpread)                  // blown away: grows outward from the surface
    : max(aStartOffset - travel, 0.0);       // sucked in: shrinks back toward the surface

  // Y and Z are slowly pulled toward the horizontal center line (Y=0, Z=0).
  // Exponential decay approaches but mathematically never crosses zero, so
  // particles can't overshoot past the center line.
  float pull = exp(-uPullRate * lifeT);

  // Particles spawned while sucked in (slider moving toward inhale) get a
  // small drift on top of the pull -- sign varies per particle, so some
  // rise and others dip as they swoop into the mesh as it grows tall,
  // instead of sliding flat into the center line.
  float swoopY = aMode < 0.0 ? aSwoopSpeed * age : 0.0;

  // Sucked-in particles are also slowly pulled in toward X=0 (in addition to
  // shrinking back to the surface via extraX), using the same exponential
  // decay as the Y/Z pull so they're drawn toward the mesh without
  // overshooting past its center.
  float xBase = position.x + dirX * extraX;
  float xFinal = aMode < 0.0 ? xBase * pull : xBase;

  vec3 displaced = vec3(
    xFinal,
    position.y * pull + swoopY,
    position.z * pull
  );

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_PointSize = uSize * (1.0 + aSeed) * envelope / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;

  vAlpha = envelope;
  vSeed = aSeed;
}
`

const PARTICLE_FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uTime;
varying float vAlpha;
varying float vSeed;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, d);
  float twinkle = 0.6 + 0.4 * sin(uTime * 3.0 + vSeed * 50.0);
  gl_FragColor = vec4(uColor, vAlpha * soft * twinkle);
}
`

function sampleSpherePositions(count) {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Uniform distribution on a sphere surface (Archimedes method)
    const z = Math.random() * 2 - 1
    const theta = Math.acos(z)
    const phi = Math.random() * Math.PI * 2
    const sinTheta = Math.sin(theta)

    positions[i * 3]     = SPHERE_RADIUS * sinTheta * Math.cos(phi)
    positions[i * 3 + 1] = SPHERE_RADIUS * sinTheta * Math.sin(phi)
    positions[i * 3 + 2] = SPHERE_RADIUS * z
  }
  return positions
}

export default function MorphC({ leftVal, rightVal, palette, shapeOption, leftRawRef, breathCountingEnabledRef, breathCountSourceRef, livePaletteRef, onBreathPaletteCycle }) {
  const groupRef = useRef()
  const matRef = useRef()

  // System 1 (sparkle): cyclic pool index + fractional spawn-rate accumulator.
  const spawnCursorRef = useRef(0)
  const spawnAccumulatorRef = useRef(0)

  // System 2 (flow): its own cyclic pool index + accumulator.
  const flowCursorRef = useRef(0)
  const flowAccumulatorRef = useRef(0)

  // Tracks whether lv is currently trending toward exhale (1) or inhale (-1),
  // used only to decide which way newly-spawned flow particles travel.
  // (lv=0 is exhale, lv=1 is inhale -- opposite numeric convention from rv.)
  const prevLvRef = useRef(leftVal.current)
  const flowDirRef = useRef(1)

  // Breath-count rings state (see module-level BREATH_* constants above).
  const breathGroupRefs = useMemo(() => (
    Array.from({ length: BREATH_TOTAL }, () => ({ current: null }))
  ), [])
  const breathLockedCountRef = useRef(0)
  // Deadband rise/fall tracker (same pattern as SlowingDownController /
  // App.jsx's stroke counters) -- breathDirRef starts "falling" (-1) so the
  // very first upward movement confirms a fresh rise. breathArmedRef only
  // becomes true again once a confirmed rise-from-a-trough happens, which is
  // what makes each lock require its own distinct Inhale instead of letting
  // a single held-up slider cascade through all 5 rings at once.
  const breathDirRef = useRef(-1)
  const breathExtremeRef = useRef(0)
  const breathArmedRef = useRef(true)
  const breathActiveSetRef = useRef(0)   // set currently counting
  const breathSetFallingRef = useRef(new Array(BREATH_SET_COUNT).fill(false))
  const breathFallStartTimesRef = useRef(new Array(BREATH_TOTAL).fill(null))
  const breathFallSpinRef = useRef(new Array(BREATH_TOTAL).fill(null))
  const breathSpinStartRef = useRef(new Array(BREATH_TOTAL).fill(null))   // set when spin began on appearance (see BREATH_SPIN_FROM_APPEAR_SET)
  const breathCycleIndexRef = useRef(0)   // 5-breath cycles completed since counting started (picks each cycle's set)
  // Per-object rest transform: rings sit on the axis at BREATH_RING_Z; Count
  // Cubes get a fresh random placement each time their set becomes active.
  const breathBaseRef = useRef(Array.from({ length: BREATH_TOTAL }, (_, i) => ({
    x: 0, y: 0, z: (Math.floor(i / BREATH_RING_COUNT) === BREATH_SPIN_FROM_APPEAR_SET ? SPIN_RING_Z : BREATH_RING_Z)[i % BREATH_RING_COUNT], rx: 0, ry: 0, rz: 0, s: 1,
  })))
  // Set true when a group's fall-away triggers; consumed on the very next
  // confirmed rise (breath 1's inhale of the next cycle), which is when
  // onBreathPaletteCycle actually fires (App.jsx owns the lerp itself, since
  // it now drives the whole app's palette, not just MorphC's own colors).
  const paletteLerpPendingRef = useRef(false)
  const breathCountingWasEnabledRef = useRef(false)

  const tetraGeometry = useMemo(() => makeTetraGeometry(), [])
  const breathMaterials = useMemo(() => (
    Array.from({ length: BREATH_TOTAL }, (_, i) => new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.primaryColor),
      emissive: new THREE.Color(palette.primaryColor),
      emissiveIntensity: emissiveMultFor(i),
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [])

  const { material, fresnelUniforms } = useMemo(() => {
    const fresnelUniforms = {
      fresnelPower:     { value: 1.5 },
      fresnelIntensity: { value: 1.0 },
      dissolveProgress: { value: 0 },
      dissolveScale:    { value: 80.0 },
      dissolveEdge:     { value: 0.12 },
      uBreathGlowPos:       { value: Array.from({ length: BREATH_RING_TOTAL }, () => new THREE.Vector3()) },
      uBreathGlowIntensity: { value: new Float32Array(BREATH_RING_TOTAL) },
      uBreathGlowColor:     { value: new THREE.Color(palette.primaryColor) },
      uBreathGlowFalloff:   { value: BREATH_GLOW_FALLOFF },
    }

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.tertiaryColor),
      emissive: new THREE.Color(palette.primaryColor),
      emissiveIntensity: 2,
      roughness: 1,
      metalness: 0,
      transparent: true,
    })

    mat.customProgramCacheKey = () => `fresnel-morph-c-${palette.primaryColor}`

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, fresnelUniforms)

      // Pass view direction, local (unscaled) position, and world position
      // from vertex to fragment via custom varyings -- local position drives
      // the dissolve grain so dot size stays stable regardless of the mesh's
      // breathing scale; world position drives the breath-ring backlight glow.
      shader.vertexShader = 'varying vec3 vFresnelDir;\nvarying vec3 vDissolvePos;\nvarying vec3 vWorldPos;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vFresnelDir = normalize(-mvPosition.xyz);
        vDissolvePos = position;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      )

      // Inject uniforms + varying declaration, then add Fresnel to emissive
      shader.fragmentShader =
        `uniform float fresnelPower;
uniform float fresnelIntensity;
uniform float dissolveProgress;
uniform float dissolveScale;
uniform float dissolveEdge;
uniform vec3 uBreathGlowPos[${BREATH_RING_TOTAL}];
uniform float uBreathGlowIntensity[${BREATH_RING_TOTAL}];
uniform vec3 uBreathGlowColor;
uniform float uBreathGlowFalloff;
varying vec3 vFresnelDir;
varying vec3 vDissolvePos;
varying vec3 vWorldPos;

float dissolveHash(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
\n` + shader.fragmentShader

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float fr = pow(1.0 - max(dot(normalize(vNormal), vFresnelDir), 0.0), fresnelPower);
          totalEmissiveRadiance *= (1.0 - fr * fresnelIntensity);
        }
        {
          // Breath-count rings "backlight" the Morph: faked as point-light-like
          // additions to emissive based on distance, independent of actual
          // transparent-object draw order/depth, so they read as glowing
          // through the surface rather than being hidden behind it.
          for (int i = 0; i < ${BREATH_RING_TOTAL}; i++) {
            float bd = length(vWorldPos - uBreathGlowPos[i]);
            float bGlow = uBreathGlowIntensity[i] * exp(-bd * uBreathGlowFalloff);
            totalEmissiveRadiance += uBreathGlowColor * bGlow;
          }
        }`
      )

      // Dissolve: each lattice point owns a small soft circle (never a square
      // -- that's the only shape ever drawn). A fragment unions the circles
      // from its cell's nearby lattice neighbors (a cheap metaball blend), so
      // when neighbors are all intact their overlapping circles merge into a
      // seamless smooth surface with no cell-boundary edges; as cells dissolve
      // in noise order, the union shrinks down to isolated shrinking/fading
      // dots before disappearing entirely. Pure corner neighbors are skipped
      // to keep the loop cheap without leaving gaps (the remaining face/edge
      // neighbors already give full overlap at the chosen radius).
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        {
          vec3 dScaled = vDissolvePos * dissolveScale;
          vec3 dBaseCell = floor(dScaled);
          float dCoverage = 0.0;
          for (int ix = -1; ix <= 1; ix++) {
            for (int iy = -1; iy <= 1; iy++) {
              for (int iz = -1; iz <= 1; iz++) {
                if (abs(ix) + abs(iy) + abs(iz) > 2) continue;
                vec3 dNeighbor = dBaseCell + vec3(float(ix), float(iy), float(iz));
                float dNoise = dissolveHash(dNeighbor);
                float dProgress = smoothstep(dissolveProgress - dissolveEdge, dissolveProgress + dissolveEdge, dNoise);
                float dDist = length(dScaled - (dNeighbor + 0.5));
                float dFalloff = 1.0 - smoothstep(0.8, 1.3, dDist);
                dCoverage = max(dCoverage, dFalloff * dProgress);
              }
            }
          }
          gl_FragColor.a *= dCoverage;
        }`
      )
    }

    return { material: mat, fresnelUniforms }
  }, [palette.tertiaryColor, palette.primaryColor])

  const sparkleAttrs = useMemo(() => {
    const positions = sampleSpherePositions(PARTICLE_COUNT)
    const seeds = new Float32Array(PARTICLE_COUNT)
    const spawnTimes = new Float32Array(PARTICLE_COUNT)
    const lifetimes = new Float32Array(PARTICLE_COUNT)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i] = Math.random()
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)

    return { geometry, spawnTimeAttr, lifetimeAttr }
  }, [])

  const flowAttrs = useMemo(() => {
    // Unscaled anchor points on the unit sphere -- used only at spawn time to
    // compute where the mesh surface actually is (after applying the current
    // breathing scale). Never touched again after a particle spawns.
    const basePositions = sampleSpherePositions(PARTICLE_COUNT_2)
    const positions = basePositions.slice()
    const seeds = new Float32Array(PARTICLE_COUNT_2)
    const spawnTimes = new Float32Array(PARTICLE_COUNT_2)
    const lifetimes = new Float32Array(PARTICLE_COUNT_2)
    const speeds = new Float32Array(PARTICLE_COUNT_2)
    const modes = new Float32Array(PARTICLE_COUNT_2)
    const startOffsets = new Float32Array(PARTICLE_COUNT_2)
    const swoopSpeeds = new Float32Array(PARTICLE_COUNT_2)

    for (let i = 0; i < PARTICLE_COUNT_2; i++) {
      seeds[i] = Math.random()
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
      // Lerp down to 0 so some particles get ~no X velocity and just drift
      // toward the center line instead of spreading outward.
      speeds[i] = THREE.MathUtils.lerp(0, 0.65, Math.random())
      modes[i] = 1
      startOffsets[i] = 0
      swoopSpeeds[i] = 0
    }

    const geometry = new THREE.BufferGeometry()
    const positionAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', positionAttr)
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    const modeAttr = new THREE.BufferAttribute(modes, 1).setUsage(THREE.DynamicDrawUsage)
    const startOffsetAttr = new THREE.BufferAttribute(startOffsets, 1).setUsage(THREE.DynamicDrawUsage)
    const swoopSpeedAttr = new THREE.BufferAttribute(swoopSpeeds, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    geometry.setAttribute('aMode', modeAttr)
    geometry.setAttribute('aStartOffset', startOffsetAttr)
    geometry.setAttribute('aSwoopSpeed', swoopSpeedAttr)

    return { geometry, positionAttr, spawnTimeAttr, lifetimeAttr, modeAttr, startOffsetAttr, swoopSpeedAttr, basePositions }
  }, [])

  const sparkleMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uSize:  { value: 120 },
        uColor: { value: new THREE.Color(palette.primaryColor) },
        uTime:  { value: 0 },
      },
      vertexShader: SPARKLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
  }, [palette.primaryColor])

  const flowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uSize:   { value: 120 },
        uColor:  { value: new THREE.Color(palette.primaryColor) },
        uTime:   { value: 0 },
        uSpread: { value: SPREAD_2 },
        uPullRate: { value: 1.2 },
      },
      vertexShader: FLOW_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
  }, [palette.primaryColor])

  useFrame((state, delta) => {
    if (!groupRef.current) return
    // Ease slider input in/out (default convention -- see CLAUDE.md) so
    // every value derived below moves smoothly rather than tracking the
    // thumb's raw position 1:1.
    const lv = THREE.MathUtils.smoothstep(leftVal.current, 0, 1)
    const rv = THREE.MathUtils.smoothstep(rightVal.current, 0, 1)

    const isD = shapeOption === 'd'
    const xScale = THREE.MathUtils.lerp(isD ? OPTION_D_EXHALE_X_SCALE : 4, isD ? OPTION_D_INHALE_X_SCALE : 2.25, lv)
    const zScale = THREE.MathUtils.lerp(isD ? OPTION_D_EXHALE_Z_SCALE : 0.2, isD ? OPTION_D_INHALE_Z_SCALE : 1.5, lv)
    const yScale = THREE.MathUtils.lerp(isD ? OPTION_D_INHALE_Y_SCALE : 3.5, isD ? OPTION_D_EXHALE_Y_SCALE : 0.4, rv)
    groupRef.current.scale.set(xScale, yScale, zScale)

    material.emissiveIntensity = THREE.MathUtils.lerp(1.5, 0, rv)
    material.roughness = THREE.MathUtils.lerp(0.3, 1, rv)
    fresnelUniforms.fresnelPower.value = THREE.MathUtils.lerp(0.0, 0.2, lv)

    // Mesh dissolves into grain across the entire slider travel -- solid and
    // smooth at full inhale (rv=0), fully gone at full exhale (rv=1) -- instead
    // of fading alpha uniformly. The dissolve uniform controls how much of the
    // surface has "burned away" into dots; material.opacity is a separate
    // overall alpha multiplied on top, ramping 0.75 (inhale) -> 0 (exhale).
    const fadeProgress = rv
    material.opacity = THREE.MathUtils.lerp(0.75, 0, rv)
    // Push the mapped range past the noise's [0,1) span by a safety margin so
    // every cell is fully solid at fadeProgress=0 (no holes at rest) and fully
    // gone at fadeProgress=1, instead of some cells already being mid-fade.
    const dissolveMargin = fresnelUniforms.dissolveEdge.value * 2
    fresnelUniforms.dissolveProgress.value = THREE.MathUtils.lerp(-dissolveMargin, 1 + dissolveMargin, fadeProgress)

    // Spawn rate holds steady through 75% of the way to exhale, then ramps to 0.
    const spawnRampProgress = THREE.MathUtils.smoothstep(rv, 0.75, 1.0)
    const spawnRate = THREE.MathUtils.lerp(MAX_SPAWN_RATE, 0, spawnRampProgress)

    // System 2 is fully controlled by the left slider, and ramps down to 0 at
    // BOTH ends: full rate only in the middle (lv 0.25 -> 0.5), ramping to 0
    // toward exhale (matches system 1's timing when both sliders move together)
    // and ramping to 0 toward inhale on the other side.
    const flowExhaleRamp = THREE.MathUtils.smoothstep(1 - lv, 0.75, 1.0)
    const flowInhaleRamp = THREE.MathUtils.smoothstep(lv, 0.5, 0.75)
    const flowRampProgress = Math.max(flowExhaleRamp, flowInhaleRamp)
    const flowSpawnRate = THREE.MathUtils.lerp(MAX_SPAWN_RATE, 0, flowRampProgress)

    const now = state.clock.elapsedTime

    // Track whether lv is currently trending toward exhale or inhale, for
    // newly-spawned flow particles -- held over when the slider is still.
    const dLv = lv - prevLvRef.current
    prevLvRef.current = lv
    if (Math.abs(dLv) > DIRECTION_DEADBAND) {
      flowDirRef.current = dLv < 0 ? 1 : -1
    }

    // System 1: static surface sparkle, no velocity.
    spawnAccumulatorRef.current += spawnRate * delta
    let toSpawn = Math.floor(spawnAccumulatorRef.current)
    if (toSpawn > 0) {
      spawnAccumulatorRef.current -= toSpawn
      toSpawn = Math.min(toSpawn, MAX_SPAWN_PER_FRAME)

      const { spawnTimeAttr, lifetimeAttr } = sparkleAttrs
      for (let k = 0; k < toSpawn; k++) {
        const idx = spawnCursorRef.current % PARTICLE_COUNT
        spawnCursorRef.current += 1
        spawnTimeAttr.array[idx] = now
        lifetimeAttr.array[idx] = 1 + Math.random()
      }
      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
    }
    sparkleMaterial.uniforms.uTime.value = now

    // System 2: blown-away (toward exhale) / sucked-in (toward inhale), XZ-only velocity.
    // Driven entirely by the left slider.
    flowAccumulatorRef.current += flowSpawnRate * delta
    let toSpawnFlow = Math.floor(flowAccumulatorRef.current)
    if (toSpawnFlow > 0) {
      flowAccumulatorRef.current -= toSpawnFlow
      toSpawnFlow = Math.min(toSpawnFlow, MAX_SPAWN_PER_FRAME)

      const { positionAttr, spawnTimeAttr, lifetimeAttr, modeAttr, startOffsetAttr, swoopSpeedAttr, basePositions } = flowAttrs
      const goingOut = flowDirRef.current > 0
      for (let k = 0; k < toSpawnFlow; k++) {
        const idx = flowCursorRef.current % PARTICLE_COUNT_2
        flowCursorRef.current += 1
        // Spawn exactly on the mesh surface as it currently appears, by
        // applying this frame's breathing scale to the base anchor. After
        // this, the particle's position is driven only by the shader's own
        // XZ velocity -- it never reads the scale again.
        positionAttr.array[idx * 3]     = basePositions[idx * 3] * xScale
        positionAttr.array[idx * 3 + 1] = basePositions[idx * 3 + 1] * yScale
        positionAttr.array[idx * 3 + 2] = basePositions[idx * 3 + 2] * zScale
        spawnTimeAttr.array[idx] = now
        lifetimeAttr.array[idx] = 1 + Math.random()
        modeAttr.array[idx] = goingOut ? 1 : -1
        startOffsetAttr.array[idx] = goingOut ? 0 : SPREAD_2 * (0.4 + Math.random() * 0.6)
        // Only particles spawned while moving toward inhale (sucked in) get
        // a swoop; blown-away particles get none. Sign is randomized so some
        // particles rise and others dip as they're drawn into the growing mesh.
        swoopSpeedAttr.array[idx] = goingOut ? 0 : (0.15 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1)
      }
      positionAttr.needsUpdate = true
      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
      modeAttr.needsUpdate = true
      startOffsetAttr.needsUpdate = true
      swoopSpeedAttr.needsUpdate = true
    }
    flowMaterial.uniforms.uTime.value = now

    // Breath-count rings (see module-level BREATH_* constants). Two sets of 5
    // take turns: when the counting set's fall-away triggers, counting moves
    // straight to the other set, so a breath taken while the previous cycle's
    // rings are still falling is counted (and visible) immediately.
    const countingEnabled = !!(breathCountingEnabledRef && breathCountingEnabledRef.current)
    // Count source: the left slider, or (Box Breathing / Slowing Down) a paced
    // 0 (exhale) -> 1 (inhale) progress ref chosen by App.jsx.
    const countSource = breathCountSourceRef && breathCountSourceRef.current
    const raw = countSource ? countSource.current : leftRawRef.current
    const resetBreathSet = (set) => {
      breathSetFallingRef.current[set] = false
      for (let i = set * BREATH_RING_COUNT; i < (set + 1) * BREATH_RING_COUNT; i++) {
        breathFallStartTimesRef.current[i] = null
        breathFallSpinRef.current[i] = null
        breathSpinStartRef.current[i] = null
        const group = breathGroupRefs[i].current
        const b = breathBaseRef.current[i]
        if (group) {
          group.position.set(b.x, b.y, b.z)
          group.rotation.set(b.rx, b.ry, b.rz)
          group.scale.setScalar(b.s)
        }
        breathMaterials[i].opacity = 0
        breathMaterials[i].emissiveIntensity = emissiveMultFor(i)
      }
    }
    // New random Count Cube layout, applied as their rest transforms.
    const activateBreathSet = (set) => {
      const morphHalf = shapeOption === 'd'
        ? [OPTION_D_INHALE_X_SCALE, OPTION_D_INHALE_Y_SCALE, OPTION_D_INHALE_Z_SCALE].map(v => v * SPHERE_RADIUS)
        : [2.25, 3.5, 1.5].map(v => v * SPHERE_RADIUS)
      if (set === CUBE_STACK_SET || set === TETRA_STACK_SET) {
        layoutStack(set, morphHalf).forEach((b, k) => { breathBaseRef.current[set * BREATH_RING_COUNT + k] = b })
      }
      if (set === CUBE_SET) {
        const placed = placeCountCubes(state.camera, shapeOption === 'd' ? 0 : 0.25, morphHalf)
        placed.forEach((c, k) => {
          const { disk, ...b } = c
          breathBaseRef.current[CUBE_SET * BREATH_RING_COUNT + k] = b
        })
      }
      resetBreathSet(set)
      breathActiveSetRef.current = set
    }
    if (countingEnabled !== breathCountingWasEnabledRef.current) {
      // Counting just started (per-mode start point, see App.jsx) or stopped
      // (mode restart): clear to a clean cycle so counting begins at breath 1.
      breathCycleIndexRef.current = 0
      breathLockedCountRef.current = 0
      breathDirRef.current = -1
      breathExtremeRef.current = raw
      breathArmedRef.current = true
      paletteLerpPendingRef.current = false
      for (let s = 0; s < BREATH_SET_COUNT; s++) resetBreathSet(s)
      activateBreathSet(setForCycle(0))
    }
    breathCountingWasEnabledRef.current = countingEnabled

    // Rings spinning since they appeared keep one continuous rotation,
    // including while waiting for and during their fall.
    for (let i = 0; i < BREATH_TOTAL; i++) {
      const spinStart = breathSpinStartRef.current[i]
      const group = breathGroupRefs[i].current
      if (spinStart === null || !group) continue
      const spin = breathFallSpinRef.current[i]
      const b = breathBaseRef.current[i]
      const ts = now - spinStart
      group.rotation.set(b.rx + spin.rx * ts, b.ry + spin.ry * ts, b.rz + spin.rz * ts)
    }

    // Falling sets animate independently of counting.
    for (let s = 0; s < BREATH_SET_COUNT; s++) {
      if (!breathSetFallingRef.current[s]) continue
      let allDone = true
      for (let i = s * BREATH_RING_COUNT; i < (s + 1) * BREATH_RING_COUNT; i++) {
        const start = breathFallStartTimesRef.current[i]
        if (start === null || now < start) { allDone = false; continue }
        const t = now - start
        const group = breathGroupRefs[i].current
        const spin = breathFallSpinRef.current[i]
        if (group) {
          const b = breathBaseRef.current[i]
          group.position.y = b.y - BREATH_FALL_Y_SPEED * t
          if (breathSpinStartRef.current[i] === null) group.rotation.set(b.rx + spin.rx * t, b.ry + spin.ry * t, b.rz + spin.rz * t)
        }
        const fadeT = THREE.MathUtils.clamp((t - BREATH_FALL_HOLD_S) / BREATH_FALL_FADE_S, 0, 1)
        breathMaterials[i].opacity = maxAlphaFor(i) * (1 - fadeT)
        const emissiveT = THREE.MathUtils.clamp(t / BREATH_EMISSIVE_FALL_RAMP_S, 0, 1)
        breathMaterials[i].emissiveIntensity = THREE.MathUtils.lerp(emissiveMultFor(i), BREATH_EMISSIVE_FALL_TARGET, emissiveT)
        if (fadeT < 1) allDone = false
      }
      if (allDone) resetBreathSet(s)
    }

    if (countingEnabled) {
      const base = breathActiveSetRef.current * BREATH_RING_COUNT
      const maxAlpha = isSolidSet(breathActiveSetRef.current) ? CUBE_MAX_ALPHA : BREATH_MAX_ALPHA

      // Deadband rise/fall tracker: only a confirmed reversal from a real
      // trough back to rising re-arms the next ring, so holding the
      // slider up (or wobbling near the threshold) can't lock more than
      // one ring per distinct Inhale.
      if (breathDirRef.current >= 0) {
        if (raw > breathExtremeRef.current) {
          breathExtremeRef.current = raw
        } else if (breathExtremeRef.current - raw > BREATH_REVERSAL_DEADBAND) {
          breathDirRef.current = -1
          breathExtremeRef.current = raw
        }
      } else {
        if (raw < breathExtremeRef.current) {
          breathExtremeRef.current = raw
        } else if (raw - breathExtremeRef.current > BREATH_REVERSAL_DEADBAND) {
          breathDirRef.current = 1
          breathExtremeRef.current = raw
          breathArmedRef.current = true
          if (paletteLerpPendingRef.current) {
            paletteLerpPendingRef.current = false
            if (onBreathPaletteCycle) onBreathPaletteCycle(now)
          }
        }
      }

      // Already-locked rings keep easing toward full opacity at a capped
      // rate too, in case a very fast Inhale locked one before its own
      // fade-in visually caught up.
      const maxDelta = BREATH_FADE_RATE * delta
      for (let i = 0; i < breathLockedCountRef.current; i++) {
        const cur = breathMaterials[base + i].opacity
        if (cur < maxAlpha) breathMaterials[base + i].opacity = Math.min(maxAlpha, cur + maxDelta)
      }

      if (breathLockedCountRef.current < BREATH_RING_COUNT) {
        if (breathArmedRef.current) {
          const activeIdx = base + breathLockedCountRef.current
          const activeSet = breathActiveSetRef.current
          if ((activeSet === BREATH_SPIN_FROM_APPEAR_SET || isSolidSet(activeSet)) && breathSpinStartRef.current[activeIdx] === null && breathMaterials[activeIdx].opacity > 0) {
            breathFallSpinRef.current[activeIdx] = (activeSet === CUBE_STACK_SET || activeSet === TETRA_STACK_SET) ? makeStackSpin() : makeBreathSpin()
            breathSpinStartRef.current[activeIdx] = now
          }
          const progress = THREE.MathUtils.clamp((raw - BREATH_FADE_START) / (BREATH_FADE_THRESHOLD - BREATH_FADE_START), 0, 1)
          // Slew-rate limited toward the slider-driven target instead of
          // snapping straight to it, so a fast Inhale still reads as a
          // smooth fade in from 0 rather than an instant pop -- reversing
          // before locking still fades the ring back out, just at the same
          // capped rate rather than instantly.
          const target = maxAlpha * progress
          const cur = breathMaterials[activeIdx].opacity
          breathMaterials[activeIdx].opacity = target > cur
            ? Math.min(target, cur + maxDelta)
            : Math.max(target, cur - maxDelta)
          if (progress >= 1) {
            breathLockedCountRef.current += 1
            breathArmedRef.current = false
          }
        }
      } else if (breathDirRef.current === -1) {
        // All 5 locked, and the tracker above just confirmed the downward
        // reversal that starts breath 5's exhale -- trigger this set's
        // fall-away and hand counting to the other set.
        const set = breathActiveSetRef.current
        breathSetFallingRef.current[set] = true
        const order = [0, 1, 2, 3, 4]
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[order[i], order[j]] = [order[j], order[i]]
        }
        order.forEach((ringIdx, orderPos) => {
          breathFallStartTimesRef.current[base + ringIdx] = now + orderPos * BREATH_FALL_STAGGER_S
          if (!breathFallSpinRef.current[base + ringIdx]) breathFallSpinRef.current[base + ringIdx] = makeBreathSpin()
        })

        // Palette lerp doesn't start yet -- queued for the next cycle's
        // breath 1 inhale (see the rise-confirmation branch above).
        paletteLerpPendingRef.current = true

        // Next cycle counts on the other set; the tracker is already heading
        // down and unarmed, so the next confirmed rise arms its breath 1.
        breathCycleIndexRef.current += 1
        const next = setForCycle(breathCycleIndexRef.current)
        breathSetFallingRef.current[next] = false   // only with very fast breathing: snap it back
        activateBreathSet(next)
        breathLockedCountRef.current = 0
      }
    }

    // Sync from the shared live palette (App.jsx owns the actual lerp, since
    // it now drives the whole app's palette, not just MorphC's own colors) --
    // cheap in-place copies every frame, no branching needed.
    if (livePaletteRef && livePaletteRef.current) {
      const live = livePaletteRef.current
      material.color.copy(live.tertiary)
      material.emissive.copy(live.primary)
      sparkleMaterial.uniforms.uColor.value.copy(live.primary)
      flowMaterial.uniforms.uColor.value.copy(live.primary)
      fresnelUniforms.uBreathGlowColor.value.copy(live.primary)
      breathMaterials.forEach((m) => {
        m.color.copy(live.primary)
        m.emissive.copy(live.primary)
      })
    }

    // Feed each breath ring's current world position/opacity into the
    // Morph's backlight-glow uniforms (see BREATH_GLOW_* constants and the
    // onBeforeCompile injection above).
    {
      const groupOffsetY = shapeOption === 'd' ? 0 : 0.25
      const glowPos = fresnelUniforms.uBreathGlowPos.value
      const glowIntensity = fresnelUniforms.uBreathGlowIntensity.value
      for (let i = 0; i < BREATH_RING_TOTAL; i++) {
        const group = breathGroupRefs[i].current
        const fallY = group ? group.position.y : 0
        glowPos[i].set(0, groupOffsetY + fallY, breathBaseRef.current[i].z)
        // Scale by the ring's own emissive ratio too, so the backlight glow
        // dims in step with its visible emissive during the fall-away.
        const emissiveRatio = breathMaterials[i].emissiveIntensity / BREATH_EMISSIVE_MULT
        glowIntensity[i] = breathMaterials[i].opacity * BREATH_GLOW_STRENGTH * emissiveRatio
      }
    }
  })

  return (
    <group position={shapeOption === 'd' ? [0, 0, 0] : [0, 0.25, 0]}>
      <group ref={groupRef}>
        <mesh ref={matRef}>
          <sphereGeometry args={[SPHERE_RADIUS, 32, 16]} />
          <primitive object={material} attach="material" />
        </mesh>
        <points geometry={sparkleAttrs.geometry}>
          <primitive object={sparkleMaterial} attach="material" />
        </points>
      </group>
      {/* System 2 sits outside the scaled group so its particles' travel is
          never stretched/squished by the morph's breathing scale animation. */}
      <points geometry={flowAttrs.geometry}>
        <primitive object={flowMaterial} attach="material" />
      </points>
      {/* Breath-count rings -- also outside the scaled group so they don't
          inherit the sphere's breathing scale. */}
      {breathGroupRefs.map((ref, i) => (
        <group key={i} ref={(obj) => { ref.current = obj }} position={[0, 0, breathBaseRef.current[i].z]}>
          {Math.floor(i / BREATH_RING_COUNT) === CUBE_SET || Math.floor(i / BREATH_RING_COUNT) === CUBE_STACK_SET ? (
            <RoundedBox args={[1, 1, 1]} radius={CUBE_CHAMFER} smoothness={4} material={breathMaterials[i]} />
          ) : Math.floor(i / BREATH_RING_COUNT) === TETRA_STACK_SET ? (
            <mesh geometry={tetraGeometry} material={breathMaterials[i]} />
          ) : (
            <mesh scale={Math.floor(i / BREATH_RING_COUNT) === BREATH_SPIN_FROM_APPEAR_SET ? SPIN_RING_MESH_SCALE : BREATH_RING_SCALE}>
              <torusGeometry args={[BASE_RADIUS, Math.floor(i / BREATH_RING_COUNT) === BREATH_SPIN_FROM_APPEAR_SET ? SPIN_RING_TUBE : BREATH_RING_TUBE, 16, 64]} />
              <primitive object={breathMaterials[i]} attach="material" />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}
