import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HALO_RING_Z, RING_Y, BASE_RADIUS, BASE_TUBE, GATE_SCALE, computePhaseDurations } from './BackgroundRingsD'

// Three particle systems anchored to Shape D's ring rig:
// - Surface sparkle: points sampled on the (invisible) halo ring's surface,
//   structured after MorphC.jsx's own sparkle system but re-driven by the
//   app-paced breath cycle instead of the sliders, via `paceProgressRef`
//   (written every frame by BackgroundRingsD -- 0 at exhale rest, easing to
//   1 across inhale, back to 0 across exhale).
// - Inhale burst: emits continuously for the whole exhale->inhale transition
//   (breathPhaseRef/gatesEnabledRef), spawning from a tiny invisible ring 90%
//   smaller than the inhale ring and scaling each particle's position vector
//   outward -- since the emitter ring and the inhale ring are the same shape
//   just at different scales, this lands each particle exactly on the inhale
//   ring (and a little beyond) at the same angle it spawned at, with no
//   separate direction vector needed.
// - Inhale attract: emits only for the first quarter of the exhale phase
//   (the inhale->exhale return trip), spawning from the real inhale ring and
//   drifting slowly inward toward the origin via exponential decay.

const SPARKLE_PARTICLE_COUNT = 1000
const MAX_SPAWN_RATE = 440        // particles/sec
const MAX_SPAWN_PER_FRAME = 100
const SPAWN_SENTINEL = -1e4
const SPARKLE_ATTRACT_RATE = 2.5  // how quickly outward drift decays back toward the surface

const BURST_EMITTER_SCALE = GATE_SCALE.map((v) => v * 0.1)   // invisible emitter ring, 90% smaller than the inhale ring
const BURST_PARTICLE_COUNT = 300
const BURST_SPAWN_RATE = 150      // particles/sec while emitting
const BURST_MIN_RATE = 0.2        // 1/sec -- slower particles (~5s to arrive)
const BURST_MAX_RATE = 0.35       // 1/sec -- faster particles (~2.9s to arrive)
const BURST_LIFETIME_MIN = 8      // long enough for even the slowest particles to arrive (0.7*8=5.6s >= 5s) before fading
const BURST_LIFETIME_MAX = 10
const BURST_TRAVEL_MULT = 11.5    // 11.5x the 0.1-scale spawn position = ~1.15x the inhale ring

const ATTRACT_PARTICLE_COUNT = 600
const ATTRACT_SPAWN_RATE = 100    // particles/sec while emitting
const ATTRACT_RATE = 0.3          // exponential attraction toward the origin -- fairly slow
const ATTRACT_LIFETIME_MIN = 4
const ATTRACT_LIFETIME_MAX = 6

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

