import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HALO_RING_Z, RING_Y, BASE_RADIUS, BASE_TUBE, GATE_SCALE, EXHALE_SCALE } from './BackgroundRingsD'

// Three particle systems anchored to Shape D's ring rig, all sharing one
// pace-driven color (textColor at exhale rest, easing to secondaryColor at
// full inhale, and back):
// - Surface sparkle: points sampled on the (invisible) halo ring's surface,
//   structured after MorphC.jsx's own sparkle system but re-driven by the
//   app-paced breath cycle instead of the sliders, via `paceProgressRef`
//   (written every frame by BackgroundRingsD -- 0 at exhale rest, easing to
//   1 across inhale, back to 0 across exhale).
// - Inflow: spawns on the real exhale ring for the first second of the
//   exhale->inhale phase and travels inward onto the real inhale ring.
// - Outflow: spawns on the real inhale ring for the first second of the
//   inhale->exhale phase and travels outward onto the real exhale ring --
//   the mirror image of Inflow. Moving outward (rather than decaying toward
//   the origin) keeps the ring's interior clear/sharp.
// Inflow and Outflow both exploit the fact that EXHALE_SCALE is a uniform
// RING_RATIO-times scale-up of GATE_SCALE on every axis (both rings share
// the same center), so scaling a spawn position vector by a scalar moves it
// exactly along the ray to the corresponding point on the other ring.

const SPARKLE_PARTICLE_COUNT = 1000
const MAX_SPAWN_RATE = 440        // particles/sec
const MAX_SPAWN_PER_FRAME = 100
const SPAWN_SENTINEL = -1e4
const SPARKLE_ATTRACT_RATE = 2.5  // how quickly outward drift decays back toward the surface

const RING_RATIO = EXHALE_SCALE[0] / GATE_SCALE[0]   // exhale ring is this many times the inhale ring's size (uniform across axes)

const INFLOW_PARTICLE_COUNT = 300
const INFLOW_SPAWN_RATE = 300     // particles/sec while emitting
const INFLOW_WINDOW = 1.0         // seconds: only spawns for the first second of the exhale->inhale phase
const INFLOW_LIFETIME_MIN = 1.0
const INFLOW_LIFETIME_MAX = 1.5
const INFLOW_ARRIVAL_FRACTION = 0.65   // reaches the inhale ring at 65% of its own lifetime, ahead of the 70% fade-out
const INFLOW_TRAVEL_MULT = 1 / RING_RATIO   // shrink from the exhale ring down to the inhale ring

const OUTFLOW_PARTICLE_COUNT = 300
const OUTFLOW_SPAWN_RATE = 300    // particles/sec while emitting
const OUTFLOW_WINDOW = 1.0        // seconds: only spawns for the first second of the inhale->exhale phase
const OUTFLOW_LIFETIME_MIN = 1.0
const OUTFLOW_LIFETIME_MAX = 1.5
const OUTFLOW_ARRIVAL_FRACTION = 0.65
const OUTFLOW_TRAVEL_MULT = RING_RATIO      // grow from the inhale ring out to the exhale ring

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

// Radial approach: grow/shrink the spawn position vector along its own ray
// from the origin. Since the exhale ring and inhale ring are the same shape
// just at different (uniform) scales sharing the same center, scaling the
// spawn vector by uTravelMult moves the particle exactly onto the
// corresponding point on the other ring. Shared by both Inflow (shrinking,
// uTravelMult < 1) and Outflow (growing, uTravelMult > 1).
const TRAVEL_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSeed;
attribute float aRate;
uniform float uTime;
uniform float uSize;
uniform float uTravelMult;
varying float vAlpha;
varying float vSeed;

