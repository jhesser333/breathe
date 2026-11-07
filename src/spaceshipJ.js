import * as THREE from 'three'
import { planeLimits } from './planeCloudsG'
import { balloonLimits, WALL_H, SHORT_H, SHORT_D } from './balloonH'
import { BREATH_CYCLE_PALETTES } from './breathCyclePalettes'

// Shape J (Space Ship): sizes and heights shared by MorphJ (the ship) and
// SpaceshipBayJ (the bay, columns, front door, cube targets and pace).
// Nothing in the environment moves; the ship flies away from the camera.

// Ship: the Paper Airplane's pyramid plus 3 engines across its back.
export const WINGSPAN = 1.4
export const THICKNESS = 0.25
export const LENGTH = 2
export const ENGINE_R = 0.09
export const ENGINE_LEN = 0.25
export const ENGINE_X = [-0.4, 0, 0.4]

// Floor: two sliding door panels the size of the balloon's short barrier,
// meeting at x = 0 with a thin gap. Open = each slides one panel width out.
export const PANEL_W = WALL_H
export const PANEL_H = SHORT_H
export const PANEL_D = SHORT_D
export const DOOR_GAP = 0.02
export const HOVER_GAP = 0.15        // ship bottom -> floor top when it has risen

// Front door (the balloon's door look), in front of the ship.
export const FRONT_DOOR_T = 0.3
export const FRONT_DOOR_Z = -(LENGTH / 2 + 0.4)
export const FRONT_DOOR_CLEAR = 0.3  // door top above the ship's top at full height

// Columns at the screen's side edges, z = 0.
export const COLUMN_R = 0.12
export const GLOW_COLUMN_SCALE = 1.15
export const COLUMN_MARGIN = 0.15    // column's outer edge inside the screen edge
export const COLUMN_HEIGHT_FRAC = 0.75   // columns: this much of floor -> past the screen's top
export const FULL_HEIGHT_FRAC = 0.5     // full-inhale height: this much of floor -> midway up the balloon's range

// Destination spheres, at full height, one per SPHERE_SIDES entry (-1 left,
// 0 middle, 1 right), the side ones almost touching their side of the
// screen: x = side * (half-width of the view at the sphere - SPHERE_R -
// SPHERE_EDGE_MARGIN), worked out each frame (resolveCourse), so it fits
// any phone. Inverted normals (BackSide), so the near half is invisible
// and you see inside the far half. The mic needs START_LAG_S of blowing to be
// sure it's a blow (blowDetector's early window), then the ship reaches the
// front edge after TARGET_EXHALE_S - ARRIVE_S - START_LAG_S of flying and
// eases to a stop at the center over ARRIVE_S (an ease-out whose starting
// speed matches SHIP_SPEED), so a ~5 s exhale, counted from its real start,
// docks it.
export const SPHERE_SIDES = [-1, 0, 1]
export const SPHERE_EDGE_MARGIN = 0.3
export const SHIP_SPEED = 5          // flying speed, units/s
export const TARGET_EXHALE_S = 5
export const START_LAG_S = 0.15     // blowDetector's BLOW_EARLY_S
export const SPHERE_R = 1.5
export const ARRIVE_S = (2 * SPHERE_R) / SHIP_SPEED   // 0.6 s: front edge -> center
export const SPHERE_Z = -(SHIP_SPEED * (TARGET_EXHALE_S - ARRIVE_S - START_LAG_S)) - SPHERE_R   // -22.75
export const COURSE_END_Z = SPHERE_Z  // a ship that missed the sphere(s) ends its trip here

// Cube targets, three cube lengths apart (CUBE_SPACING, center to center): a
// straight line down the middle (x = 0, from FORK_Z) to the middle sphere,
// and a path to each side sphere: it starts beside the middle line's second
// cube (x = ±BRANCH_START_X, z BRANCH_START_Z), heading straight ahead, and
// curves out in a circular arc through the side sphere's center, so it meets
// the sphere a little toward the middle from its nearest point and the ship
// following it enters there. x and the Y turn are worked out each frame
// (resolveCourse), since the side spheres' x follows the screen; path cubes
// inside the sphere (or touching it) are hidden. Following a path is
// optional: docking only needs the ship to reach a sphere.
export const TARGET_SIZE = 0.5
export const CUBE_SPACING = TARGET_SIZE * 4
export const FORK_Z = -3             // first middle cube
const MIDDLE_END_Z = SPHERE_Z + SPHERE_R + 1   // last middle cube, just before the middle sphere
const BRANCH_START_Z = FORK_Z - CUBE_SPACING   // beside the middle line's second cube
const BRANCH_START_X = TARGET_SIZE * 2         // ...one cube's gap from it
const BRANCH_END_Z = SPHERE_Z        // side paths: rows down to the sphere's center (the ones inside are hidden)

// Worlds: each sphere is one breath-cycle palette plus the slider audio group
// with the same index (BREATH_CYCLE_PALETTES[k] <-> slider group k).
export const WORLD_COUNT = BREATH_CYCLE_PALETTES.length

// Cube layout (fixed; only the spheres' worlds are random). branch: the side
// of the sphere its line leads to (0 = the middle line). row: cubes at the
// same z share a row; as the ship passes a row, only its nearest cube is judged.
function makeCubes() {
  const cubes = []
  for (const side of SPHERE_SIDES) {
    let row = side === 0 ? 0 : 1
    const end = side === 0 ? MIDDLE_END_Z : BRANCH_END_Z
    for (let z = side === 0 ? FORK_Z : BRANCH_START_Z; z >= end - 1e-6; z -= CUBE_SPACING, row++) {
      cubes.push({ z, branch: side, row, x: 0, rotY: 0, hidden: false })
    }
  }
  return cubes
}