// Radial approach: grow the spawn position vector outward from the origin.
// The emitter ring and the real inhale ring are the same shape, just scaled,
// so scaling the spawn vector by up to uTravelMult moves the particle along
// the exact ray to the corresponding point on the inhale ring and a little
// beyond.
const BURST_VERTEX_SHADER = `
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

// Exponential decay toward the origin -- the closed-form solution to
// "position shrinks toward 0 at a rate proportional to its distance from 0"
// (dx/dt = -k*x -> x(t) = x0*exp(-k*t)), i.e. attraction to (0,0,0) at a
// fixed rate.
const ATTRACT_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSeed;
uniform float uTime;
uniform float uSize;
uniform float uAttractRate;
varying float vAlpha;
varying float vSeed;

void main() {
  float age = max(uTime - aSpawnTime, 0.0);
  float lifeT = clamp(age / aLifetime, 0.0, 1.0);
  float fadeIn = smoothstep(0.0, 0.15, lifeT);
  float fadeOut = 1.0 - smoothstep(0.7, 1.0, lifeT);
  float envelope = fadeIn * fadeOut;

  float scaleFactor = exp(-uAttractRate * age);
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

export default function RingParticlesD({ primaryColor, paceProgressRef, breathPhaseRef, gatesEnabledRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef }) {
  const spawnCursorRef = useRef(0)
  const spawnAccumulatorRef = useRef(0)

  const burstCursorRef = useRef(0)
  const burstAccumulatorRef = useRef(0)

  const prevAttractPhaseRef = useRef('inhale')
  const attractPhaseElapsedRef = useRef(Infinity)   // time since the last inhale->exhale transition
  const attractCursorRef = useRef(0)
  const attractAccumulatorRef = useRef(0)

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

  const burstAttrs = useMemo(() => {
    const positions = sampleTorusPositions(BURST_PARTICLE_COUNT, BURST_EMITTER_SCALE)
    const seeds = new Float32Array(BURST_PARTICLE_COUNT)
    const rates = new Float32Array(BURST_PARTICLE_COUNT)
    const spawnTimes = new Float32Array(BURST_PARTICLE_COUNT)
    const lifetimes = new Float32Array(BURST_PARTICLE_COUNT)
    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      seeds[i] = Math.random()
      rates[i] = THREE.MathUtils.lerp(BURST_MIN_RATE, BURST_MAX_RATE, Math.random())
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.setAttribute('aRate', new THREE.BufferAttribute(rates, 1))
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    return { geometry, spawnTimeAttr, lifetimeAttr }
  }, [])

  const burstMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 100 },
      uColor: { value: new THREE.Color(primaryColor) },
      uTime: { value: 0 },
      uTravelMult: { value: BURST_TRAVEL_MULT },
    },
    vertexShader: BURST_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  }), [primaryColor])

  const attractAttrs = useMemo(() => {
    const positions = sampleTorusPositions(ATTRACT_PARTICLE_COUNT)
    const seeds = new Float32Array(ATTRACT_PARTICLE_COUNT)
    const spawnTimes = new Float32Array(ATTRACT_PARTICLE_COUNT)
    const lifetimes = new Float32Array(ATTRACT_PARTICLE_COUNT)
    for (let i = 0; i < ATTRACT_PARTICLE_COUNT; i++) {
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

  const attractMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 100 },
      uColor: { value: new THREE.Color(primaryColor) },
      uTime: { value: 0 },
      uAttractRate: { value: ATTRACT_RATE },
    },
    vertexShader: ATTRACT_VERTEX_SHADER,
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

    // Shared phase read for the burst and attract systems below.
    const active = gatesEnabledRef?.current ?? false
    const phase = active ? (breathPhaseRef?.current ?? 'exhale') : 'exhale'

    // Inhale burst: spawns continuously for the whole exhale->inhale
    // transition, independent of the sparkle system's bp-driven rate.
    if (phase === 'inhale') {
      burstAccumulatorRef.current += BURST_SPAWN_RATE * delta
      let toSpawnBurst = Math.floor(burstAccumulatorRef.current)
      if (toSpawnBurst > 0) {
        burstAccumulatorRef.current -= toSpawnBurst
        toSpawnBurst = Math.min(toSpawnBurst, MAX_SPAWN_PER_FRAME)
        const { spawnTimeAttr, lifetimeAttr } = burstAttrs
        for (let k = 0; k < toSpawnBurst; k++) {
          const idx = burstCursorRef.current % BURST_PARTICLE_COUNT
          burstCursorRef.current += 1
          spawnTimeAttr.array[idx] = now
          lifetimeAttr.array[idx] = THREE.MathUtils.lerp(BURST_LIFETIME_MIN, BURST_LIFETIME_MAX, Math.random())
        }
        spawnTimeAttr.needsUpdate = true
        lifetimeAttr.needsUpdate = true
      }
    }
    burstMaterial.uniforms.uTime.value = now

    // Inhale attract: spawns only for the first quarter of the exhale phase
    // (the inhale->exhale return trip), then drifts inward on its own.
    if (phase === 'exhale' && prevAttractPhaseRef.current === 'inhale') {
      attractPhaseElapsedRef.current = 0
    }
    prevAttractPhaseRef.current = phase
    attractPhaseElapsedRef.current += delta

    const { exhaleDuration } = computePhaseDurations(spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef)
    if (phase === 'exhale' && attractPhaseElapsedRef.current < exhaleDuration * 0.25) {
      attractAccumulatorRef.current += ATTRACT_SPAWN_RATE * delta
      let toSpawnAttract = Math.floor(attractAccumulatorRef.current)
      if (toSpawnAttract > 0) {
        attractAccumulatorRef.current -= toSpawnAttract
        toSpawnAttract = Math.min(toSpawnAttract, MAX_SPAWN_PER_FRAME)
        const { spawnTimeAttr, lifetimeAttr } = attractAttrs
        for (let k = 0; k < toSpawnAttract; k++) {
          const idx = attractCursorRef.current % ATTRACT_PARTICLE_COUNT
          attractCursorRef.current += 1
          spawnTimeAttr.array[idx] = now
          lifetimeAttr.array[idx] = THREE.MathUtils.lerp(ATTRACT_LIFETIME_MIN, ATTRACT_LIFETIME_MAX, Math.random())
        }
        spawnTimeAttr.needsUpdate = true
        lifetimeAttr.needsUpdate = true
      }
    }
    attractMaterial.uniforms.uTime.value = now
  })

  return (
    <group>
      <points geometry={sparkleAttrs.geometry}>
        <primitive object={sparkleMaterial} attach="material" />
      </points>
      <points geometry={burstAttrs.geometry}>
        <primitive object={burstMaterial} attach="material" />
      </points>
      <points geometry={attractAttrs.geometry}>
        <primitive object={attractMaterial} attach="material" />
      </points>
    </group>
  )
}
