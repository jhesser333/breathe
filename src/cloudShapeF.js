import * as THREE from 'three'

// Shape F (Hot Air Balloon): the random cloud shape shared by GatesF and
// GatesBoxBreathingF. A parent sphere with CHILD_COUNT child spheres centered
// on the camera-facing half of its surface, half of them on -X and half on
// +X. Scale lives on each mesh (not the group), so children don't inherit
// the parent's scale. Every spawn gets a fresh random cloud.
export const PARENT_SCALE_RANGE = [3, 4]   // radius along each axis (unit-radius sphere geometry)
export const CHILD_SCALE_RANGE = [1, 2.5]
export const CHILD_COUNT = 4
export const CLOUD_MESH_COUNT = CHILD_COUNT + 1   // parent + children
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
// emissive pulse (x1 -> x2 over z -0.5 -> 0, held after), then an opacity
// fade over FADE_OUT_S once the cloud has been judged at z = 0. A miss ramps
// the emissive to 0 (missFactor from gateReactionsB), with no shrink.
export const FADE_IN_S = 1
export const FADE_OUT_S = 0.5
const PULSE_START_Z = -0.5

function pulseMult(z) {
  if (z >= 0) return 2
  if (z >= PULSE_START_Z) return 1 + THREE.MathUtils.smoothstep((z - PULSE_START_Z) / -PULSE_START_Z, 0, 1)
  return 1
}

// fadeElapsed: seconds since the cloud appeared; judgedElapsed: seconds since
// it crossed z = 0 (null before); miss: 0-1 miss factor; live: live palette.
export function applyCloudLook(material, z, fadeElapsed, judgedElapsed, miss, live) {
  const fadeIn = THREE.MathUtils.smoothstep(fadeElapsed / FADE_IN_S, 0, 1)
  const fadeOut = judgedElapsed == null ? 1 : 1 - THREE.MathUtils.smoothstep(judgedElapsed / FADE_OUT_S, 0, 1)
  material.opacity = OPACITY * fadeIn * fadeOut
  material.emissiveIntensity = EMISSIVE_INTENSITY * pulseMult(z) * (1 - miss)
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
