import * as THREE from 'three'
import { makeCloud, sampleCloudSurface } from './cloudShapeF'

// Shape G (Paper Airplane): where the plane can fly, and its gates. Shared
// by MorphG (the plane) and GatesG / GatesBoxBreathingG. The gates use the
// bar + ring targets (bottom of this file) for now; the cloud gates below
// are kept for when clouds come back.

// The plane's half-size on screen, so the limits keep it just inside the edges.
export const PLANE_HALF_W = 0.7
export const PLANE_HALF_H = 0.35
const EDGE_MARGIN = 0.15
// Full Inhale: the plane's bottom sits this many pixels above the screen's
// bottom edge, clearing the sliders and their "inhale" labels.
const SLIDER_CLEAR_PX = 250

// Where the camera ray through a screen point (NDC nx, ny) meets the plane's
// flight plane, z = 0. Works for any camera angle (level or tilted down).
const _ray = new THREE.Vector3()
function hitFlightPlane(camera, nx, ny) {
  _ray.set(nx, ny, 0.5).unproject(camera)
  const o = camera.position
  const dz = _ray.z - o.z
  const t = Math.abs(dz) < 1e-6 ? -1 : -o.z / dz
  if (t <= 0) return null   // the ray never reaches z = 0 in front of the camera
  return { x: o.x + (_ray.x - o.x) * t, y: o.y + (_ray.y - o.y) * t }
}

// The plane's range at z = 0 in world units: topY (full Exhale, the high
// ring's center), bottomY (full Inhale, the low ring's center), spanX (side
// reach), halfW (half the view's widest width).
export function planeLimits(camera, size) {
  const sliderNY = -1 + (2 * SLIDER_CLEAR_PX) / size.height
  const top = hitFlightPlane(camera, 0, 1) || { y: 100 }
  const bottom = hitFlightPlane(camera, 0, sliderNY) || { y: -100 }
  const screenTopY = top.y - PLANE_HALF_H - EDGE_MARGIN
  const bottomY = Math.min(screenTopY, bottom.y + PLANE_HALF_H)
  // Full Exhale: the high ring's center (just above the bar), or the screen's
  // top if that's lower.
  const topY = Math.min(screenTopY, bottomY + HIGH_RING_RISE)
  // Side reach: the narrower of the view's widths at the top and bottom rows.
  const wTop = hitFlightPlane(camera, 1, 1)
  const wBottom = hitFlightPlane(camera, 1, sliderNY)
  const widths = [wTop, wBottom].filter(Boolean).map((p) => p.x)
  const minHalfW = widths.length ? Math.min(...widths) : 0
  const halfW = widths.length ? Math.max(...widths) : 0
  return { topY, bottomY, spanX: Math.max(0, minHalfW - PLANE_HALF_W - EDGE_MARGIN), halfW }
}

// Gates. Each is a big cloud filling one half of the plane's range (bottom
// for an Exhale gate, so the plane flies over it; top for an Inhale gate, so
// it flies under) plus a side cloud blocking one side of the open half.
const MAIN_SCALE = 0.55       // big cloud's uniform scale (makeCloud is ~14 units wide)
const SIDE_SCALE = 0.25       // side cloud's uniform scale
const GATE_LINE_FRAC = 0.5    // big cloud's edge: this far from bottomY to topY
const SIDE_INNER_X = 0        // side cloud's inner edge; the free lane is the other side
// Collision: cloud pieces count at HIT_FORGIVE of their size, the plane at
// PLANE_HIT_PAD of its half-size, so grazing an edge doesn't count.
const HIT_FORGIVE = 0.85
const PLANE_HIT_PAD = 0.6

// Local extents of a cloud (unscaled).
function cloudBounds(cloud) {
  return {
    minX: Math.min(...cloud.map((p) => p.position[0] - p.scale[0])),
    maxX: Math.max(...cloud.map((p) => p.position[0] + p.scale[0])),
    minY: Math.min(...cloud.map((p) => p.position[1] - p.scale[1])),
    maxY: Math.max(...cloud.map((p) => p.position[1] + p.scale[1])),
  }
}

