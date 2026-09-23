import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HALO_RING_Z, RING_Y, BASE_RADIUS, BASE_TUBE, GATE_SCALE, EXHALE_SCALE } from './BackgroundRingsD'

// Three particle systems anchored to Shape D's ring rig. Each particle is
// born with its own color, fixed for its life -- not animated by the breath
// cycle. Inflow/Outflow are randomly blended between textColor and
// secondaryColor (aColorMix, a live-uniform blend). Sparkle instead bakes an
// actual RGB into a per-particle aColor attribute at spawn time (see below),
// since its two source colors change with the box breath phase and a
// live-uniform blend would retroactively recolor already-alive particles.
// - Sparkle: points sampled on the (invisible) halo ring's surface, drifting
//   away from the ring and decaying back -- a slow-motion "popcorn"/"sun
//   ray" look, with most particles staying subtle and some popping out much
//   further. Spawn rate is driven by `paceProgressRef` (dies out near full
//   exhale rest); each particle simply fades per its own age-based envelope,
//   with no additional global fade layered on top. Birth color: outside Box
//   Breathing, a random blend of textColor/secondaryColor (unchanged). In Box Breathing, a
//   random blend of textColor/primaryColor during Inhale+Hold-in, switching
//   to secondaryColor/tertiaryColor during Exhale+Hold-out -- baked in at
//   spawn so particles born under one regime keep their color for their
//   whole life even after the phase flips underneath them.
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

const SPARKLE_PARTICLE_COUNT = 1500   // 1.5x, matching the raised spawn rate so particles aren't recycled before their lifetime ends
const MAX_SPAWN_RATE = 330        // particles/sec -- 1.5x the previous 220
const MAX_SPAWN_PER_FRAME = 100
const SPAWN_SENTINEL = -1e4
// Quarter of the original 1.1, paired with the equally-scaled outward-speed
// range below (peak travel distance is speed/(attract*e) -- scaling both by
// the same factor keeps that peak distance the same while stretching out the
// time to reach it, reading as slower/calmer without traveling less far).
const SPARKLE_ATTRACT_RATE = 0.275
const NO_ATTRACT_CUTOFF = 1e6     // sentinel uAttractCutoff value meaning "no cutoff, decay normally" -- far beyond any real uTime
const SPARKLE_RATE_RAMP_UP_FRACTION = 0.8    // reaches max spawn rate at 80% of the way to full inhale
const SPARKLE_RATE_RAMP_DOWN_MIDPOINT = 0.5  // spawn rate reaches 0 halfway through the inhale->exhale return trip

const SHOW_INFLOW_OUTFLOW = false   // temporarily hidden so Sparkle + the inhale ring can be tuned in isolation -- flip back to true when done

const RING_RATIO = EXHALE_SCALE[0] / GATE_SCALE[0]   // exhale ring is this many times the inhale ring's size (uniform across axes)

const INFLOW_PARTICLE_COUNT = 300
const INFLOW_SPAWN_RATE = 70      // particles/sec while emitting
const INFLOW_WINDOW = 1.0         // seconds: only spawns for the first second of the exhale->inhale phase
const INFLOW_LIFETIME_MIN = 2.5
const INFLOW_LIFETIME_MAX = 4.0
const INFLOW_ARRIVAL_FRACTION = 0.65   // reaches the inhale ring at 65% of its own lifetime, ahead of the 70% fade-out
const INFLOW_TRAVEL_MULT = 1 / RING_RATIO   // shrink from the exhale ring down to the inhale ring

const OUTFLOW_PARTICLE_COUNT = 900
const OUTFLOW_SPAWN_RATE = 140    // particles/sec while emitting
const OUTFLOW_WINDOW = 1.5        // seconds: only spawns for the first 1.5s of the inhale->exhale phase
const OUTFLOW_LIFETIME_MIN = 2.5
const OUTFLOW_LIFETIME_MAX = 4.0
const OUTFLOW_ARRIVAL_FRACTION = 0.65   // reaches roughly the exhale ring's scale at 65% of life, then keeps drifting past it

