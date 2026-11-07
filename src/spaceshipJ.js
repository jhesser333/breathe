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

// Destination spheres: one left, one right, at full height. Inverted normals
// (BackSide), so the near half is invisible and you see inside the far half.
// The ship reaches the front edge after TARGET_EXHALE_S - ARRIVE_S of
// flying, then eases to a stop at the center over ARRIVE_S (an ease-out whose
// starting speed matches SHIP_SPEED), so a ~6 s exhale docks it.
export const SHIP_SPEED = 5          // flying speed, units/s
export const TARGET_EXHALE_S = 6
export const SPHERE_R = 1.5
export const SPHERE_X = 2.2
export const ARRIVE_S = (2 * SPHERE_R) / SHIP_SPEED   // 0.6 s: front edge -> center
export const SPHERE_Z = -(SHIP_SPEED * (TARGET_EXHALE_S - ARRIVE_S)) - SPHERE_R   // -28.5
export const DOCK_TOLERANCE = SPHERE_R - WINGSPAN / 2   // ship center within this of the sphere's x = inside
export const COURSE_END_Z = SPHERE_Z  // a ship that missed both spheres ends its trip here

// Cube targets: a stem straight out of the bay, forking into two branches
// that ease out to each sphere's x, a cube's length apart.
export const TARGET_SIZE = 0.5
export const COURSE_START_Z = -3     // first cube's center
export const FORK_Z = -8             // last stem cube
const BRANCH_END_Z = SPHERE_Z + SPHERE_R + 1   // last branch cube, just before the sphere

// Worlds: each sphere is one breath-cycle palette plus the slider audio group
// with the same index (BREATH_CYCLE_PALETTES[k] <-> slider group k).
export const WORLD_COUNT = BREATH_CYCLE_PALETTES.length

// Cube layout (fixed; only the spheres' worlds are random).
// branch: 0 = stem, -1 = left, 1 = right.
function makeCubes() {
  const cubes = []
  for (let z = COURSE_START_Z; z >= FORK_Z - 1e-6; z -= TARGET_SIZE * 2) cubes.push({ x: 0, z, rotY: 0, branch: 0 })
  const span = FORK_Z - BRANCH_END_Z
  const xAt = (z) => SPHERE_X * THREE.MathUtils.smoothstep((FORK_Z - z) / span, 0, 1)
  for (const side of [-1, 1]) {
    for (let z = FORK_Z - TARGET_SIZE * 2; z >= BRANCH_END_Z - 1e-6; z -= TARGET_SIZE * 2) {
      const slope = side * (xAt(z - 0.05) - xAt(z + 0.05)) / 0.1   // dx per unit down the road
      cubes.push({ x: side * xAt(z), z, rotY: Math.atan2(-slope, 1), branch: side })
    }
  }
  return cubes
}

// A new course: the cubes, plus the two spheres, each one of the worlds that
// isn't current (left/right at random).
export function makeCourse(currentWorld = 0) {
  const others = []
  for (let k = 0; k < WORLD_COUNT; k++) if (k !== currentWorld) others.push(k)
  while (others.length < 2) others.push(currentWorld)
  if (Math.random() < 0.5) others.reverse()
  return {
    cubes: makeCubes(),
    spheres: [{ x: -SPHERE_X, z: SPHERE_Z, world: others[0] }, { x: SPHERE_X, z: SPHERE_Z, world: others[1] }],
  }
}
export const COURSE_SIZE = makeCubes().length

// Side tilt: phone roll that puts the ship at its side limit.
export const SIDE_TILT_FULL_DEG = 25
export const SIDE_RANGE = SPHERE_X + 0.3

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
