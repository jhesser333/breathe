import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HALO_RING_Z, RING_Y, BASE_RADIUS, BASE_TUBE, GATE_SCALE, EXHALE_SCALE } from './BackgroundRingsD'

// Three particle systems anchored to Shape D's ring rig. Each particle is
// born with its own color, randomly blended between textColor and
// secondaryColor (aColorMix), fixed for its life -- not animated by the
// breath cycle.
// - Sparkle: points sampled on the (invisible) halo ring's surface, drifting
//   away from the ring and decaying back -- a slow-motion "popcorn"/"sun
//   ray" look, with most particles staying subtle and some popping out much
//   further. Spawn rate is driven by `paceProgressRef` (dies out near full
//   exhale rest). Its overall visibility also fades to 0 right as Outflow
//   begins emitting (as if everything is flying away), recovering as the
//   next Inflow burst begins.
// - Inflow: spawns on the real exhale ring for the first second of the
//   exhale->inhale phase and eases inward onto the real inhale ring, where
//   it stays (fading in place) for the rest of its life.
// - Outflow: spawns on the real inhale ring for the first second of the
//   inhale->exhale phase and keeps drifting outward at a constant rate,
//   sailing past the exhale ring's radius as it fades, rather than stopping
//   there.
// Inflow and Outflow both exploit the fact that EXHALE_SCALE is a uniform
// RING_RATIO-times scale-up of GATE_SCALE on every axis (both rings share
// the same center), so scaling a spawn position vector by a scalar moves it
// exactly along the ray to the corresponding point on the other ring.

const SPARKLE_PARTICLE_COUNT = 1000
const MAX_SPAWN_RATE = 440        // particles/sec
const MAX_SPAWN_PER_FRAME = 100
const SPAWN_SENTINEL = -1e4
const SPARKLE_ATTRACT_RATE = 1.1  // how quickly outward drift decays back toward the surface -- slow, floaty

const RING_RATIO = EXHALE_SCALE[0] / GATE_SCALE[0]   // exhale ring is this many times the inhale ring's size (uniform across axes)

const INFLOW_PARTICLE_COUNT = 300
const INFLOW_SPAWN_RATE = 70      // particles/sec while emitting
const INFLOW_WINDOW = 1.0         // seconds: only spawns for the first second of the exhale->inhale phase
const INFLOW_LIFETIME_MIN = 2.5
const INFLOW_LIFETIME_MAX = 4.0
const INFLOW_ARRIVAL_FRACTION = 0.65   // reaches the inhale ring at 65% of its own lifetime, ahead of the 70% fade-out
const INFLOW_TRAVEL_MULT = 1 / RING_RATIO   // shrink from the exhale ring down to the inhale ring

const OUTFLOW_PARTICLE_COUNT = 300
const OUTFLOW_SPAWN_RATE = 70     // particles/sec while emitting
const OUTFLOW_WINDOW = 1.0        // seconds: only spawns for the first second of the inhale->exhale phase
const OUTFLOW_LIFETIME_MIN = 2.5
const OUTFLOW_LIFETIME_MAX = 4.0
const OUTFLOW_ARRIVAL_FRACTION = 0.65   // reaches roughly the exhale ring's scale at 65% of life, then keeps drifting past it

const SPARKLE_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSeed;
attribute float aOutwardSpeed;
attribute float aColorMix;
uniform float uTime;
uniform float uSize;
uniform float uAttract;
uniform float uCenterY;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vAlpha;
varying float vSeed;
varying vec3 vColor;

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
  vColor = mix(uColorA, uColorB, aColorMix);
}
`

// Radial approach: grow the spawn position vector along its own ray from the
// origin, easing toward uTravelMult and holding there. Since the exhale ring
// and inhale ring are the same shape just at different (uniform) scales
// sharing the same center, scaling the spawn vector by uTravelMult moves the
// particle exactly onto the corresponding point on the other ring.
const TRAVEL_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSeed;
attribute float aRate;
attribute float aColorMix;
uniform float uTime;
uniform float uSize;
uniform float uTravelMult;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vAlpha;
varying float vSeed;
varying vec3 vColor;

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
  vColor = mix(uColorA, uColorB, aColorMix);
}
`

