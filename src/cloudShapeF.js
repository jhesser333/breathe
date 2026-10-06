import * as THREE from 'three'

// Shape F (Hot Air Balloon): the random cloud shape shared by GatesF and
// GatesBoxBreathingF. A parent sphere with CHILD_COUNT child spheres centered
// on the camera-facing half of its surface, half of them on -X and half on
// +X. Scale lives on each mesh (not the group), so children don't inherit
// the parent's scale. Every spawn gets a fresh random cloud. Then
// EDGE_CHILD_COUNT more children widen it: one centered on the cloud's
// furthest -X point and one on its furthest +X point (parent or child).
export const PARENT_SCALE_RANGE = [3, 4]   // radius along each axis (unit-radius sphere geometry)
export const CHILD_SCALE_RANGE = [1, 2.5]
export const CHILD_COUNT = 4
export const EDGE_CHILD_COUNT = 2   // one at the furthest -X point, one at the furthest +X
export const CLOUD_MESH_COUNT = 1 + CHILD_COUNT + EDGE_CHILD_COUNT   // parent + children
export const EMISSIVE_INTENSITY = 4
export const OPACITY = 0.5

function randScale([min, max]) {
  const r = () => min + Math.random() * (max - min)
  return [r(), r(), r()]
}

function randomUnit() {
  let x, y, z, len
  do {
    x = Math.random() * 2 - 1
    y = Math.random() * 2 - 1
    z = Math.random() * 2 - 1
    len = Math.hypot(x, y, z)
  } while (len < 1e-3 || len > 1)
  return [x / len, y / len, z / len]
}

// Random unit direction with z > 0 (faces the camera) and the given X sign.
function facingDirection(xSign) {
  const [x, y, z] = randomUnit()
  return [xSign * Math.abs(x), y, Math.abs(z)]
}

// A cloud is a list of ellipsoids: { position, scale }, parent first.
export function makeCloud() {
  const parentScale = randScale(PARENT_SCALE_RANGE)
  const pieces = [{ position: [0, 0, 0], scale: parentScale }]
  for (let i = 0; i < CHILD_COUNT; i++) {
    const d = facingDirection(i < CHILD_COUNT / 2 ? -1 : 1)
    pieces.push({
      position: [d[0] * parentScale[0], d[1] * parentScale[1], d[2] * parentScale[2]],
      scale: randScale(CHILD_SCALE_RANGE),
    })
  }
  // Edge children: centered on the furthest -X / +X points of the cloud so far.
  const minP = pieces.reduce((a, p) => (p.position[0] - p.scale[0] < a.position[0] - a.scale[0] ? p : a))
  const maxP = pieces.reduce((a, p) => (p.position[0] + p.scale[0] > a.position[0] + a.scale[0] ? p : a))
  pieces.push(
    { position: [minP.position[0] - minP.scale[0], minP.position[1], minP.position[2]], scale: randScale(CHILD_SCALE_RANGE) },
    { position: [maxP.position[0] + maxP.scale[0], maxP.position[1], maxP.position[2]], scale: randScale(CHILD_SCALE_RANGE) },
  )
  return pieces
}

// Write a cloud onto CLOUD_MESH_COUNT pooled meshes.
export function applyCloud(meshes, cloud) {
  cloud.forEach((p, i) => {
    const m = meshes[i]
    if (!m) return
    m.position.set(...p.position)
    m.scale.set(...p.scale)
  })
}

// Random point on one of the cloud's ellipsoid surfaces, in the cloud's local space.
export function sampleCloudSurface(cloud) {
  const p = cloud[Math.floor(Math.random() * cloud.length)]
  const d = randomUnit()
  return [p.position[0] + d[0] * p.scale[0], p.position[1] + d[1] * p.scale[1], p.position[2] + d[2] * p.scale[2]]
}

// Outermost |x| of the cloud, so burst speed runs 0 at the center -> full at the edge.
export function cloudMaxAbsX(cloud) {
  return Math.max(...cloud.map((p) => Math.abs(p.position[0]) + p.scale[0]))
}

// Gate look: current material settings on the approach, the cube targets'
// emissive pulse (x1 -> x2 over z -0.5 -> 0, held after) with opacity
// ramping to full on the same curve, then an opacity
// fade over FADE_OUT_S once the cloud has been judged at z = 0. A miss ramps
// the emissive to 0 (missFactor from gateReactionsB), with no shrink.
export const FADE_IN_S = 1
export const FADE_OUT_S = 0.5
const PULSE_START_Z = -0.5

// 0 -> 1 over z PULSE_START_Z -> 0 (smoothstepped), held after.
function pulseT(z) {
  return THREE.MathUtils.smoothstep((z - PULSE_START_Z) / -PULSE_START_Z, 0, 1)
}

// fadeElapsed: seconds since the cloud appeared; judgedElapsed: seconds since
// it crossed z = 0 (null before); miss: 0-1 miss factor; live: live palette.
export function applyCloudLook(material, z, fadeElapsed, judgedElapsed, miss, live) {
  const fadeIn = THREE.MathUtils.smoothstep(fadeElapsed / FADE_IN_S, 0, 1)
  const fadeOut = judgedElapsed == null ? 1 : 1 - THREE.MathUtils.smoothstep(judgedElapsed / FADE_OUT_S, 0, 1)
  const t = pulseT(z)
  material.opacity = THREE.MathUtils.lerp(OPACITY, 1, t) * fadeIn * fadeOut   // full opacity at z = 0
  material.emissiveIntensity = EMISSIVE_INTENSITY * (1 + t) * (1 - miss)          // x1 -> x2
  if (live) {
    material.color.copy(live.text)
    material.emissive.copy(live.secondary)
  }
}

export function createCloudMaterial(palette) {
  return new THREE.MeshStandardMaterial({
    color: palette.textColor,
    emissive: palette.secondaryColor,
    emissiveIntensity: EMISSIVE_INTENSITY,
    transparent: true,
    opacity: OPACITY,
    depthWrite: false,
  })
}
