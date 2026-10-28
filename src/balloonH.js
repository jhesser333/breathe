import * as THREE from 'three'
import { planeLimits, PLANE_HALF_H } from './planeCloudsG'

// Shape H (Balloon): shared sizes and layout for MorphH (the balloon) and
// BalloonCourseH (the walls, door, rings and the user-gated pace).
// Same camera and side reach as the Paper Airplane (planeLimits).

// Balloon: a sphere (diameter = the airplane's wingspan) with a small cone
// knot under it, pivot at the sphere's center. Scale is in its own axes
// (top = +Y): [1, 1, 1] at full Inhale (round), EXHALE_SCALE at full Exhale
// (tall and thin).
export const BALLOON_R = 0.7
export const KNOT_R = 0.1
export const KNOT_H = 0.14
export const EXHALE_SCALE = [0.18, 1.6, 0.18]

// Course pieces: rounded slabs like the airplane's bar. Each wall is as wide
// as it is tall; the short barrier and door match a full wall's width.
export const WALL_H = 3          // full-height wall (and its width)
export const WALL_D = 2          // wall depth (z)
export const WALL_STEP = 2.3     // wall front to next wall front
export const WALL_HEIGHTS = [1, 1, 1, 0.75, 0.5, 0.25]   // × WALL_H, the staircase down
export const SHORT_H = 0.2       // the short barrier the balloon rests over
export const SHORT_D = 1.6
export const WALL_FRONT_Z = -1.6 // first wall's front face, from the segment's start
export const DOOR_T = 0.3        // door thickness
export const DOOR_CLEAR = 0.3    // door top above the balloon's top at flight height
export const SEGMENT_LEN = 17    // short barrier to the next short barrier
export const RING_COUNT = 5      // rings over walls 1-5
export const RING_SIDE_FRAC = 0.58
const REST_GAP = 0.1             // knot tip -> short barrier top at full Exhale
const FLIGHT_CLEAR = 0.4         // balloon bottom -> wall top at the lowest allowed flight height

// Wall k's front face and center z, from the segment's start.
export const wallFrontZ = (k) => WALL_FRONT_Z - k * WALL_STEP
export const wallCenterZ = (k) => wallFrontZ(k) - WALL_D / 2

// Heights at z = 0 in world units, from the airplane's range:
// restY (balloon center at full Exhale: its bottom where the plane's bottom
// sits at full Inhale, clear of the sliders), flightY (full Inhale: the high
// ring's center, never so low the balloon can't clear the walls), groundY,
// wallTop, doorH, spanX (side reach).
export function balloonLimits(camera, size) {
  const { topY, bottomY, spanX } = planeLimits(camera, size)
  const restBottom = bottomY - PLANE_HALF_H
  const restY = restBottom + KNOT_H + BALLOON_R * EXHALE_SCALE[1]
  const groundY = restBottom - REST_GAP - SHORT_H
  const wallTop = groundY + WALL_H
  const flightY = Math.max(topY, wallTop + KNOT_H + BALLOON_R + FLIGHT_CLEAR)
  const doorH = flightY + BALLOON_R + DOOR_CLEAR - wallTop
  return { restY, flightY, groundY, wallTop, doorH, spanX }
}

// The balloon's center height for a breath value (0 exhale -> 1 inhale).
export function balloonY(limits, lv) {
  return THREE.MathUtils.lerp(limits.restY, limits.flightY, lv)
}

// The balloon's scale in its own axes for a breath value.
export function balloonScale(lv, out) {
  return out.set(
    THREE.MathUtils.lerp(EXHALE_SCALE[0], 1, lv),
    THREE.MathUtils.lerp(EXHALE_SCALE[1], 1, lv),
    THREE.MathUtils.lerp(EXHALE_SCALE[2], 1, lv),
  )
}