void main() {
  float age = max(uTime - aSpawnTime, 0.0);
  float lifeT = clamp(age / aLifetime, 0.0, 1.0);
  float fadeIn = smoothstep(0.0, 0.15, lifeT);
  float fadeOut = 1.0 - smoothstep(0.7, 1.0, lifeT);
  float envelope = fadeIn * fadeOut;

  float approach = clamp(age * aRate, 0.0, 1.0);
  float scaleFactor = mix(1.0, uTravelMult, approach);
  vec3 displaced = position * scaleFactor;

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

function sampleTorusPositions(count, scale = GATE_SCALE) {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * Math.PI * 2
    const r = BASE_RADIUS + BASE_TUBE * Math.cos(phi)
    positions[i * 3]     = r * Math.cos(theta) * scale[0]
    positions[i * 3 + 1] = r * Math.sin(theta) * scale[1] + RING_Y
    positions[i * 3 + 2] = BASE_TUBE * Math.sin(phi) * scale[2] + HALO_RING_Z
  }
  return positions
}

export default function RingParticlesD({ textColor, secondaryColor, paceProgressRef, breathPhaseRef, gatesEnabledRef }) {
  const spawnCursorRef = useRef(0)
  const spawnAccumulatorRef = useRef(0)

  const inflowCursorRef = useRef(0)
  const inflowAccumulatorRef = useRef(0)

  const outflowCursorRef = useRef(0)
  const outflowAccumulatorRef = useRef(0)

  const prevPhaseRef = useRef('exhale')
  const phaseElapsedRef = useRef(Infinity)   // time since the pace phase last flipped

  const scratchColorRef = useRef(new THREE.Color())

  const colorTextC = useMemo(() => new THREE.Color(textColor), [textColor])
  const colorSecondaryC = useMemo(() => new THREE.Color(secondaryColor), [secondaryColor])

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

  const sparkleMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 100 },
      uColor: { value: new THREE.Color(textColor) },
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
  }), [])

  const inflowAttrs = useMemo(() => {
    const positions = sampleTorusPositions(INFLOW_PARTICLE_COUNT, EXHALE_SCALE)
    const seeds = new Float32Array(INFLOW_PARTICLE_COUNT)
    const rates = new Float32Array(INFLOW_PARTICLE_COUNT)
    const spawnTimes = new Float32Array(INFLOW_PARTICLE_COUNT)
    const lifetimes = new Float32Array(INFLOW_PARTICLE_COUNT)
    for (let i = 0; i < INFLOW_PARTICLE_COUNT; i++) {
      seeds[i] = Math.random()
      rates[i] = 1
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const rateAttr = new THREE.BufferAttribute(rates, 1).setUsage(THREE.DynamicDrawUsage)
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aRate', rateAttr)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    return { geometry, rateAttr, spawnTimeAttr, lifetimeAttr }
  }, [])

  const inflowMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 100 },
      uColor: { value: new THREE.Color(textColor) },
      uTime: { value: 0 },
      uTravelMult: { value: INFLOW_TRAVEL_MULT },
    },
    vertexShader: TRAVEL_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  }), [])

  const outflowAttrs = useMemo(() => {
    const positions = sampleTorusPositions(OUTFLOW_PARTICLE_COUNT)
    const seeds = new Float32Array(OUTFLOW_PARTICLE_COUNT)
    const rates = new Float32Array(OUTFLOW_PARTICLE_COUNT)
    const spawnTimes = new Float32Array(OUTFLOW_PARTICLE_COUNT)
    const lifetimes = new Float32Array(OUTFLOW_PARTICLE_COUNT)
    for (let i = 0; i < OUTFLOW_PARTICLE_COUNT; i++) {
      seeds[i] = Math.random()
      rates[i] = 1
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const rateAttr = new THREE.BufferAttribute(rates, 1).setUsage(THREE.DynamicDrawUsage)
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aRate', rateAttr)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    return { geometry, rateAttr, spawnTimeAttr, lifetimeAttr }
  }, [])

  const outflowMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 100 },
      uColor: { value: new THREE.Color(textColor) },
      uTime: { value: 0 },
      uTravelMult: { value: OUTFLOW_TRAVEL_MULT },
    },
    vertexShader: TRAVEL_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame((state, delta) => {
    const bp = paceProgressRef?.current ?? 0
    const now = state.clock.elapsedTime

    const color = scratchColorRef.current.copy(colorTextC).lerp(colorSecondaryC, bp)
    sparkleMaterial.uniforms.uColor.value.copy(color)
    inflowMaterial.uniforms.uColor.value.copy(color)
    outflowMaterial.uniforms.uColor.value.copy(color)

    // Ring sparkle rate mirrors MorphC's System 1, with (1-bp) standing in
    // for rv -- dies out only as the cycle settles back to exhale rest.
    const spawnRampProgress = THREE.MathUtils.smoothstep(1 - bp, 0.75, 1.0)
    const spawnRate = THREE.MathUtils.lerp(MAX_SPAWN_RATE, 0, spawnRampProgress)

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

    // Shared phase read + fixed-window timer for Inflow/Outflow below.
    const active = gatesEnabledRef?.current ?? false
    const phase = active ? (breathPhaseRef?.current ?? 'exhale') : 'exhale'

    if (phase !== prevPhaseRef.current) {
      prevPhaseRef.current = phase
      phaseElapsedRef.current = 0
    } else {
      phaseElapsedRef.current += delta
    }

    // Inflow: spawns on the exhale ring for the first second of the
    // exhale->inhale phase, converging onto the inhale ring.
    if (phase === 'inhale' && phaseElapsedRef.current < INFLOW_WINDOW) {
      inflowAccumulatorRef.current += INFLOW_SPAWN_RATE * delta
      let toSpawnInflow = Math.floor(inflowAccumulatorRef.current)
      if (toSpawnInflow > 0) {
        inflowAccumulatorRef.current -= toSpawnInflow
        toSpawnInflow = Math.min(toSpawnInflow, MAX_SPAWN_PER_FRAME)
        const { rateAttr, spawnTimeAttr, lifetimeAttr } = inflowAttrs
        for (let k = 0; k < toSpawnInflow; k++) {
          const idx = inflowCursorRef.current % INFLOW_PARTICLE_COUNT
          inflowCursorRef.current += 1
          const lifetime = THREE.MathUtils.lerp(INFLOW_LIFETIME_MIN, INFLOW_LIFETIME_MAX, Math.random())
          spawnTimeAttr.array[idx] = now
          lifetimeAttr.array[idx] = lifetime
          rateAttr.array[idx] = 1 / (lifetime * INFLOW_ARRIVAL_FRACTION)
        }
        rateAttr.needsUpdate = true
        spawnTimeAttr.needsUpdate = true
        lifetimeAttr.needsUpdate = true
      }
    }
    inflowMaterial.uniforms.uTime.value = now

    // Outflow: spawns on the inhale ring for the first second of the
    // inhale->exhale phase, expanding outward onto the exhale ring.
    if (phase === 'exhale' && phaseElapsedRef.current < OUTFLOW_WINDOW) {
      outflowAccumulatorRef.current += OUTFLOW_SPAWN_RATE * delta
      let toSpawnOutflow = Math.floor(outflowAccumulatorRef.current)
      if (toSpawnOutflow > 0) {
        outflowAccumulatorRef.current -= toSpawnOutflow
        toSpawnOutflow = Math.min(toSpawnOutflow, MAX_SPAWN_PER_FRAME)
        const { rateAttr, spawnTimeAttr, lifetimeAttr } = outflowAttrs
        for (let k = 0; k < toSpawnOutflow; k++) {
          const idx = outflowCursorRef.current % OUTFLOW_PARTICLE_COUNT
          outflowCursorRef.current += 1
          const lifetime = THREE.MathUtils.lerp(OUTFLOW_LIFETIME_MIN, OUTFLOW_LIFETIME_MAX, Math.random())
          spawnTimeAttr.array[idx] = now
          lifetimeAttr.array[idx] = lifetime
          rateAttr.array[idx] = 1 / (lifetime * OUTFLOW_ARRIVAL_FRACTION)
        }
        rateAttr.needsUpdate = true
        spawnTimeAttr.needsUpdate = true
        lifetimeAttr.needsUpdate = true
      }
    }
    outflowMaterial.uniforms.uTime.value = now
  })

  return (
    <group>
      <points geometry={sparkleAttrs.geometry}>
        <primitive object={sparkleMaterial} attach="material" />
      </points>
      <points geometry={inflowAttrs.geometry}>
        <primitive object={inflowMaterial} attach="material" />
      </points>
      <points geometry={outflowAttrs.geometry}>
        <primitive object={outflowMaterial} attach="material" />
      </points>
    </group>
  )
}
