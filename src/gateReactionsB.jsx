import { useMemo, useRef } from 'react'
import * as THREE from 'three'

// Shape B (Morphing Cube) only: success/miss reactions for the cube targets,
// shared by GatesB.jsx and GatesBoxBreathingB.jsx.
//
// Each target is judged once, as it reaches the Morph (z >= 0), against the
// raw right slider (0 = Inhale, 1 = Exhale):
//   success -> a particle burst from the target's two cubes, flying along X
//              away from the target's center (the Morph's axis);
//   miss    -> its glow ramps to 0 and each cube shrinks in place in X/Y.

export const SUCCESS_THRESHOLD = 0.95   // how far into Inhale/Exhale the right slider must be
export const MISS_RAMP_SECONDS = 0.25
export const MISS_SCALE = 0.25          // cubes shrink to this fraction of their X/Y size

// Target layout (matches both gate files): each cube is 0.5 units.
const CUBE_SIZE = 0.5
const GATE_B_X = 0.9                     // Inhale: left/right cubes
const GATE_B_Y = 0.25
const GATE_A_TOP_Y = 0.65                // Exhale: cubes above/below
const GATE_A_BOT_Y = -0.15
const CUBE_CENTERS = {
  inhale: [[-GATE_B_X, GATE_B_Y], [GATE_B_X, GATE_B_Y]],
  exhale: [[0, GATE_A_TOP_Y], [0, GATE_A_BOT_Y]],
}
// Outermost |x| of each target, so speed runs 0 at the center -> full at the edge.
const MAX_ABS_X = {
  inhale: GATE_B_X + CUBE_SIZE / 2,
  exhale: CUBE_SIZE / 2,
}

// Burst look: same as the Morph's bursts (MorphB.jsx).
const GATE_BURST_POOL = 1500
const GATE_BURST_COUNT = 150
const GATE_BURST_SPEED = [0.15, 0.5]    // units/s at the target's outer edge
const GATE_BURST_SIZE = 60
const SPAWN_SENTINEL = -1e4

const VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSeed;
attribute vec3 aVel;
uniform float uTime;
uniform float uSize;
varying float vAlpha;
varying float vSeed;

void main() {
  float age = max(uTime - aSpawnTime, 0.0);
  float lifeT = clamp(age / aLifetime, 0.0, 1.0);
  float fadeIn = smoothstep(0.0, 0.15, lifeT);
  float fadeOut = 1.0 - smoothstep(0.7, 1.0, lifeT);
  float envelope = fadeIn * fadeOut;

  vec3 p = position + aVel * age;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (1.0 + aSeed) * envelope / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;

  vAlpha = envelope;
  vSeed = aSeed;
}
`

const FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uTime;
varying float vAlpha;
varying float vSeed;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, d);
  float twinkle = 0.6 + 0.4 * sin(uTime * 3.0 + vSeed * 50.0);
  gl_FragColor = vec4(uColor, vAlpha * soft * twinkle);
}
`

export function isSuccess(type, rightVal) {
  return type === 'inhale' ? rightVal <= 1 - SUCCESS_THRESHOLD : rightVal >= SUCCESS_THRESHOLD
}

// 0 -> 1 over MISS_RAMP_SECONDS after a miss; 0 when the target wasn't missed.
export function missFactor(missElapsed) {
  if (missElapsed == null) return 0
  const t = Math.min(missElapsed / MISS_RAMP_SECONDS, 1)
  return t * t * (3 - 2 * t)
}

// Apply a miss factor to one cube mesh's X/Y scale.
export function applyMissScale(mesh, f) {
  if (!mesh) return
  const s = 1 + (MISS_SCALE - 1) * f
  mesh.scale.x = s
  mesh.scale.y = s
}

// Pooled burst particles. Returns the <points> element to render, burst() to
// fire one target's burst, and tick() to advance time each frame.
export function useGateBurstB(emissiveColor) {
  const data = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const positionAttr = new THREE.BufferAttribute(new Float32Array(GATE_BURST_POOL * 3), 3).setUsage(THREE.DynamicDrawUsage)
    const velAttr = new THREE.BufferAttribute(new Float32Array(GATE_BURST_POOL * 3), 3).setUsage(THREE.DynamicDrawUsage)
    const spawnTimeAttr = new THREE.BufferAttribute(new Float32Array(GATE_BURST_POOL).fill(SPAWN_SENTINEL), 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(new Float32Array(GATE_BURST_POOL).fill(1), 1).setUsage(THREE.DynamicDrawUsage)
    const seeds = new Float32Array(GATE_BURST_POOL)
    for (let i = 0; i < GATE_BURST_POOL; i++) seeds[i] = Math.random()
    geometry.setAttribute('position', positionAttr)
    geometry.setAttribute('aVel', velAttr)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    return { geometry, positionAttr, velAttr, spawnTimeAttr, lifetimeAttr }
  }, [])

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize:  { value: GATE_BURST_SIZE },
      uColor: { value: new THREE.Color(emissiveColor) },
      uTime:  { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  }), [emissiveColor])

  const cursorRef = useRef(0)

  const burst = (type, z, now) => {
    const { positionAttr, velAttr, spawnTimeAttr, lifetimeAttr } = data
    const centers = CUBE_CENTERS[type]
    const maxAbsX = MAX_ABS_X[type]
    for (let k = 0; k < GATE_BURST_COUNT; k++) {
      const idx = cursorRef.current % GATE_BURST_POOL
      cursorRef.current += 1
      // Uniform point on a random face of one of the two cubes.
      const [cx, cy] = centers[k % 2]
      const p = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]
      p[Math.floor(Math.random() * 3)] = Math.random() < 0.5 ? -0.5 : 0.5
      const x = cx + p[0] * CUBE_SIZE
      positionAttr.array[idx * 3]     = x
      positionAttr.array[idx * 3 + 1] = cy + p[1] * CUBE_SIZE
      positionAttr.array[idx * 3 + 2] = z + p[2] * CUBE_SIZE
      velAttr.array[idx * 3]     = (x / maxAbsX) * THREE.MathUtils.randFloat(...GATE_BURST_SPEED)
      velAttr.array[idx * 3 + 1] = 0
      velAttr.array[idx * 3 + 2] = 0
      spawnTimeAttr.array[idx] = now
      lifetimeAttr.array[idx] = 1 + Math.random()
    }
    positionAttr.needsUpdate = true
    velAttr.needsUpdate = true
    spawnTimeAttr.needsUpdate = true
    lifetimeAttr.needsUpdate = true
  }

  // livePaletteRef (optional): follow the app-wide breath-cycle palette.
  const tick = (now, livePaletteRef) => {
    material.uniforms.uTime.value = now
    if (livePaletteRef && livePaletteRef.current) material.uniforms.uColor.value.copy(livePaletteRef.current.primary)
  }

  // Particles move in the shader, so skip frustum culling on stale bounds.
  const points = (
    <points geometry={data.geometry} frustumCulled={false}>
      <primitive object={material} attach="material" />
    </points>
  )

  return { points, burst, tick }
}
