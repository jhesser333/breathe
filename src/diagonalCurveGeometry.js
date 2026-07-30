// Shared geometry for the curved "parenthesis" diagonal slider tracks.
// Single source of truth for both rendering (SlidersDiagonal.jsx) and
// touch/drag hit-testing (useTouchSlider.js).

export const CURVE_BOX_W = 150
export const CURVE_BOX_H = 220

export const TRACK_THICKNESS = 38
export const THUMB_SIZE = 42
export const THUMB_INSET_FRAC = 0.12

// Cubic Bezier control points as fractions of (CURVE_BOX_W, CURVE_BOX_H),
// defined for the LEFT "(" orientation. P0 = exhale end (arc-length s=0,
// near bottom/center), P3 = inhale end (s=1, near top-outer corner).
// The right side mirrors x -> 1 - x.
export const P0_FRAC = { x: 0.72, y: 0.95 }
export const P1_FRAC = { x: -0.05, y: 0.78 }
export const P2_FRAC = { x: -0.05, y: 0.18 }
export const P3_FRAC = { x: 0.22, y: 0.05 }

export const CURVE_SAMPLES = 48

function fracToPoint(f, w, h) {
  return { x: f.x * w, y: f.y * h }
}

export function getSideControlPoints(side, w = CURVE_BOX_W, h = CURVE_BOX_H) {
  const p0 = fracToPoint(P0_FRAC, w, h)
  const p1 = fracToPoint(P1_FRAC, w, h)
  const p2 = fracToPoint(P2_FRAC, w, h)
  const p3 = fracToPoint(P3_FRAC, w, h)
  if (side === 'left') return { p0, p1, p2, p3 }
  const mirror = (p) => ({ x: w - p.x, y: p.y })
  return { p0: mirror(p0), p1: mirror(p1), p2: mirror(p2), p3: mirror(p3) }
}

export function cubicBezierPoint(s, p0, p1, p2, p3) {
  const mt = 1 - s
  const a = mt * mt * mt
  const b = 3 * mt * mt * s
  const c = 3 * mt * s * s
  const d = s * s * s
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  }
}

export function sampleCurve(side, w = CURVE_BOX_W, h = CURVE_BOX_H, n = CURVE_SAMPLES) {
  const { p0, p1, p2, p3 } = getSideControlPoints(side, w, h)
  const points = []
  let totalLength = 0
  let prev = null
  for (let i = 0; i <= n; i++) {
    const s = i / n
    const pt = cubicBezierPoint(s, p0, p1, p2, p3)
    if (prev) totalLength += Math.hypot(pt.x - prev.x, pt.y - prev.y)
    points.push({ x: pt.x, y: pt.y, s, dist: totalLength })
    prev = pt
  }
  return { points, totalLength }
}

const SAMPLE_CACHE = {
  left: sampleCurve('left'),
  right: sampleCurve('right'),
}

function samplesFor(side, w, h) {
  return (w === CURVE_BOX_W && h === CURVE_BOX_H) ? SAMPLE_CACHE[side] : sampleCurve(side, w, h)
}

function projectOntoSegment(x, y, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  let t = lenSq > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / lenSq : 0
  t = Math.min(1, Math.max(0, t))
  const px = a.x + t * dx
  const py = a.y + t * dy
  return {
    x: px,
    y: py,
    s: a.s + (b.s - a.s) * t,
    dist: a.dist + (b.dist - a.dist) * t,
    distSq: (px - x) ** 2 + (py - y) ** 2,
  }
}

// Nearest point on the curve to (x, y), in the same box-local coordinate
// space used by sampleCurve. Returns { arcFrac, point } where arcFrac is
// dist/totalLength (0 = exhale end, 1 = inhale end).
export function projectToCurve(x, y, side, w = CURVE_BOX_W, h = CURVE_BOX_H) {
  const { points, totalLength } = samplesFor(side, w, h)
  let bestIdx = 0
  let bestDistSq = Infinity
  for (let i = 0; i < points.length; i++) {
    const dSq = (points[i].x - x) ** 2 + (points[i].y - y) ** 2
    if (dSq < bestDistSq) { bestDistSq = dSq; bestIdx = i }
  }
  let best = points[bestIdx]
  if (bestIdx > 0) {
    const c = projectOntoSegment(x, y, points[bestIdx - 1], points[bestIdx])
    if (c.distSq < bestDistSq) { bestDistSq = c.distSq; best = c }
  }
  if (bestIdx < points.length - 1) {
    const c = projectOntoSegment(x, y, points[bestIdx], points[bestIdx + 1])
    if (c.distSq < bestDistSq) { bestDistSq = c.distSq; best = c }
  }
  const arcFrac = totalLength > 0 ? best.dist / totalLength : 0
  return { arcFrac, point: { x: best.x, y: best.y } }
}

export function applyArcInset(arcFrac, insetFrac = THUMB_INSET_FRAC) {
  return insetFrac + arcFrac * (1 - 2 * insetFrac)
}

// Point at a given arc-length fraction (0..1) along the curve, for thumb placement.
export function pointAtArcFrac(side, arcFrac, w = CURVE_BOX_W, h = CURVE_BOX_H) {
  const { points, totalLength } = samplesFor(side, w, h)
  const targetDist = arcFrac * totalLength
  let i = 0
  while (i < points.length - 1 && points[i + 1].dist < targetDist) i++
  const a = points[i]
  const b = points[Math.min(i + 1, points.length - 1)]
  const segLen = b.dist - a.dist
  const t = segLen > 0 ? (targetDist - a.dist) / segLen : 0
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

export function getPathD(side, w = CURVE_BOX_W, h = CURVE_BOX_H) {
  const { p0, p1, p2, p3 } = getSideControlPoints(side, w, h)
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`
}

export function getCurveLength(side, w = CURVE_BOX_W, h = CURVE_BOX_H) {
  return samplesFor(side, w, h).totalLength
}
