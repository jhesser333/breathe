import * as THREE from 'three'
import { planeLimits } from './planeCloudsG'
import { balloonLimits, WALL_H, SHORT_H, SHORT_D } from './balloonH'

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

// Cube targets: one line of cubes snaking along the road (-Z), a cube's
// length apart. x(z) = two sine waves with random wavelengths and phases,
// easing in from x = 0 over SNAKE_EASE_IN so it starts in front of the bay.
export const TARGET_SIZE = 0.5
export const SNAKE_MAX_X = 1         // the snake's widest swing
const SNAKE_A = [0.75, 0.25]         // amplitude of each wave (sum = SNAKE_MAX_X)
const SNAKE_WAVELENGTH = [[14, 22], [6, 9]]
const SNAKE_EASE_IN = 6
export const COURSE_START_Z = -3     // first cube's center
export const COURSE_END_Z = -80      // the course (and a trip) ends here

// Side tilt: phone roll that puts the ship at its side limit.
export const SIDE_TILT_FULL_DEG = 25
export const SIDE_RANGE = SNAKE_MAX_X + 0.3

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

// A new course: the snake. Returns [{ x, z, rotY }] cube centers, each
// turned to follow the snake's direction.
export function makeCourse() {
  const waves = SNAKE_A.map((a, i) => ({
    a, k: (2 * Math.PI) / THREE.MathUtils.randFloat(...SNAKE_WAVELENGTH[i]), phase: Math.random() * 2 * Math.PI,
  }))
  const xAt = (d) => {   // d = distance down the road from the first cube
    const ease = THREE.MathUtils.smoothstep(d / SNAKE_EASE_IN, 0, 1)
    return ease * waves.reduce((sum, w) => sum + w.a * Math.sin(w.k * d + w.phase), 0)
  }
  const cubes = []
  for (let z = COURSE_START_Z; z > COURSE_END_Z; z -= TARGET_SIZE * 2) {
    const d = COURSE_START_Z - z
    const slope = (xAt(d + 0.05) - xAt(d - 0.05)) / 0.1   // dx per unit down the road
    cubes.push({ x: xAt(d), z, rotY: Math.atan2(-slope, 1) })
  }
  return cubes
}
export const COURSE_SIZE = makeCourse().length
