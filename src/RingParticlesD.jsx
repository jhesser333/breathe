import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HALO_RING_Z, RING_Y, BASE_RADIUS, BASE_TUBE, GATE_SCALE } from './BackgroundRingsD'

// Two particle systems anchored to Shape D's (invisible) halo ring,
// structured after MorphC.jsx's own two particle systems (surface sparkle +
// travelling flow) but re-driven by the app-paced breath cycle instead of
// the sliders, via `paceProgressRef` (written every frame by
// BackgroundRingsD -- 0 at exhale rest, easing to 1 across inhale, back to 0
// across exhale). The flow system travels along Y (top/bottom of screen)
// instead of X (left/right), converging on the ring's own center plane
// (RING_Y) so it reads as filling the ring rather than snapping to its edge.

const SPARKLE_PARTICLE_COUNT = 500
const FLOW_PARTICLE_COUNT = 350
const MAX_SPAWN_RATE = 220        // particles/sec, shared by both systems
const MAX_SPAWN_PER_FRAME = 100
const SPAWN_SENTINEL = -1e4
const DIRECTION_DEADBAND = 1e-5
const EDGE_MARGIN = 1.1           // safety margin beyond the computed screen edge
const FLOW_PULL_RATE = 3.0        // higher than MorphC's 1.2 so travel is ~done by fade-out (lifeT=0.7)
const SPARKLE_ATTRACT_RATE = 2.5  // how quickly outward drift decays back toward the surface

// Ring's own outer X extent, used to spread flow particles across the ring's
// width -- see BackgroundRingsD.jsx for BASE_RADIUS/BASE_TUBE/GATE_SCALE.
const RING_OUTER_X = (BASE_RADIUS + BASE_TUBE) * GATE_SCALE[0]

const SPARKLE_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSeed;
attribute float aOutwardSpeed;
uniform float uTime;
uniform float uSize;
uniform float uAttract;
uniform float uCenterY;
varying float vAlpha;
varying float vSeed;