// type: 'exhale' | 'inhale'; side: -1 (side cloud on the left) | 1 (right).
// Returns { main, side }, each { cloud, x, y, s } (group offset and scale).
export function makePlaneGate(type, side, limits) {
  const { topY, bottomY } = limits
  const gateY = THREE.MathUtils.lerp(bottomY, topY, GATE_LINE_FRAC)

  const mainCloud = makeCloud()
  const mb = cloudBounds(mainCloud)
  const mainY = type === 'exhale' ? gateY - mb.maxY * MAIN_SCALE : gateY - mb.minY * MAIN_SCALE

  const sideCloud = makeCloud()
  const sb = cloudBounds(sideCloud)
  // Centered on the plane's height in the open half (full Exhale / Inhale).
  const laneY = type === 'exhale' ? topY : bottomY
  const sideY = laneY - ((sb.minY + sb.maxY) / 2) * SIDE_SCALE
  const sideX = side < 0 ? SIDE_INNER_X - sb.maxX * SIDE_SCALE : SIDE_INNER_X - sb.minX * SIDE_SCALE

  return {
    main: { cloud: mainCloud, x: 0, y: mainY, s: MAIN_SCALE },
    side: { cloud: sideCloud, x: sideX, y: sideY, s: SIDE_SCALE },
  }
}

// Does the plane at (px, py) touch either cloud? x/y only, at the crossing.
export function hitsPlane(gate, px, py) {
  const padX = PLANE_HALF_W * PLANE_HIT_PAD
  const padY = PLANE_HALF_H * PLANE_HIT_PAD
  return [gate.main, gate.side].some(({ cloud, x, y, s }) => cloud.some((p) => {
    const dx = (px - (x + p.position[0] * s)) / (p.scale[0] * s * HIT_FORGIVE + padX)
    const dy = (py - (y + p.position[1] * s)) / (p.scale[1] * s * HIT_FORGIVE + padY)
    return dx * dx + dy * dy < 1
  }))
}

// Random point on either cloud's surface, in world space (gate at depth z).
export function sampleGateSurface(gate, z) {
  const part = Math.random() < 0.6 ? gate.main : gate.side
  const p = sampleCloudSurface(part.cloud)
  return [part.x + p[0] * part.s, part.y + p[1] * part.s, z + p[2] * part.s]
}

// Places a gate's two cloud groups (scale + offset within the slot group).
export function applyPlaneGate(mainGroup, sideGroup, gate) {
  mainGroup.position.set(gate.main.x, gate.main.y, 0)
  mainGroup.scale.setScalar(gate.main.s)
  sideGroup.position.set(gate.side.x, gate.side.y, 0)
  sideGroup.scale.setScalar(gate.side.s)
}

// ---------------------------------------------------------------------------
// Bar + ring gates (in use; the cloud gates above are parked for later).
// Bars use the plane-gate look below; rings use the cube targets' look
// (ringPulseEmissive).
// Every gate has a ring target (RING_R, the plane's wingspan) on a random
// side, where the plane should fly through: Inhale rings touch the ground
// plane, centered on bottomY (full Inhale); Exhale rings sit RING_GAP above
// the bar, centered on topY (full Exhale). Exhale gates also have a bar (a
// rounded cube stretched BAR_SCALE_X in X and BAR_SCALE_Y in Y, spanning the
// screen) resting on the ground plane, so the plane flies over it.
export const CUBE_SIZE = 2
export const BAR_SCALE_X = 15
export const BAR_SCALE_Y = 2
export const CUBE_RADIUS = 0.2
export const BAR_W = CUBE_SIZE * BAR_SCALE_X
export const BAR_H = CUBE_SIZE * BAR_SCALE_Y
export const RING_R = 2 * PLANE_HALF_W   // to the tube's center
export const RING_TUBE = 0.08            // tube radius
const RING_GAP = 0.2                     // bar top -> high ring's bottom edge
const RING_OUTER = RING_R + RING_TUBE
// Low ring center (bottomY) -> high ring center: down the ring's outer radius
// to the ground, up the bar, the gap, then the outer radius again.
const HIGH_RING_RISE = BAR_H + RING_GAP
// Ring x: SIDE_CENTER_FRAC of the plane's side reach (spanX), random side.
const SIDE_CENTER_FRAC = 0.58
// The plane counts as inside a ring when its center is within this of the
// ring's center: the inner radius less the plane's half-height.
const RING_HIT_R = RING_R - RING_TUBE - PLANE_HALF_H
// Collision: the bar counts this much inside its faces, so grazing an edge
// doesn't count.
const CUBE_HIT_INSET = 0.1 * CUBE_SIZE / 2

// The ground plane (ties and the bar sit on it): low enough that a ring
// centered on bottomY touches it.
export function groundY(limits) {
  return limits.bottomY - RING_OUTER
}

