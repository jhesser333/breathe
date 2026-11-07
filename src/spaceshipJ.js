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
// 1 right; [0] would put a single one straight ahead), each almost touching
// its side of the screen: x = side * (half-width of the view at the sphere -
// SPHERE_R - SPHERE_EDGE_MARGIN), worked out each frame (resolveCourse), so it
// fits any phone. Inverted normals (BackSide), so the near half is invisible
// and you see inside the far half. The mic needs START_LAG_S of blowing to be
// sure it's a blow (blowDetector's early window), then the ship reaches the
// front edge after TARGET_EXHALE_S - ARRIVE_S - START_LAG_S of flying and
// eases to a stop at the center over ARRIVE_S (an ease-out whose starting
// speed matches SHIP_SPEED), so a ~5 s exhale, counted from its real start,
// docks it.
export const SPHERE_SIDES = [-1, 1]
export const SPHERE_EDGE_MARGIN = 0.3
export const SHIP_SPEED = 5          // flying speed, units/s
export const TARGET_EXHALE_S = 5
export const START_LAG_S = 0.15     // blowDetector's BLOW_EARLY_S
export const SPHERE_R = 1.5
export const ARRIVE_S = (2 * SPHERE_R) / SHIP_SPEED   // 0.6 s: front edge -> center
export const SPHERE_Z = -(SHIP_SPEED * (TARGET_EXHALE_S - ARRIVE_S - START_LAG_S)) - SPHERE_R   // -22.75
export const COURSE_END_Z = SPHERE_Z  // a ship that missed the sphere(s) ends its trip here

// Cube targets, three cube lengths apart (CUBE_SPACING, center to center): one
// stem cube straight out of the bay at FORK_Z, then a trail to each sphere
// making an S across the screen. The left sphere's trail runs out to the left
// edge, sweeps across to the right edge, then back into the left sphere; the
// right one is its mirror image. A cube's x is an edge fraction f (-1 = its
// outer face on the left screen edge, 1 = the right) of the view's half-width
// at its depth, worked out each frame (resolveCourse). Following a trail is
// optional: docking only needs the ship lined up with a sphere.
export const TARGET_SIZE = 0.5
export const CUBE_SPACING = TARGET_SIZE * 4
export const CUBE_EDGE_MARGIN = 0.05  // f = ±1 leaves this gap to the screen edge
export const FORK_Z = -3             // the stem cube; the trails start from it
const BRANCH_END_Z = SPHERE_Z + SPHERE_R + 1   // the trails end here, just before the spheres
// The left trail's edge fraction along it (u 0 at FORK_Z -> 1 at BRANCH_END_Z),
// as [u, f] keypoints, smoothstepped between them; the last f is the sphere's
// (null = filled in each frame). The right trail negates f.
const TRAIL_KEYS = [[0, 0], [0.2, -1], [0.55, 1], [1, null]]

// Worlds: each sphere is one breath-cycle palette plus the slider audio group
// with the same index (BREATH_CYCLE_PALETTES[k] <-> slider group k).
export const WORLD_COUNT = BREATH_CYCLE_PALETTES.length

// Cube layout (fixed; only the spheres' worlds are random; x and rotY are
// filled in by resolveCourse). branch: 0 = stem, else the side of the sphere
// whose trail it's on. row: cubes at the same z share a row (the ship is
// judged against the row's nearest cube only, since the trails cross).
function makeCubes() {
  const cubes = [{ z: FORK_Z, u: 0, branch: 0, row: 0, x: 0, rotY: 0 }]
  const span = FORK_Z - BRANCH_END_Z
  for (const side of SPHERE_SIDES) {
    let row = 1
    for (let z = FORK_Z - CUBE_SPACING; z >= BRANCH_END_Z - 1e-6; z -= CUBE_SPACING, row++) {
      cubes.push({ z, u: (FORK_Z - z) / span, branch: side, row, x: 0, rotY: 0 })
    }
  }
  return cubes
}

// A new course: the cubes, plus the sphere(s), each a world that isn't the
// current one. One sphere: the next world, so each dock moves on through the
// palettes and loops. Several: the other worlds in random order.
export function makeCourse(currentWorld = 0) {
  const others = []
  for (let k = 1; k < WORLD_COUNT; k++) others.push((currentWorld + k) % WORLD_COUNT)
  if (others.length === 0) others.push(currentWorld)
  if (SPHERE_SIDES.length > 1) others.sort(() => Math.random() - 0.5)
  return {
    cubes: makeCubes(),
    spheres: SPHERE_SIDES.map((side, i) => ({ side, x: 0, z: SPHERE_Z, world: others[i % others.length] })),
  }
}
export const COURSE_SIZE = makeCubes().length

// Half-width of the view at (y, z), in world units. The camera has no yaw or
// roll and the lens shift is vertical only, so screen x is linear in world x.
const _hw = new THREE.Vector3()
export function halfWidthAt(camera, y, z) {
  _hw.set(1, y, z).project(camera)
  return _hw.x > 1e-6 ? 1 / _hw.x : 1
}

// The trail's edge fraction at u (left trail; the right one negates it).
function trailF(u, endF) {
  for (let i = 1; i < TRAIL_KEYS.length; i++) {
    const [u1, f1] = TRAIL_KEYS[i]
    if (u <= u1 || i === TRAIL_KEYS.length - 1) {
      const [u0, f0] = TRAIL_KEYS[i - 1]
      const a = f0 ?? endF
      const b = f1 ?? endF
      return a + (b - a) * THREE.MathUtils.smoothstep((u - u0) / (u1 - u0), 0, 1)
    }
  }
  return 0
}

// Places the course for this camera and height: each sphere's x, and each
// cube's x and Y turn (following its trail).
export function resolveCourse(course, camera, y) {
  const sphereX = Math.max(0, halfWidthAt(camera, y, SPHERE_Z) - SPHERE_R - SPHERE_EDGE_MARGIN)
  for (const sp of course.spheres) sp.x = sp.side * sphereX
  const cubeW = (z) => Math.max(0, halfWidthAt(camera, y, z) - TARGET_SIZE / 2 - CUBE_EDGE_MARGIN)
  const endW = cubeW(BRANCH_END_Z)
  const endF = endW > 0 ? sphereX / endW : 0   // the left sphere is at -endF
  const span = FORK_Z - BRANCH_END_Z
  // The left trail's x at z; the right trail (branch 1) is its mirror image.
  const xAt = (z) => trailF((FORK_Z - z) / span, -endF) * cubeW(z)
  for (const c of course.cubes) {
    if (c.branch === 0) { c.x = 0; c.rotY = 0; continue }
    const m = -c.branch
    c.x = m * xAt(c.z)
    const slope = m * (xAt(c.z - 0.05) - xAt(c.z + 0.05)) / 0.1   // dx per unit down the road
    c.rotY = Math.atan2(-slope, 1)
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
