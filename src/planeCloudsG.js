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

// The plane's range at z = 0 in world units: topY (full Exhale), bottomY
// (full Inhale), spanX (side reach), halfW (half the view's width).
export function planeLimits(camera, size) {
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z
  const halfW = halfH * camera.aspect
  const topY = halfH - PLANE_HALF_H - EDGE_MARGIN
  const bottomY = Math.min(topY, -halfH + (SLIDER_CLEAR_PX / size.height) * 2 * halfH + PLANE_HALF_H)
  return { topY, bottomY, spanX: Math.max(0, halfW - PLANE_HALF_W - EDGE_MARGIN), halfW }
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
// Exhale gates have a bar (a rounded cube stretched BAR_SCALE_X in X, spanning
// the screen) on the plane's wrong height, bottomY (full Inhale), so it flies
// over it; Inhale gates have no bar. Every gate has a side cube on the plane's
// right height, out on one side, so the free lane is the other side.
export const CUBE_SIZE = 2
export const BAR_SCALE_X = 5
export const CUBE_RADIUS = 0.2
const SIDE_CENTER_FRAC = 0.58   // side cube's center, as a fraction of the plane's side reach (spanX)
const CUBE_HIT_FORGIVE = 0.9 // boxes count at this fraction of their half-size

// type: 'exhale' | 'inhale'; side: -1 (side cube on the left) | 1 (right).
// Returns { bar, side }, each { x, y, w, h } (center and size); bar is null
// for an Inhale gate.
export function makePlaneCubeGate(type, side, limits) {
  const { topY, bottomY, spanX } = limits
  const rightY = type === 'exhale' ? topY : bottomY
  return {
    bar: type === 'exhale' ? { x: 0, y: bottomY, w: CUBE_SIZE * BAR_SCALE_X, h: CUBE_SIZE } : null,
    side: { x: side * spanX * SIDE_CENTER_FRAC, y: rightY, w: CUBE_SIZE, h: CUBE_SIZE },
  }
}

// Does the plane at (px, py) touch either box? x/y only, at the crossing.
export function hitsPlaneCubes(gate, px, py) {
  const padX = PLANE_HALF_W * PLANE_HIT_PAD
  const padY = PLANE_HALF_H * PLANE_HIT_PAD
  return [gate.bar, gate.side].some((b) => b &&
    Math.abs(px - b.x) < (b.w / 2) * CUBE_HIT_FORGIVE + padX
    && Math.abs(py - b.y) < (b.h / 2) * CUBE_HIT_FORGIVE + padY)
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