// type: 'exhale' | 'inhale'; side: -1 (ring on the left) | 1 (right).
// Returns { bar, ring }: bar { x, y, w, h } (center and size), null for an
// Inhale gate; ring { x, y } (center).
export function makePlaneCubeGate(type, side, limits) {
  const { spanX, topY, bottomY } = limits
  const ground = groundY(limits)
  return {
    bar: type === 'exhale' ? { x: 0, y: ground + BAR_H / 2, w: BAR_W, h: BAR_H } : null,
    ring: { x: side * spanX * SIDE_CENTER_FRAC, y: type === 'exhale' ? Math.max(bottomY, topY) : bottomY },
  }
}

// Is the plane at (px, py) inside the ring? x/y only, at the crossing.
export function ringContainsPlane(ring, px, py) {
  return Math.hypot(px - ring.x, py - ring.y) <= RING_HIT_R
}

// Does the plane at (px, py) touch the bar? x/y only, at the crossing.
export function hitsPlaneBar(bar, px, py) {
  if (!bar) return false
  const padX = PLANE_HALF_W * PLANE_HIT_PAD
  const padY = PLANE_HALF_H * PLANE_HIT_PAD
  return Math.abs(px - bar.x) < bar.w / 2 - CUBE_HIT_INSET + padX
    && Math.abs(py - bar.y) < bar.h / 2 - CUBE_HIT_INSET + padY
}

// Random point on the ring's tube surface, in world space (ring at depth z).
export function sampleRingSurface(ring, z) {
  const a = Math.random() * Math.PI * 2
  const b = Math.random() * Math.PI * 2
  const r = RING_R + RING_TUBE * Math.cos(b)
  return [ring.x + r * Math.cos(a), ring.y + r * Math.sin(a), z + RING_TUBE * Math.sin(b)]
}
export const RING_MAX_ABS_X = RING_OUTER   // burst speed: 0 at the center -> full at the edge

// Has a part scrolled off the bottom of the screen? (x, yTop, zFront): its
// top-front point in world space.
const _p = new THREE.Vector3()
export function isOffScreenBelow(camera, x, yTop, zFront) {
  _p.set(x, yTop, zFront).project(camera)
  return _p.y < -1
}
export function barTopFront(bar, z) {
  return [bar.x, bar.y + bar.h / 2, z + CUBE_SIZE / 2]
}
export function ringTopFront(ring, z) {
  return [ring.x, ring.y + RING_OUTER, z + RING_TUBE]
}

// Bar look: opaque, GATE_EMISSIVE glow in the secondary color, text-color
// base, fading in over GATE_FADE_IN_S at spawn. The cube targets' pulse (x1
// -> x2 over z PULSE_START_Z -> 0, held after); a miss ramps the glow to 0.
export const GATE_EMISSIVE = 0.2
const GATE_FADE_IN_S = 1
const PULSE_START_Z = -0.5

export function createPlaneGateMaterial(palette) {
  return new THREE.MeshStandardMaterial({
    color: palette.textColor,
    emissive: palette.secondaryColor,
    emissiveIntensity: GATE_EMISSIVE,
    transparent: true,
    opacity: 1,
    depthWrite: true,
  })
}

// fadeElapsed: seconds since the gate appeared; miss: 0-1 miss factor;
// live: live palette.
export function applyPlaneGateLook(material, z, fadeElapsed, miss, live) {
  const t = THREE.MathUtils.smoothstep((z - PULSE_START_Z) / -PULSE_START_Z, 0, 1)
  material.opacity = THREE.MathUtils.smoothstep(fadeElapsed / GATE_FADE_IN_S, 0, 1)
  material.emissiveIntensity = GATE_EMISSIVE * (1 + t) * (1 - miss)
  if (live) {
    material.color.copy(live.text)
    material.emissive.copy(live.secondary)
  }
}

// Ring look: the Morphing Cube's targets (createCubeMorphMaterial +
// applyGateLook in cubeMaterialB.js). This is their emissive: 1 on the
// approach, pulsing 1 -> 2 over z RING_PULSE_START_Z -> 0, held at 2 after.
// On a success the ring then fades out over RING_FADE_OUT_S.
const RING_PULSE_START_Z = -0.5
export const RING_FADE_OUT_S = 1
export function ringPulseEmissive(z) {
  if (z >= 0) return 2
  if (z < RING_PULSE_START_Z) return 1
  return 1 + THREE.MathUtils.smoothstep((z - RING_PULSE_START_Z) / -RING_PULSE_START_Z, 0, 1)
}
