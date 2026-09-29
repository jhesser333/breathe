// Shared geometry for the curved "parenthesis" diagonal slider tracks.
// Single source of truth for both rendering (SlidersDiagonal.jsx) and
// touch/drag hit-testing (useTouchSlider.js).

export const CURVE_BOX_W = 160
export const CURVE_BOX_H = 200

export const TRACK_THICKNESS = 54
export const THUMB_SIZE = 60

// Each track is a circular arc (even radius) between two endpoints, given as
// fractions of (CURVE_BOX_W, CURVE_BOX_H) for the LEFT track. P0 = exhale end
// (arc-length s=0, near bottom/center), P2 = inhale end (s=1, up and out,
// inset from the box's outer edge so the thumb clears the screen edge).
// ARC_DEGREES is how far the arc turns between them: the circle's center
// sits on the outer/lower side, so the track leaves P0 close to vertical and
// bends outward toward P2. The right side mirrors x -> 1 - x.
export const P0_FRAC = { x: 0.76, y: 0.89 }
export const P2_FRAC = { x: 0.21, y: 0.20 }
export const ARC_DEGREES = 60

export const CURVE_SAMPLES = 48

// Circle through the side's endpoints: center, radius, start/end angles
// (y-down screen coordinates).
function getArc(side, w, h) {
  const mx = (x) => (side === 'left' ? x : w - x)
  const p0 = { x: mx(P0_FRAC.x * w), y: P0_FRAC.y * h }
  const p2 = { x: mx(P2_FRAC.x * w), y: P2_FRAC.y * h }
  const vx = p2.x - p0.x, vy = p2.y - p0.y
  const chord = Math.hypot(vx, vy)
  const half = (ARC_DEGREES * Math.PI / 180) / 2
  const r = chord / (2 * Math.sin(half))
  // Perpendicular to the chord, pointing outward (same x direction as P0 -> P2).
  let nx = vy / chord, ny = -vx / chord
  if (Math.sign(nx) !== Math.sign(vx)) { nx = -nx; ny = -ny }
  const d = r * Math.cos(half)
  const c = { x: (p0.x + p2.x) / 2 + nx * d, y: (p0.y + p2.y) / 2 + ny * d }
  const a0 = Math.atan2(p0.y - c.y, p0.x - c.x)
  let a2 = Math.atan2(p2.y - c.y, p2.x - c.x)
  // Take the short way round (the arc is well under 180°).
  if (a2 - a0 > Math.PI) a2 -= 2 * Math.PI
  if (a2 - a0 < -Math.PI) a2 += 2 * Math.PI
  return { p0, p2, c, r, a0, a2 }
}

export function sampleCurve(side, w = CURVE_BOX_W, h = CURVE_BOX_H, n = CURVE_SAMPLES) {
  const { c, r, a0, a2 } = getArc(side, w, h)
  const points = []
  let totalLength = 0
  let prev = null
  for (let i = 0; i <= n; i++) {
    const s = i / n
    const a = a0 + (a2 - a0) * s
    const pt = { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }
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
  const { p0, p2, r, a0, a2 } = getArc(side, w, h)
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 ${a2 > a0 ? 1 : 0} ${p2.x} ${p2.y}`
}

export function getCurveLength(side, w = CURVE_BOX_W, h = CURVE_BOX_H) {
  return samplesFor(side, w, h).totalLength
}