// Constant-velocity approach: grow the spawn position vector along its own
// ray from the origin at a fixed rate, unclamped -- the particle keeps
// moving outward at the speed it was born with for its whole life, sailing
// past uTravelMult's target radius instead of stopping there, and simply
// fades out (via the age/lifetime envelope) wherever it ends up.
const DRIFT_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSeed;
attribute float aSpeed;
attribute float aColorMix;
uniform float uTime;
uniform float uSize;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vAlpha;
varying float vSeed;
varying vec3 vColor;

void main() {
  float age = max(uTime - aSpawnTime, 0.0);
  float lifeT = clamp(age / aLifetime, 0.0, 1.0);
  float fadeIn = smoothstep(0.0, 0.15, lifeT);
  float fadeOut = 1.0 - smoothstep(0.7, 1.0, lifeT);
  float envelope = fadeIn * fadeOut;

  float scaleFactor = 1.0 + aSpeed * age;
  vec3 displaced = position * scaleFactor;

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_PointSize = uSize * (1.0 + aSeed) * envelope / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;

  vAlpha = envelope;
  vSeed = aSeed;
  vColor = mix(uColorA, uColorB, aColorMix);
}
`

const PARTICLE_FRAGMENT_SHADER = `
uniform float uTime;
uniform float uGlobalFade;
varying float vAlpha;
varying float vSeed;
varying vec3 vColor;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, d);
  float twinkle = 0.6 + 0.4 * sin(uTime * 3.0 + vSeed * 50.0);
  gl_FragColor = vec4(vColor, vAlpha * soft * twinkle * uGlobalFade);
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

  const colorTextC = useMemo(() => new THREE.Color(textColor), [textColor])
  const colorSecondaryC = useMemo(() => new THREE.Color(secondaryColor), [secondaryColor])

  const sparkleAttrs = useMemo(() => {
    const positions = sampleTorusPositions(SPARKLE_PARTICLE_COUNT)
    const seeds = new Float32Array(SPARKLE_PARTICLE_COUNT)
    const spawnTimes = new Float32Array(SPARKLE_PARTICLE_COUNT)
    const lifetimes = new Float32Array(SPARKLE_PARTICLE_COUNT)
    const outwardSpeeds = new Float32Array(SPARKLE_PARTICLE_COUNT)
    const colorMixes = new Float32Array(SPARKLE_PARTICLE_COUNT)
    for (let i = 0; i < SPARKLE_PARTICLE_COUNT; i++) {
      seeds[i] = Math.random()
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
      outwardSpeeds[i] = 0
      colorMixes[i] = Math.random()
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const outwardSpeedAttr = new THREE.BufferAttribute(outwardSpeeds, 1).setUsage(THREE.DynamicDrawUsage)
    const colorMixAttr = new THREE.BufferAttribute(colorMixes, 1).setUsage(THREE.DynamicDrawUsage)
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aOutwardSpeed', outwardSpeedAttr)
    geometry.setAttribute('aColorMix', colorMixAttr)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    return { geometry, outwardSpeedAttr, colorMixAttr, spawnTimeAttr, lifetimeAttr }
  }, [])

  const sparkleMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 100 },
      uColorA: { value: new THREE.Color(textColor) },
      uColorB: { value: new THREE.Color(secondaryColor) },
      uTime: { value: 0 },
      uAttract: { value: SPARKLE_ATTRACT_RATE },
      uCenterY: { value: RING_Y },
      uGlobalFade: { value: 1 },
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
    const colorMixes = new Float32Array(INFLOW_PARTICLE_COUNT)
    for (let i = 0; i < INFLOW_PARTICLE_COUNT; i++) {
      seeds[i] = Math.random()
      rates[i] = 1
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
      colorMixes[i] = Math.random()
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const rateAttr = new THREE.BufferAttribute(rates, 1).setUsage(THREE.DynamicDrawUsage)
    const colorMixAttr = new THREE.BufferAttribute(colorMixes, 1).setUsage(THREE.DynamicDrawUsage)
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aRate', rateAttr)
    geometry.setAttribute('aColorMix', colorMixAttr)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    return { geometry, rateAttr, colorMixAttr, spawnTimeAttr, lifetimeAttr }
  }, [])

  const inflowMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 100 },
      uColorA: { value: new THREE.Color(textColor) },
      uColorB: { value: new THREE.Color(secondaryColor) },
      uTime: { value: 0 },
      uTravelMult: { value: INFLOW_TRAVEL_MULT },
      uGlobalFade: { value: 1 },
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
    const speeds = new Float32Array(OUTFLOW_PARTICLE_COUNT)
    const spawnTimes = new Float32Array(OUTFLOW_PARTICLE_COUNT)
    const lifetimes = new Float32Array(OUTFLOW_PARTICLE_COUNT)
    const colorMixes = new Float32Array(OUTFLOW_PARTICLE_COUNT)
    for (let i = 0; i < OUTFLOW_PARTICLE_COUNT; i++) {
      seeds[i] = Math.random()
      speeds[i] = 0
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
      colorMixes[i] = Math.random()
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const speedAttr = new THREE.BufferAttribute(speeds, 1).setUsage(THREE.DynamicDrawUsage)
    const colorMixAttr = new THREE.BufferAttribute(colorMixes, 1).setUsage(THREE.DynamicDrawUsage)
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aSpeed', speedAttr)
    geometry.setAttribute('aColorMix', colorMixAttr)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    return { geometry, speedAttr, colorMixAttr, spawnTimeAttr, lifetimeAttr }
  }, [])

  const outflowMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 100 },
      uColorA: { value: new THREE.Color(textColor) },
      uColorB: { value: new THREE.Color(secondaryColor) },
      uTime: { value: 0 },
      uGlobalFade: { value: 1 },
    },
    vertexShader: DRIFT_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  }), [])

  useFrame((state, delta) => {
    const bp = paceProgressRef?.current ?? 0
    const now = state.clock.elapsedTime

    // Live palette colors (cheap in-place copy, no allocation).
    sparkleMaterial.uniforms.uColorA.value.copy(colorTextC)
    sparkleMaterial.uniforms.uColorB.value.copy(colorSecondaryC)
    inflowMaterial.uniforms.uColorA.value.copy(colorTextC)
    inflowMaterial.uniforms.uColorB.value.copy(colorSecondaryC)
    outflowMaterial.uniforms.uColorA.value.copy(colorTextC)
    outflowMaterial.uniforms.uColorB.value.copy(colorSecondaryC)

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
      const { outwardSpeedAttr, colorMixAttr, spawnTimeAttr, lifetimeAttr } = sparkleAttrs
      for (let k = 0; k < toSpawn; k++) {
        const idx = spawnCursorRef.current % SPARKLE_PARTICLE_COUNT
        spawnCursorRef.current += 1
        spawnTimeAttr.array[idx] = now
        lifetimeAttr.array[idx] = THREE.MathUtils.lerp(1.5, 3.0, Math.random())
        // Biased toward small values with an occasional large outlier --
        // most sparkles stay subtle, a few pop out much further.
        outwardSpeedAttr.array[idx] = THREE.MathUtils.lerp(0.12, 1.3, Math.random() ** 2.2)
        colorMixAttr.array[idx] = Math.random()
      }
      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
      outwardSpeedAttr.needsUpdate = true
      colorMixAttr.needsUpdate = true
    }
    sparkleMaterial.uniforms.uTime.value = now

    // Shared phase read + fixed-window timer for Inflow/Outflow below, also
    // used to gate Sparkle's global fade.
    const active = gatesEnabledRef?.current ?? false
    const phase = active ? (breathPhaseRef?.current ?? 'exhale') : 'exhale'

    if (phase !== prevPhaseRef.current) {
      prevPhaseRef.current = phase
      phaseElapsedRef.current = 0
    } else {
      phaseElapsedRef.current += delta
    }

    // Sparkle fades to invisible right as Outflow begins emitting (as if
    // everything is flying away), and back in as the next Inflow burst
    // begins -- spawning itself is untouched, only visibility.
    const globalFade = phase === 'exhale'
      ? 1 - THREE.MathUtils.smoothstep(phaseElapsedRef.current, 0, OUTFLOW_WINDOW)
      : THREE.MathUtils.smoothstep(phaseElapsedRef.current, 0, INFLOW_WINDOW)
    sparkleMaterial.uniforms.uGlobalFade.value = globalFade

    // Inflow: spawns on the exhale ring for the first second of the
    // exhale->inhale phase, converging onto the inhale ring.
    if (phase === 'inhale' && phaseElapsedRef.current < INFLOW_WINDOW) {
      inflowAccumulatorRef.current += INFLOW_SPAWN_RATE * delta
      let toSpawnInflow = Math.floor(inflowAccumulatorRef.current)
      if (toSpawnInflow > 0) {
        inflowAccumulatorRef.current -= toSpawnInflow
        toSpawnInflow = Math.min(toSpawnInflow, MAX_SPAWN_PER_FRAME)
        const { rateAttr, colorMixAttr, spawnTimeAttr, lifetimeAttr } = inflowAttrs
        for (let k = 0; k < toSpawnInflow; k++) {
          const idx = inflowCursorRef.current % INFLOW_PARTICLE_COUNT
          inflowCursorRef.current += 1
          const lifetime = THREE.MathUtils.lerp(INFLOW_LIFETIME_MIN, INFLOW_LIFETIME_MAX, Math.random())
          spawnTimeAttr.array[idx] = now
          lifetimeAttr.array[idx] = lifetime
          rateAttr.array[idx] = 1 / (lifetime * INFLOW_ARRIVAL_FRACTION)
          colorMixAttr.array[idx] = Math.random()
        }
        rateAttr.needsUpdate = true
        colorMixAttr.needsUpdate = true
        spawnTimeAttr.needsUpdate = true
        lifetimeAttr.needsUpdate = true
      }
    }
    inflowMaterial.uniforms.uTime.value = now

    // Outflow: spawns on the inhale ring for the first second of the
    // inhale->exhale phase, drifting outward past the exhale ring as it
    // fades, maintaining the velocity it was born with.
    if (phase === 'exhale' && phaseElapsedRef.current < OUTFLOW_WINDOW) {
      outflowAccumulatorRef.current += OUTFLOW_SPAWN_RATE * delta
      let toSpawnOutflow = Math.floor(outflowAccumulatorRef.current)
      if (toSpawnOutflow > 0) {
        outflowAccumulatorRef.current -= toSpawnOutflow
        toSpawnOutflow = Math.min(toSpawnOutflow, MAX_SPAWN_PER_FRAME)
        const { speedAttr, colorMixAttr, spawnTimeAttr, lifetimeAttr } = outflowAttrs
        for (let k = 0; k < toSpawnOutflow; k++) {
          const idx = outflowCursorRef.current % OUTFLOW_PARTICLE_COUNT
          outflowCursorRef.current += 1
          const lifetime = THREE.MathUtils.lerp(OUTFLOW_LIFETIME_MIN, OUTFLOW_LIFETIME_MAX, Math.random())
          spawnTimeAttr.array[idx] = now
          lifetimeAttr.array[idx] = lifetime
          speedAttr.array[idx] = (RING_RATIO - 1) / (lifetime * OUTFLOW_ARRIVAL_FRACTION)
          colorMixAttr.array[idx] = Math.random()
        }
        speedAttr.needsUpdate = true
        colorMixAttr.needsUpdate = true
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
