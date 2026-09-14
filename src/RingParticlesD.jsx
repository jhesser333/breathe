import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EXHALE_RING_Z, RING_Y, BASE_RADIUS, BASE_TUBE, GATE_SCALE } from './BackgroundRingsD'

// Two particle systems anchored to Shape D's exhale ring, structured after
// MorphC.jsx's own two particle systems (static surface sparkle + travelling
// flow) but re-driven by the app-paced breath cycle instead of the sliders,
// via `paceProgressRef` (written every frame by BackgroundRingsD -- 0 at
// exhale rest, easing to 1 across inhale, back to 0 across exhale). The flow
// system travels along Y (top/bottom of screen) instead of X (left/right),
// since the ring itself doesn't breathe/scale the way the Morph does.

const SPARKLE_PARTICLE_COUNT = 500
const FLOW_PARTICLE_COUNT = 350
const MAX_SPAWN_RATE = 220        // particles/sec, shared by both systems
const MAX_SPAWN_PER_FRAME = 100
const SPAWN_SENTINEL = -1e4
const DIRECTION_DEADBAND = 1e-5
const EDGE_MARGIN = 1.1           // safety margin beyond the computed screen edge

// Ring's own outer extent (approximate outer radius along each axis), used
// both as the flow system's "surface" anchor and the sparkle system's sample
// surface -- see BackgroundRingsD.jsx for BASE_RADIUS/BASE_TUBE/GATE_SCALE.
const RING_OUTER_X = (BASE_RADIUS + BASE_TUBE) * GATE_SCALE[0]
const RING_OUTER_Y = (BASE_RADIUS + BASE_TUBE) * GATE_SCALE[1]

const SPARKLE_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSeed;
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

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (1.0 + aSeed) * envelope / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;

  vAlpha = envelope;
  vSeed = aSeed;
}
`

// Y-only travel (top/bottom of screen), simplified from MorphC's flow shader:
// no X/Z pull or swoop since the ring never moves, so a particle's X/Z stay
// fixed at whatever was chosen at spawn time.
const FLOW_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSpeed;
attribute float aMode;
attribute float aStartOffset;
attribute float aSeed;
uniform float uTime;
uniform float uSpread;
uniform float uSize;
varying float vAlpha;
varying float vSeed;

void main() {
  float age = max(uTime - aSpawnTime, 0.0);
  float lifeT = clamp(age / aLifetime, 0.0, 1.0);
  float fadeIn = smoothstep(0.0, 0.15, lifeT);
  float fadeOut = 1.0 - smoothstep(0.7, 1.0, lifeT);
  float envelope = fadeIn * fadeOut;

  float dirY = position.y >= 0.0 ? 1.0 : -1.0;
  float travel = aSpeed * age;
  float extraY = aMode > 0.0
    ? min(travel, uSpread)                  // dispersing: grows outward from the ring toward the screen edge
    : max(aStartOffset - travel, 0.0);       // gathering: shrinks back in toward the ring

  vec3 displaced = vec3(position.x, position.y + dirY * extraY, position.z);

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_PointSize = uSize * (1.0 + aSeed) * envelope / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;

  vAlpha = envelope;
  vSeed = aSeed;
}
`