const SPARKLE_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSeed;
attribute float aOutwardSpeed;
attribute vec3 aColor;
uniform float uTime;
uniform float uSize;
uniform float uAttract;
uniform float uAttractCutoff;
uniform float uCenterY;
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
  // freezeAge locks the decay term's age at uAttractCutoff (Box Breathing's
  // Hold-in -> Exhale flip) instead of letting it keep decaying -- matches
  // the normal formula exactly up to the cutoff (no jump), then holds the
  // decay factor constant while age keeps growing outside it, so the
  // particle keeps drifting outward instead of curling back in. Outside Box
  // Breathing uAttractCutoff stays at NO_ATTRACT_CUTOFF, so this clamps to
  // age and is identical to the old formula.
  float freezeAge = clamp(uAttractCutoff - aSpawnTime, 0.0, age);
  float outward = aOutwardSpeed * age * exp(-uAttract * freezeAge);

  vec3 displaced = vec3(position.xy + dirXY * outward, position.z);

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  gl_PointSize = uSize * (1.0 + aSeed) * envelope / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;

  vAlpha = envelope;
  vSeed = aSeed;
  vColor = aColor;
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

export default function RingParticlesD({ textColor, secondaryColor, tertiaryColor, primaryColor, paceProgressRef, breathPhaseRef, gatesEnabledRef, isBoxBreathing, boxPhaseRef, boxProgressRef, livePaletteRef, paceArtFadeRef }) {
  const spawnCursorRef = useRef(0)
  const spawnAccumulatorRef = useRef(0)

  const inflowCursorRef = useRef(0)
  const inflowAccumulatorRef = useRef(0)

  const outflowCursorRef = useRef(0)
  const outflowAccumulatorRef = useRef(0)

  const prevPhaseRef = useRef('exhale')
  const phaseElapsedRef = useRef(Infinity)   // time since the pace phase last flipped
  const attractCutoffTimeRef = useRef(NO_ATTRACT_CUTOFF)   // Box Breathing only: uTime of the last Hold-in -> Exhale flip, else NO_ATTRACT_CUTOFF

  const colorTextC = useMemo(() => new THREE.Color(textColor), [textColor])
  const colorSecondaryC = useMemo(() => new THREE.Color(secondaryColor), [secondaryColor])
  const colorTertiaryC = useMemo(() => new THREE.Color(tertiaryColor), [tertiaryColor])
  const colorPrimaryC = useMemo(() => new THREE.Color(primaryColor), [primaryColor])
  const birthColorScratchRef = useRef(new THREE.Color())   // reused per spawned Sparkle particle to avoid allocation

  const sparkleAttrs = useMemo(() => {
    const positions = sampleTorusPositions(SPARKLE_PARTICLE_COUNT)
    const seeds = new Float32Array(SPARKLE_PARTICLE_COUNT)
    const spawnTimes = new Float32Array(SPARKLE_PARTICLE_COUNT)
    const lifetimes = new Float32Array(SPARKLE_PARTICLE_COUNT)
    const outwardSpeeds = new Float32Array(SPARKLE_PARTICLE_COUNT)
    const colors = new Float32Array(SPARKLE_PARTICLE_COUNT * 3)
    for (let i = 0; i < SPARKLE_PARTICLE_COUNT; i++) {
      seeds[i] = Math.random()
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
      outwardSpeeds[i] = 0
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const outwardSpeedAttr = new THREE.BufferAttribute(outwardSpeeds, 1).setUsage(THREE.DynamicDrawUsage)
    const colorAttr = new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage)
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aOutwardSpeed', outwardSpeedAttr)
    geometry.setAttribute('aColor', colorAttr)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    return { geometry, outwardSpeedAttr, colorAttr, spawnTimeAttr, lifetimeAttr }
  }, [])

  const sparkleMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: 100 },
      uTime: { value: 0 },
      uAttract: { value: SPARKLE_ATTRACT_RATE },
      uAttractCutoff: { value: NO_ATTRACT_CUTOFF },
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
    const now = state.clock.elapsedTime

    // Pull in the app-wide breath-count palette cycle (see App.jsx), if any --
    // cheap in-place copy, no allocation.
    if (livePaletteRef && livePaletteRef.current) {
      const live = livePaletteRef.current
      colorTextC.copy(live.text)
      colorSecondaryC.copy(live.secondary)
      colorTertiaryC.copy(live.tertiary)
      colorPrimaryC.copy(live.primary)
    }

    // Live palette colors (cheap in-place copy, no allocation). Sparkle's own
    // birth-color source colors are chosen per-particle at spawn time below
    // instead (see the spawn loop), since they depend on the live box phase
    // and must stay fixed once baked in -- these uniforms remain for
    // Inflow/Outflow only.
    inflowMaterial.uniforms.uColorA.value.copy(colorTextC)
    inflowMaterial.uniforms.uColorB.value.copy(colorSecondaryC)
    outflowMaterial.uniforms.uColorA.value.copy(colorTextC)
    outflowMaterial.uniforms.uColorB.value.copy(colorSecondaryC)

    // Shared phase read, used below by the sparkle rate ramp and by the
    // fixed-window timer for Inflow/Outflow/Sparkle's global fade.
    const active = gatesEnabledRef?.current ?? false
    // Startup fade-in of the paced art (written by GatesBoxBreathingD /
    // SlowingDownPaceRingsD); 1 when no driver writes it.
    const artFade = paceArtFadeRef ? paceArtFadeRef.current : 1
    sparkleMaterial.uniforms.uGlobalFade.value = artFade
    inflowMaterial.uniforms.uGlobalFade.value = artFade
    outflowMaterial.uniforms.uGlobalFade.value = artFade
    // Box Breathing has its own clean phase/progress signal (written by
    // GatesBoxBreathingD from a ground-truth 4-phase clock) instead of
    // breathPhaseRef/paceProgressRef, whose Box-mode convention is inverted
    // for BackgroundA and carries a startup artifact.
    const phase = isBoxBreathing ? (boxPhaseRef?.current ?? 'exhale') : (active ? (breathPhaseRef?.current ?? 'exhale') : 'exhale')
    const bp = isBoxBreathing ? (boxProgressRef?.current ?? 0) : (paceProgressRef?.current ?? 0)

    // Ring sparkle rate: ramps 0 -> max as the cycle moves from exhale to
    // inhale, reaching max at SPARKLE_RATE_RAMP_UP_FRACTION of the way to
    // full inhale and holding there; ramps max -> 0 on the way back,
    // reaching 0 at SPARKLE_RATE_RAMP_DOWN_MIDPOINT of that return trip and
    // holding at 0 for the rest of exhale. Both branches agree at bp=1 (the
    // phase boundary), so there's no jump when the phase flips.
    let spawnRate
    if (phase === 'inhale') {
      const rampT = THREE.MathUtils.clamp(bp / SPARKLE_RATE_RAMP_UP_FRACTION, 0, 1)
      spawnRate = THREE.MathUtils.lerp(0, MAX_SPAWN_RATE, rampT)
    } else if (isBoxBreathing) {
      // Experiment: Box Breathing pops spawning straight to 0 the instant
      // Hold-in ends, instead of the smooth ramp-down used elsewhere.
      spawnRate = 0
    } else {
      const rampT = THREE.MathUtils.clamp((bp - SPARKLE_RATE_RAMP_DOWN_MIDPOINT) / (1 - SPARKLE_RATE_RAMP_DOWN_MIDPOINT), 0, 1)
      spawnRate = THREE.MathUtils.lerp(0, MAX_SPAWN_RATE, rampT)
    }

    // Ring sparkle: surface points with a rise-then-decay outward drift.
    spawnAccumulatorRef.current += spawnRate * delta
    let toSpawn = Math.floor(spawnAccumulatorRef.current)
    if (toSpawn > 0) {
      spawnAccumulatorRef.current -= toSpawn
      toSpawn = Math.min(toSpawn, MAX_SPAWN_PER_FRAME)
      const { outwardSpeedAttr, colorAttr, spawnTimeAttr, lifetimeAttr } = sparkleAttrs
      // Birth-color source pair: always primary/tertiary, in every mode and
      // phase. Baked into aColor per-particle below (not a live uniform
      // blend) so a particle keeps the color it was born with.
      const birthColorA = colorPrimaryC
      const birthColorB = colorTertiaryC
      const birthColor = birthColorScratchRef.current
      for (let k = 0; k < toSpawn; k++) {
        const idx = spawnCursorRef.current % SPARKLE_PARTICLE_COUNT
        spawnCursorRef.current += 1
        spawnTimeAttr.array[idx] = now
        lifetimeAttr.array[idx] = THREE.MathUtils.lerp(2.25, 4.5, Math.random())   // 1.5x the original 1.5/3.0 range
        // Biased toward small values with an occasional large outlier --
        // most sparkles stay subtle, a few pop out much further. Scaled down
        // from the original 0.12/1.3 in lockstep with SPARKLE_ATTRACT_RATE
        // (see its comment).
        outwardSpeedAttr.array[idx] = THREE.MathUtils.lerp(0.03, 0.325, Math.random() ** 2.2)
        birthColor.copy(birthColorA).lerp(birthColorB, Math.random())
        colorAttr.array[idx * 3] = birthColor.r
        colorAttr.array[idx * 3 + 1] = birthColor.g
        colorAttr.array[idx * 3 + 2] = birthColor.b
      }
      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
      outwardSpeedAttr.needsUpdate = true
      colorAttr.needsUpdate = true
    }
    sparkleMaterial.uniforms.uTime.value = now
    sparkleMaterial.uniforms.uAttractCutoff.value = attractCutoffTimeRef.current

    // Fixed-window timer for Inflow/Outflow below, also used to gate
    // Sparkle's global fade.
    if (phase !== prevPhaseRef.current) {
      prevPhaseRef.current = phase
      phaseElapsedRef.current = 0
      // Experiment: Box Breathing freezes Sparkle's inward pull the instant
      // Hold-in ends (see SPARKLE_VERTEX_SHADER's freezeAge), so already-alive
      // particles keep drifting outward instead of curling back. Reset on the
      // next inhale so fresh spawns decay normally again.
      if (isBoxBreathing) {
        attractCutoffTimeRef.current = phase === 'exhale' ? now : NO_ATTRACT_CUTOFF
      }
    } else {
      phaseElapsedRef.current += delta
    }

    // Experiment: no longer applying an extra global fade-out as Outflow
    // begins (or fade-in as Inflow begins) -- uGlobalFade stays at its
    // default 1, so Sparkle particles alive at the Hold-in -> Exhale
    // transition now just die off on their own per-particle age envelope
    // instead of also being dimmed by this additional multiplier.

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
      {/* renderOrder 2: draws on top of the PaceRingsD rings (renderOrder 1) */}
      <points geometry={sparkleAttrs.geometry} renderOrder={2}>
        <primitive object={sparkleMaterial} attach="material" />
      </points>
      {SHOW_INFLOW_OUTFLOW && (
        <points geometry={inflowAttrs.geometry}>
          <primitive object={inflowMaterial} attach="material" />
        </points>
      )}
      {SHOW_INFLOW_OUTFLOW && (
        <points geometry={outflowAttrs.geometry}>
          <primitive object={outflowMaterial} attach="material" />
        </points>
      )}
    </group>
  )
}
