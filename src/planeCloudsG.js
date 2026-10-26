import * as THREE from 'three'
import { makeCloud, sampleCloudSurface } from './cloudShapeF'

// Shape G (Paper Airplane): where the plane can fly, and the gates it
// dodges. Shared by MorphG (the plane) and GatesG / GatesBoxBreathingG.
// The gates use the rounded cubes (bottom of this file) for now; the cloud
// gates below are kept for when clouds come back.

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

// The plane's range at z = 0 in world units: topY (full Exhale), bottomY
// (full Inhale), spanX (side reach), halfW (half the view's widest width).
export function planeLimits(camera, size) {
  const sliderNY = -1 + (2 * SLIDER_CLEAR_PX) / size.height
  const top = hitFlightPlane(camera, 0, 1) || { y: 100 }
  const bottom = hitFlightPlane(camera, 0, sliderNY) || { y: -100 }
  const topY = top.y - PLANE_HALF_H - EDGE_MARGIN
  const bottomY = Math.min(topY, bottom.y + PLANE_HALF_H)
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
// Rounded-cube gates (in use; the cloud gates above are parked for later).
// Exhale gates have a bar (a rounded cube stretched BAR_SCALE_X in X and
// BAR_SCALE_Y in Y, spanning the screen) resting on the ground plane, at the
// plane's wrong height, bottomY (full Inhale), so it flies over it; Inhale
// gates have no bar. Every gate has a side wall resting on the ground plane,
// out on one side, so the free lane is the other side. The wall is a cube
// scaled SIDE_SCALE_X / SIDE_SCALE_Y, grown outward from its inner face (the
// face nearest x = 0).
export const CUBE_SIZE = 2
export const BAR_SCALE_X = 15
export const BAR_SCALE_Y = 2
export const SIDE_SCALE_X = 5
export const SIDE_SCALE_Y = 5
export const CUBE_RADIUS = 0.2
export const BAR_W = CUBE_SIZE * BAR_SCALE_X
export const BAR_H = CUBE_SIZE * BAR_SCALE_Y
export const SIDE_W = CUBE_SIZE * SIDE_SCALE_X
export const SIDE_H = CUBE_SIZE * SIDE_SCALE_Y
// The inner face sits where a plain cube centered at SIDE_CENTER_FRAC of the
// plane's side reach (spanX) would have its inner face.
const SIDE_CENTER_FRAC = 0.58
// Collision: boxes count this much inside their faces (a plain cube's old
// 0.9 x half-size), so grazing an edge doesn't count.
const CUBE_HIT_INSET = 0.1 * CUBE_SIZE / 2

// The ground plane under the plane (ties, the bar and the side walls sit on
// it): a plain cube's height below full Inhale.
export function groundY(limits) {
  return limits.bottomY - CUBE_SIZE / 2
}

// type: 'exhale' | 'inhale'; side: -1 (side wall on the left) | 1 (right).
// Returns { bar, side }, each { x, y, w, h } (center and size); bar is null
// for an Inhale gate.
export function makePlaneCubeGate(type, side, limits) {
  const { spanX } = limits
  const ground = groundY(limits)
  const innerX = side * (spanX * SIDE_CENTER_FRAC - CUBE_SIZE / 2)
  return {
    bar: type === 'exhale' ? { x: 0, y: ground + BAR_H / 2, w: BAR_W, h: BAR_H } : null,
    side: { x: innerX + side * SIDE_W / 2, y: ground + SIDE_H / 2, w: SIDE_W, h: SIDE_H },
  }
}

// Does the plane at (px, py) touch either box? x/y only, at the crossing.
export function hitsPlaneCubes(gate, px, py) {
  const padX = PLANE_HALF_W * PLANE_HIT_PAD
  const padY = PLANE_HALF_H * PLANE_HIT_PAD
  return [gate.bar, gate.side].some((b) => b &&
    Math.abs(px - b.x) < b.w / 2 - CUBE_HIT_INSET + padX
    && Math.abs(py - b.y) < b.h / 2 - CUBE_HIT_INSET + padY)
}

// Random point on either box's surface, in world space (gate at depth z).
export function sampleCubeGateSurface(gate, z) {
  const b = gate.bar && Math.random() < 0.6 ? gate.bar : gate.side
  const half = [b.w / 2, b.h / 2, CUBE_SIZE / 2]
  const p = half.map((h) => (Math.random() * 2 - 1) * h)
  const axis = Math.floor(Math.random() * 3)   // push one axis out to a face
  p[axis] = (Math.random() < 0.5 ? -1 : 1) * half[axis]
  return [b.x + p[0], b.y + p[1], z + p[2]]
}

// Gate look: opaque, GATE_EMISSIVE glow, fading in over FADE_IN_S at spawn.
// The cube targets' pulse (x1 -> x2 over z PULSE_START_Z -> 0, held after);
// a miss ramps the glow to 0. Inhale gates (side wall only) wear the primary
// color, Exhale gates the text color. Once judged, the gate falls and tips
// over (in the gate files) while fading out over FALL_FADE_S.
export const GATE_EMISSIVE = 0.2
export const FALL_FADE_S = 2
export const FALL_GRAVITY = 6                    // units/s^2
const FALL_SPIN_X = [0.3, 0.8]                   // rad/s, forward/back tip
const FALL_SPIN_Z = [0.1, 0.3]                   // rad/s, a little sideways
const GATE_FADE_IN_S = 1
const PULSE_START_Z = -0.5

function randSigned([min, max]) {
  return (Math.random() < 0.5 ? -1 : 1) * (min + Math.random() * (max - min))
}

// Random tip-over spin [x, z] in rad/s.
export function makeFallSpin() {
  return [randSigned(FALL_SPIN_X), randSigned(FALL_SPIN_Z)]
}

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

// fadeElapsed: seconds since the gate appeared; judgedElapsed: seconds since
// it crossed z = 0 (null before); miss: 0-1 miss factor; live: live palette.
export function applyPlaneGateLook(material, type, z, fadeElapsed, judgedElapsed, miss, live) {
  const fadeIn = THREE.MathUtils.smoothstep(fadeElapsed / GATE_FADE_IN_S, 0, 1)
  const fadeOut = judgedElapsed == null ? 1 : 1 - THREE.MathUtils.smoothstep(judgedElapsed / FALL_FADE_S, 0, 1)
  const t = THREE.MathUtils.smoothstep((z - PULSE_START_Z) / -PULSE_START_Z, 0, 1)
  material.opacity = fadeIn * fadeOut
  material.emissiveIntensity = GATE_EMISSIVE * (1 + t) * (1 - miss)
  if (live) {
    material.color.copy(type === 'inhale' ? live.primary : live.text)
    material.emissive.copy(live.secondary)
  }
}