const PARTICLE_FRAGMENT_SHADER = `
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

function sampleTorusPositions(count) {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * Math.PI * 2
    const r = BASE_RADIUS + BASE_TUBE * Math.cos(phi)
    positions[i * 3]     = r * Math.cos(theta) * GATE_SCALE[0]
    positions[i * 3 + 1] = r * Math.sin(theta) * GATE_SCALE[1] + RING_Y
    positions[i * 3 + 2] = BASE_TUBE * Math.sin(phi) * GATE_SCALE[2] + EXHALE_RING_Z
  }
  return positions
}

export default function RingParticlesD({ primaryColor, paceProgressRef }) {
  const spawnCursorRef = useRef(0)
  const spawnAccumulatorRef = useRef(0)
  const flowCursorRef = useRef(0)
  const flowAccumulatorRef = useRef(0)

  // Tracks whether bp (breath progress, 0=exhale/1=inhale) is currently
  // trending up (gathering, -1) or down (dispersing, +1) -- same convention
  // as MorphC's flowDirRef, just keyed off bp instead of dLv.
  const prevBpRef = useRef(0)
  const flowDirRef = useRef(-1)

  const sparkleAttrs = useMemo(() => {
    const positions = sampleTorusPositions(SPARKLE_PARTICLE_COUNT)
    const seeds = new Float32Array(SPARKLE_PARTICLE_COUNT)
    const spawnTimes = new Float32Array(SPARKLE_PARTICLE_COUNT)
    const lifetimes = new Float32Array(SPARKLE_PARTICLE_COUNT)
    for (let i = 0; i < SPARKLE_PARTICLE_COUNT; i++) {
      seeds[i] = Math.random()
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    return { geometry, spawnTimeAttr, lifetimeAttr }
  }, [])

  const flowAttrs = useMemo(() => {
    const positions = new Float32Array(FLOW_PARTICLE_COUNT * 3)
    const seeds = new Float32Array(FLOW_PARTICLE_COUNT)
    const spawnTimes = new Float32Array(FLOW_PARTICLE_COUNT)
    const lifetimes = new Float32Array(FLOW_PARTICLE_COUNT)
    const speeds = new Float32Array(FLOW_PARTICLE_COUNT)
    const modes = new Float32Array(FLOW_PARTICLE_COUNT)
    const startOffsets = new Float32Array(FLOW_PARTICLE_COUNT)
    for (let i = 0; i < FLOW_PARTICLE_COUNT; i++) {
      seeds[i] = Math.random()
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
      speeds[i] = 0
      modes[i] = 1
      startOffsets[i] = 0
      const side = i % 2 === 0 ? 1 : -1
      positions[i * 3] = 0
      positions[i * 3 + 1] = side * RING_OUTER_Y
      positions[i * 3 + 2] = EXHALE_RING_Z
    }
    const geometry = new THREE.BufferGeometry()
    const positionAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', positionAttr)
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    const speedAttr = new THREE.BufferAttribute(speeds, 1).setUsage(THREE.DynamicDrawUsage)
    const modeAttr = new THREE.BufferAttribute(modes, 1).setUsage(THREE.DynamicDrawUsage)
    const startOffsetAttr = new THREE.BufferAttribute(startOffsets, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    geometry.setAttribute('aSpeed', speedAttr)
    geometry.setAttribute('aMode', modeAttr)
    geometry.setAttribute('aStartOffset', startOffsetAttr)
    return { geometry, positionAttr, spawnTimeAttr, lifetimeAttr, speedAttr, modeAttr, startOffsetAttr }
  }, [])

  const sparkleMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 50 },
      uColor: { value: new THREE.Color(primaryColor) },
      uTime: { value: 0 },
    },
    vertexShader: SPARKLE_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  }), [primaryColor])

  const flowMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 50 },
      uColor: { value: new THREE.Color(primaryColor) },
      uTime: { value: 0 },
      uSpread: { value: 1 },
    },
    vertexShader: FLOW_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  }), [primaryColor])

  useFrame((state, delta) => {
    const bp = paceProgressRef?.current ?? 0
    const now = state.clock.elapsedTime

    // Ring sparkle rate mirrors MorphC's System 1, with (1-bp) standing in
    // for rv -- dies out only as the cycle settles back to exhale rest.
    const spawnRampProgress = THREE.MathUtils.smoothstep(1 - bp, 0.75, 1.0)
    const spawnRate = THREE.MathUtils.lerp(MAX_SPAWN_RATE, 0, spawnRampProgress)

    // Ring flow rate mirrors MorphC's System 2 dual ramp, with bp standing in for lv.
    const flowExhaleRamp = THREE.MathUtils.smoothstep(1 - bp, 0.75, 1.0)
    const flowInhaleRamp = THREE.MathUtils.smoothstep(bp, 0.5, 0.75)
    const flowRampProgress = Math.max(flowExhaleRamp, flowInhaleRamp)
    const flowSpawnRate = THREE.MathUtils.lerp(MAX_SPAWN_RATE, 0, flowRampProgress)

    // bp rising (toward inhale) -> newly-spawned flow particles gather in;
    // bp falling (toward exhale) -> they disperse back out.
    const dBp = bp - prevBpRef.current
    prevBpRef.current = bp
    if (Math.abs(dBp) > DIRECTION_DEADBAND) {
      flowDirRef.current = dBp > 0 ? -1 : 1
    }

    // Ring sparkle: static surface points, alpha-only.
    spawnAccumulatorRef.current += spawnRate * delta
    let toSpawn = Math.floor(spawnAccumulatorRef.current)
    if (toSpawn > 0) {
      spawnAccumulatorRef.current -= toSpawn
      toSpawn = Math.min(toSpawn, MAX_SPAWN_PER_FRAME)
      const { spawnTimeAttr, lifetimeAttr } = sparkleAttrs
      for (let k = 0; k < toSpawn; k++) {
        const idx = spawnCursorRef.current % SPARKLE_PARTICLE_COUNT
        spawnCursorRef.current += 1
        spawnTimeAttr.array[idx] = now
        lifetimeAttr.array[idx] = 1 + Math.random()
      }
      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
    }
    sparkleMaterial.uniforms.uTime.value = now

    // Visible half-height at the exhale ring's depth (approximate -- ignores
    // CameraVerticalShift's shift-lens crop, which is a fine simplification
    // for a decorative off-screen spawn point; EDGE_MARGIN keeps particles
    // comfortably outside the visible frame). Recomputed every frame so it
    // tracks window resizes.
    const camera = state.camera
    const depth = Math.max(0.1, camera.position.z - EXHALE_RING_Z)
    const halfFovRad = THREE.MathUtils.degToRad((camera.fov ?? 50) / 2)
    const edgeY = depth * Math.tan(halfFovRad) * EDGE_MARGIN
    const spreadDistance = Math.max(0.1, edgeY - RING_OUTER_Y)
    flowMaterial.uniforms.uSpread.value = spreadDistance

    // Ring flow: streams in from / returns to the top and bottom of the screen.
    flowAccumulatorRef.current += flowSpawnRate * delta
    let toSpawnFlow = Math.floor(flowAccumulatorRef.current)
    if (toSpawnFlow > 0) {
      flowAccumulatorRef.current -= toSpawnFlow
      toSpawnFlow = Math.min(toSpawnFlow, MAX_SPAWN_PER_FRAME)
      const { positionAttr, spawnTimeAttr, lifetimeAttr, speedAttr, modeAttr, startOffsetAttr } = flowAttrs
      const gathering = flowDirRef.current < 0
      for (let k = 0; k < toSpawnFlow; k++) {
        const idx = flowCursorRef.current % FLOW_PARTICLE_COUNT
        flowCursorRef.current += 1
        const side = Math.random() < 0.5 ? 1 : -1
        const lifetime = 1 + Math.random()
        positionAttr.array[idx * 3]     = (Math.random() * 2 - 1) * RING_OUTER_X
        positionAttr.array[idx * 3 + 1] = side * RING_OUTER_Y
        positionAttr.array[idx * 3 + 2] = EXHALE_RING_Z
        spawnTimeAttr.array[idx] = now
        lifetimeAttr.array[idx] = lifetime
        modeAttr.array[idx] = gathering ? -1 : 1
        startOffsetAttr.array[idx] = gathering ? spreadDistance * (0.85 + Math.random() * 0.15) : 0
        // Sized so travel completes right around fade-out's start (70% of life).
        speedAttr.array[idx] = spreadDistance / (0.7 * lifetime)
      }
      positionAttr.needsUpdate = true
      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
      modeAttr.needsUpdate = true
      startOffsetAttr.needsUpdate = true
      speedAttr.needsUpdate = true
    }
    flowMaterial.uniforms.uTime.value = now
  })

  return (
    <group>
      <points geometry={sparkleAttrs.geometry}>
        <primitive object={sparkleMaterial} attach="material" />
      </points>
      <points geometry={flowAttrs.geometry}>
        <primitive object={flowMaterial} attach="material" />
      </points>
    </group>
  )
}