void main() {
  float age = max(uTime - aSpawnTime, 0.0);
  float lifeT = clamp(age / aLifetime, 0.0, 1.0);
  float fadeIn = smoothstep(0.0, 0.15, lifeT);
  float fadeOut = 1.0 - smoothstep(0.7, 1.0, lifeT);
  float envelope = fadeIn * fadeOut;

  // Drift away from the ring's own center axis (0, uCenterY) in its own
  // plane, then get pulled back toward the surface as it ages -- a simple
  // rise-then-decay curve (age * exp(-rate*age)), not a spring simulation.
  // Z is never touched, so each particle keeps the Z it was born with.
  vec2 radial = vec2(position.x, position.y - uCenterY);
  float radialLen = length(radial);
  vec2 dirXY = radialLen > 0.0001 ? radial / radialLen : vec2(0.0);
  float outward = aOutwardSpeed * age * exp(-uAttract * age);

  vec3 displaced = vec3(position.xy + dirXY * outward, position.z);

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_PointSize = uSize * (1.0 + aSeed) * envelope / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;

  vAlpha = envelope;
  vSeed = aSeed;
}
`

// Y-only travel (top/bottom of screen), converging on uCenterY (the ring's
// own center plane) rather than its outer edge, so it reads as filling the
// ring rather than being pulled to a fixed line. X/Z stay fixed at whatever
// was chosen at spawn time -- the ring never moves, so there's nothing to
// track there.
const FLOW_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aMode;
attribute float aSeed;
uniform float uTime;
uniform float uPullRate;
uniform float uCenterY;
uniform float uSize;
varying float vAlpha;
varying float vSeed;

void main() {
  float age = max(uTime - aSpawnTime, 0.0);
  float lifeT = clamp(age / aLifetime, 0.0, 1.0);
  float fadeIn = smoothstep(0.0, 0.15, lifeT);
  float fadeOut = 1.0 - smoothstep(0.7, 1.0, lifeT);
  float envelope = fadeIn * fadeOut;

  // position.y is the FAR anchor (near the screen edge). Gathering particles
  // start there and decay toward uCenterY; dispersing particles start at
  // uCenterY and grow back out toward the far anchor.
  float pull = exp(-uPullRate * lifeT);
  float relY = position.y - uCenterY;
  float displacedY = uCenterY + (aMode < 0.0 ? relY * pull : relY * (1.0 - pull));

  vec3 displaced = vec3(position.x, displacedY, position.z);

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
    positions[i * 3 + 2] = BASE_TUBE * Math.sin(phi) * GATE_SCALE[2] + HALO_RING_Z
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
    const outwardSpeeds = new Float32Array(SPARKLE_PARTICLE_COUNT)
    for (let i = 0; i < SPARKLE_PARTICLE_COUNT; i++) {
      seeds[i] = Math.random()
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
      outwardSpeeds[i] = THREE.MathUtils.lerp(0.15, 0.5, Math.random())
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.setAttribute('aOutwardSpeed', new THREE.BufferAttribute(outwardSpeeds, 1))
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
    const modes = new Float32Array(FLOW_PARTICLE_COUNT)
    for (let i = 0; i < FLOW_PARTICLE_COUNT; i++) {
      seeds[i] = Math.random()
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
      modes[i] = 1
      const side = i % 2 === 0 ? 1 : -1
      positions[i * 3] = 0
      positions[i * 3 + 1] = RING_Y + side * 1
      positions[i * 3 + 2] = HALO_RING_Z
    }
    const geometry = new THREE.BufferGeometry()
    const positionAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', positionAttr)
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    const modeAttr = new THREE.BufferAttribute(modes, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    geometry.setAttribute('aMode', modeAttr)
    return { geometry, positionAttr, spawnTimeAttr, lifetimeAttr, modeAttr }
  }, [])

  const sparkleMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 50 },
      uColor: { value: new THREE.Color(primaryColor) },
      uTime: { value: 0 },
      uAttract: { value: SPARKLE_ATTRACT_RATE },
      uCenterY: { value: RING_Y },
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
      uPullRate: { value: FLOW_PULL_RATE },
      uCenterY: { value: RING_Y },
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

    // Ring sparkle: surface points with a rise-then-decay outward drift.
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

    // Visible half-height at the halo ring's depth (approximate -- ignores
    // CameraVerticalShift's shift-lens crop, which is a fine simplification
    // for a decorative off-screen spawn point; EDGE_MARGIN keeps particles
    // comfortably outside the visible frame). Recomputed every frame so it
    // tracks window resizes.
    const camera = state.camera
    const depth = Math.max(0.1, camera.position.z - HALO_RING_Z)
    const halfFovRad = THREE.MathUtils.degToRad((camera.fov ?? 50) / 2)
    const edgeY = depth * Math.tan(halfFovRad) * EDGE_MARGIN

    // Ring flow: streams in from / returns to the top and bottom of the
    // screen, converging on the ring's own center plane (uCenterY).
    flowAccumulatorRef.current += flowSpawnRate * delta
    let toSpawnFlow = Math.floor(flowAccumulatorRef.current)
    if (toSpawnFlow > 0) {
      flowAccumulatorRef.current -= toSpawnFlow
      toSpawnFlow = Math.min(toSpawnFlow, MAX_SPAWN_PER_FRAME)
      const { positionAttr, spawnTimeAttr, lifetimeAttr, modeAttr } = flowAttrs
      const gathering = flowDirRef.current < 0
      for (let k = 0; k < toSpawnFlow; k++) {
        const idx = flowCursorRef.current % FLOW_PARTICLE_COUNT
        flowCursorRef.current += 1
        const side = Math.random() < 0.5 ? 1 : -1
        positionAttr.array[idx * 3]     = (Math.random() * 2 - 1) * RING_OUTER_X
        positionAttr.array[idx * 3 + 1] = RING_Y + side * edgeY
        positionAttr.array[idx * 3 + 2] = HALO_RING_Z
        spawnTimeAttr.array[idx] = now
        lifetimeAttr.array[idx] = 1 + Math.random()
        modeAttr.array[idx] = gathering ? -1 : 1
      }
      positionAttr.needsUpdate = true
      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
      modeAttr.needsUpdate = true
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