// A new course: the cubes, plus the spheres, each a world. The worlds that
// aren't the current one come first, in random order; with more spheres than
// that (three spheres, three palettes) the current world fills the rest, so
// one sphere keeps you where you are.
export function makeCourse(currentWorld = 0) {
  const others = []
  for (let k = 1; k < WORLD_COUNT; k++) others.push((currentWorld + k) % WORLD_COUNT)
  if (others.length === 0) others.push(currentWorld)
  const worlds = [...others]
  if (worlds.length < SPHERE_SIDES.length && !worlds.includes(currentWorld)) worlds.push(currentWorld)
  if (SPHERE_SIDES.length > 1) worlds.sort(() => Math.random() - 0.5)
  return {
    cubes: makeCubes(),
    spheres: SPHERE_SIDES.map((side, i) => ({ side, x: 0, z: SPHERE_Z, world: worlds[i % worlds.length] })),
  }
}
export const COURSE_SIZE = makeCubes().length
export const SPHERE_COUNT = SPHERE_SIDES.length

// Half-width of the view at (y, z), in world units. The camera has no yaw or
// roll and the lens shift is vertical only, so screen x is linear in world x.
const _hw = new THREE.Vector3()
export function halfWidthAt(camera, y, z) {
  _hw.set(1, y, z).project(camera)
  return _hw.x > 1e-6 ? 1 / _hw.x : 1
}

// Places the course for this camera and height: each sphere's x, and each
// cube's x, Y turn (following its line) and whether it's hidden.
export function resolveCourse(course, camera, y) {
  const sphereX = Math.max(0, halfWidthAt(camera, y, SPHERE_Z) - SPHERE_R - SPHERE_EDGE_MARGIN)
  for (const sp of course.spheres) sp.x = sp.side * sphereX
  // A right path's x at z: the circle tangent to straight ahead at
  // (BRANCH_START_X, BRANCH_START_Z) through the sphere's center (radius R,
  // its center R to the right of the start).
  const dx = sphereX - BRANCH_START_X
  const dz = BRANCH_START_Z - SPHERE_Z
  const R = dx > 1e-3 ? (dx * dx + dz * dz) / (2 * dx) : Infinity
  const xAt = (z) => {
    if (!Number.isFinite(R)) return BRANCH_START_X
    const d = Math.min(BRANCH_START_Z - z, R)
    return BRANCH_START_X + R - Math.sqrt(Math.max(0, R * R - d * d))
  }
  for (const c of course.cubes) {
    if (c.branch === 0) { c.x = 0; c.rotY = 0; c.hidden = false; continue }
    c.x = c.branch * xAt(c.z)
    const slope = c.branch * (xAt(c.z - 0.05) - xAt(c.z + 0.05)) / 0.1   // dx per unit down the road
    c.rotY = Math.atan2(-slope, 1)
    c.hidden = Math.hypot(c.x - c.branch * sphereX, c.z - SPHERE_Z) < SPHERE_R + TARGET_SIZE / 2
  }
}

// Side tilt: phone roll that puts the ship at its side limit, which follows
// the screen edge at the ship's depth (SpaceshipBayJ writes ship.sideRange):
// its center SHIP_EDGE_INSET inside the edge, so a little of it clips.
export const SIDE_TILT_FULL_DEG = 25
export const SHIP_EDGE_INSET = WINGSPAN * 0.3

// Exit: the down and sideways pulls ramp in over this long (SpaceshipBayJ, MorphJ).
export const EXIT_TURN_S = 1.5

// Where the camera ray through a screen point (NDC) meets z = 0.
const _ray = new THREE.Vector3()
function hitZ0(camera, nx, ny) {
  _ray.set(nx, ny, 0.5).unproject(camera)
  const o = camera.position
  const dz = _ray.z - o.z
  const t = Math.abs(dz) < 1e-6 ? -1 : -o.z / dz
  if (t <= 0) return null
  return { x: o.x + (_ray.x - o.x) * t, y: o.y + (_ray.y - o.y) * t }
}

// Heights and edges at z = 0 in world units:
// hoverY (ship center after rising: the plane's full-Inhale spot, clear of
// the sliders), floorTop, fullY (full inhale: midway between the balloon's
// lowest and highest heights, × FULL_HEIGHT_FRAC above the floor), columnX
// (column centers), columnTop (COLUMN_HEIGHT_FRAC of the way to past the
// screen's top). Pass the unshifted reference camera (SpaceshipBayJ).
export function shipLimits(camera, size) {
  const { bottomY, topY } = planeLimits(camera, size)
  const hoverY = bottomY
  const floorTop = hoverY - THICKNESS / 2 - HOVER_GAP
  const { restY, flightY } = balloonLimits(camera, size)
  const midY = THREE.MathUtils.clamp((restY + flightY) / 2, hoverY + 0.3, Math.max(hoverY + 0.3, topY))
  const fullY = Math.max(hoverY + 0.2, floorTop + FULL_HEIGHT_FRAC * (midY - floorTop))
  const edge = hitZ0(camera, 1, 0)
  const columnX = Math.max(WINGSPAN / 2 + COLUMN_R, (edge ? edge.x : 1.3) - COLUMN_R * GLOW_COLUMN_SCALE - COLUMN_MARGIN)
  const top = hitZ0(camera, 0, 1)
  const columnTop = floorTop + COLUMN_HEIGHT_FRAC * ((top ? top.y : midY + 3) + 1 - floorTop)
  return { hoverY, floorTop, fullY, columnX, columnTop }
}
