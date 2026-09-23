import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { BASE_RADIUS, BASE_TUBE, GATE_SCALE } from './BackgroundRingsD'

const PARTICLE_COUNT = 1500       // system 1: static surface sparkle, no velocity
const PARTICLE_COUNT_2 = 700      // system 2: blown-away / sucked-in, XZ velocity only
const SPHERE_RADIUS = 0.5
const MAX_SPAWN_RATE = 300        // particles/sec, shared by both systems
const SPREAD_2 = 0.9              // max XZ travel distance for system 2
const MAX_SPAWN_PER_FRAME = 150   // safety cap against huge dt spikes (e.g. tab refocus)
const SPAWN_SENTINEL = -1e4
const DIRECTION_DEADBAND = 1e-5   // ignore sub-pixel lv jitter when deciding flow direction
const OPTION_D_EXHALE_X_SCALE = 3     // Option D only: replaces the shared 4 at full exhale
const OPTION_D_EXHALE_Y_SCALE = 0.25  // Option D only: replaces the shared 0.4 at full exhale
const OPTION_D_EXHALE_Z_SCALE = 0.25  // Option D only: replaces the shared 0.2 at full exhale
const OPTION_D_INHALE_X_SCALE = 2     // Option D only: replaces the shared 2.25 at full inhale
const OPTION_D_INHALE_Y_SCALE = 3     // Option D only: replaces the shared 3.5 at full inhale
const OPTION_D_INHALE_Z_SCALE = 2     // Option D only: replaces the shared 1.5 at full inhale

// Breath-count rings: groups of 5 breaths, one ring fades in and locks per
// completed Inhale, all 5 fall away together on the 5th Exhale. "Breath" here
// means literal slider movement (leftRawRef), identical across every mode --
// not any mode's own phase clock.
const BREATH_RING_COUNT = 5
const BREATH_RING_Z = [-50, -40, -30, -20, -10]
const BREATH_FADE_START = 0.25       // fraction of slider travel where fade-in begins (0 alpha before this)
const BREATH_FADE_THRESHOLD = 0.90   // fraction of slider travel where alpha reaches full and the ring locks in
const BREATH_MAX_ALPHA = 0.5
// Same proportions as the pulse/hold ring in GatesBoxBreathingD.jsx (that
// file's PULSE_RING_TUBE/PULSE_RING_SCALE aren't exported, so the derivation
// is duplicated here from its exported inputs), tube tripled for visibility
// at these distances.
const BREATH_RING_TUBE = 0.015 * 3
const BREATH_RING_INNER_EDGE_FACTOR = (BASE_RADIUS - BASE_TUBE) / BASE_RADIUS
const BREATH_RING_SCALE = GATE_SCALE.map(v => v * BREATH_RING_INNER_EDGE_FACTOR)
const BREATH_REVERSAL_DEADBAND = 0.08  // matches the deadband used elsewhere (App.jsx, SlowingDownController)
const BREATH_FALL_STAGGER_S = 0.2
const BREATH_FALL_HOLD_S = 2.0       // seconds a ring keeps falling/rotating at full opacity before fading
const BREATH_FALL_FADE_S = 1.0       // fade duration after the hold
const BREATH_FALL_Y_SPEED = 0.6 * 1.5  // units/sec, straight down -- 50% faster
const BREATH_FALL_ROT_SPEED = 0.5    // max rad/sec per axis, randomized per ring per group
const BREATH_EMISSIVE_MULT = 10      // baseline emissive multiplier while fading in / persistent
const BREATH_EMISSIVE_FALL_TARGET = 1  // ramped down to this over the first second of the fall
const BREATH_EMISSIVE_FALL_RAMP_S = 1.0
const BREATH_FADE_IN_DURATION_S = 1.5  // time to fade a ring from 0 to full opacity, independent of slider speed
const BREATH_FADE_RATE = BREATH_MAX_ALPHA / BREATH_FADE_IN_DURATION_S  // alpha/sec, slew-rate limits opacity changes
// "Backlight" glow: rather than relying on transparent-object draw order
// (which didn't reliably show the rings through the Morph's own surface),
// each ring's position/intensity is fed into the Morph's own fragment
// shader as a fake point-light term added straight to its emissive, so it
// reads as light glowing through from behind regardless of depth/blend order.
const BREATH_GLOW_STRENGTH = 3.0     // multiplies each ring's opacity (0-0.5) into an emissive contribution
const BREATH_GLOW_FALLOFF = 0.15     // exponential distance falloff rate

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

const FLOW_VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSpeed;
attribute float aMode;
attribute float aStartOffset;
attribute float aSeed;
attribute float aSwoopSpeed;
uniform float uTime;
uniform float uSpread;
uniform float uSize;
uniform float uPullRate;
varying float vAlpha;
varying float vSeed;

void main() {
  float age = max(uTime - aSpawnTime, 0.0);
  float lifeT = clamp(age / aLifetime, 0.0, 1.0);
  float fadeIn = smoothstep(0.0, 0.15, lifeT);
  float fadeOut = 1.0 - smoothstep(0.7, 1.0, lifeT);
  float envelope = fadeIn * fadeOut;

  // X-only travel, replacing the old radial XZ motion -- the random aSpeed
  // range still applies, just along a single axis now. Some particles get a
  // speed near 0, so they barely drift in X and are mostly just drawn toward
  // the center line.
  float dirX = position.x >= 0.0 ? 1.0 : -1.0;
  float travel = aSpeed * age;
  float extraX = aMode > 0.0
    ? min(travel, uSpread)                  // blown away: grows outward from the surface
    : max(aStartOffset - travel, 0.0);       // sucked in: shrinks back toward the surface

  // Y and Z are slowly pulled toward the horizontal center line (Y=0, Z=0).
  // Exponential decay approaches but mathematically never crosses zero, so
  // particles can't overshoot past the center line.
  float pull = exp(-uPullRate * lifeT);

  // Particles spawned while sucked in (slider moving toward inhale) get a
  // small drift on top of the pull -- sign varies per particle, so some
  // rise and others dip as they swoop into the mesh as it grows tall,
  // instead of sliding flat into the center line.
  float swoopY = aMode < 0.0 ? aSwoopSpeed * age : 0.0;

  // Sucked-in particles are also slowly pulled in toward X=0 (in addition to
  // shrinking back to the surface via extraX), using the same exponential
  // decay as the Y/Z pull so they're drawn toward the mesh without
  // overshooting past its center.
  float xBase = position.x + dirX * extraX;
  float xFinal = aMode < 0.0 ? xBase * pull : xBase;

  vec3 displaced = vec3(
    xFinal,
    position.y * pull + swoopY,
    position.z * pull
  );

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

function sampleSpherePositions(count) {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Uniform distribution on a sphere surface (Archimedes method)
    const z = Math.random() * 2 - 1
    const theta = Math.acos(z)
    const phi = Math.random() * Math.PI * 2
    const sinTheta = Math.sin(theta)

    positions[i * 3]     = SPHERE_RADIUS * sinTheta * Math.cos(phi)
    positions[i * 3 + 1] = SPHERE_RADIUS * sinTheta * Math.sin(phi)
    positions[i * 3 + 2] = SPHERE_RADIUS * z
  }
  return positions
}

export default function MorphC({ leftVal, rightVal, palette, shapeOption, leftRawRef, breathCountingEnabledRef, breathCountSourceRef, livePaletteRef, onBreathPaletteCycle }) {
  const groupRef = useRef()
  const matRef = useRef()

  // System 1 (sparkle): cyclic pool index + fractional spawn-rate accumulator.
  const spawnCursorRef = useRef(0)
  const spawnAccumulatorRef = useRef(0)

  // System 2 (flow): its own cyclic pool index + accumulator.
  const flowCursorRef = useRef(0)
  const flowAccumulatorRef = useRef(0)

  // Tracks whether lv is currently trending toward exhale (1) or inhale (-1),
  // used only to decide which way newly-spawned flow particles travel.
  // (lv=0 is exhale, lv=1 is inhale -- opposite numeric convention from rv.)
  const prevLvRef = useRef(leftVal.current)
  const flowDirRef = useRef(1)

  // Breath-count rings state (see module-level BREATH_* constants above).
  const breathGroupRefs = useMemo(() => (
    Array.from({ length: BREATH_RING_COUNT }, () => ({ current: null }))
  ), [])
  const breathLockedCountRef = useRef(0)
  // Deadband rise/fall tracker (same pattern as SlowingDownController /
  // App.jsx's stroke counters) -- breathDirRef starts "falling" (-1) so the
  // very first upward movement confirms a fresh rise. breathArmedRef only
  // becomes true again once a confirmed rise-from-a-trough happens, which is
  // what makes each lock require its own distinct Inhale instead of letting
  // a single held-up slider cascade through all 5 rings at once.
  const breathDirRef = useRef(-1)
  const breathExtremeRef = useRef(0)
  const breathArmedRef = useRef(true)
  const breathFallTriggeredRef = useRef(false)
  const breathFallStartTimesRef = useRef(new Array(BREATH_RING_COUNT).fill(null))
  const breathFallSpinRef = useRef(new Array(BREATH_RING_COUNT).fill(null))
  // Set true when a group's fall-away triggers; consumed on the very next
  // confirmed rise (breath 1's inhale of the next cycle), which is when
  // onBreathPaletteCycle actually fires (App.jsx owns the lerp itself, since
  // it now drives the whole app's palette, not just MorphC's own colors).
  const paletteLerpPendingRef = useRef(false)
  const breathCountingWasEnabledRef = useRef(false)

  const breathMaterials = useMemo(() => (
    Array.from({ length: BREATH_RING_COUNT }, () => new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.primaryColor),
      emissive: new THREE.Color(palette.primaryColor),
      emissiveIntensity: BREATH_EMISSIVE_MULT,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [])

  const { material, fresnelUniforms } = useMemo(() => {
    const fresnelUniforms = {
      fresnelPower:     { value: 1.5 },
      fresnelIntensity: { value: 1.0 },
      dissolveProgress: { value: 0 },
      dissolveScale:    { value: 80.0 },
      dissolveEdge:     { value: 0.12 },
      uBreathGlowPos:       { value: Array.from({ length: BREATH_RING_COUNT }, () => new THREE.Vector3()) },
      uBreathGlowIntensity: { value: new Float32Array(BREATH_RING_COUNT) },
      uBreathGlowColor:     { value: new THREE.Color(palette.primaryColor) },
      uBreathGlowFalloff:   { value: BREATH_GLOW_FALLOFF },
    }

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.tertiaryColor),
      emissive: new THREE.Color(palette.primaryColor),
      emissiveIntensity: 2,
      roughness: 1,
      metalness: 0,
      transparent: true,
    })

    mat.customProgramCacheKey = () => `fresnel-morph-c-${palette.primaryColor}`

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, fresnelUniforms)

      // Pass view direction, local (unscaled) position, and world position
      // from vertex to fragment via custom varyings -- local position drives
      // the dissolve grain so dot size stays stable regardless of the mesh's
      // breathing scale; world position drives the breath-ring backlight glow.
      shader.vertexShader = 'varying vec3 vFresnelDir;\nvarying vec3 vDissolvePos;\nvarying vec3 vWorldPos;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vFresnelDir = normalize(-mvPosition.xyz);
        vDissolvePos = position;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      )

      // Inject uniforms + varying declaration, then add Fresnel to emissive
      shader.fragmentShader =
        `uniform float fresnelPower;
uniform float fresnelIntensity;
uniform float dissolveProgress;
uniform float dissolveScale;
uniform float dissolveEdge;
uniform vec3 uBreathGlowPos[${BREATH_RING_COUNT}];
uniform float uBreathGlowIntensity[${BREATH_RING_COUNT}];
uniform vec3 uBreathGlowColor;
uniform float uBreathGlowFalloff;
varying vec3 vFresnelDir;
varying vec3 vDissolvePos;
varying vec3 vWorldPos;

float dissolveHash(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}
\n` + shader.fragmentShader

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float fr = pow(1.0 - max(dot(normalize(vNormal), vFresnelDir), 0.0), fresnelPower);
          totalEmissiveRadiance *= (1.0 - fr * fresnelIntensity);
        }
        {
          // Breath-count rings "backlight" the Morph: faked as point-light-like
          // additions to emissive based on distance, independent of actual
          // transparent-object draw order/depth, so they read as glowing
          // through the surface rather than being hidden behind it.
          for (int i = 0; i < ${BREATH_RING_COUNT}; i++) {
            float bd = length(vWorldPos - uBreathGlowPos[i]);
            float bGlow = uBreathGlowIntensity[i] * exp(-bd * uBreathGlowFalloff);
            totalEmissiveRadiance += uBreathGlowColor * bGlow;
          }
        }`
      )

      // Dissolve: each lattice point owns a small soft circle (never a square
      // -- that's the only shape ever drawn). A fragment unions the circles
      // from its cell's nearby lattice neighbors (a cheap metaball blend), so
      // when neighbors are all intact their overlapping circles merge into a
      // seamless smooth surface with no cell-boundary edges; as cells dissolve
      // in noise order, the union shrinks down to isolated shrinking/fading
      // dots before disappearing entirely. Pure corner neighbors are skipped
      // to keep the loop cheap without leaving gaps (the remaining face/edge
      // neighbors already give full overlap at the chosen radius).
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        {
          vec3 dScaled = vDissolvePos * dissolveScale;
          vec3 dBaseCell = floor(dScaled);
          float dCoverage = 0.0;
          for (int ix = -1; ix <= 1; ix++) {
            for (int iy = -1; iy <= 1; iy++) {
              for (int iz = -1; iz <= 1; iz++) {
                if (abs(ix) + abs(iy) + abs(iz) > 2) continue;
                vec3 dNeighbor = dBaseCell + vec3(float(ix), float(iy), float(iz));
                float dNoise = dissolveHash(dNeighbor);
                float dProgress = smoothstep(dissolveProgress - dissolveEdge, dissolveProgress + dissolveEdge, dNoise);
                float dDist = length(dScaled - (dNeighbor + 0.5));
                float dFalloff = 1.0 - smoothstep(0.8, 1.3, dDist);
                dCoverage = max(dCoverage, dFalloff * dProgress);
              }
            }
          }
          gl_FragColor.a *= dCoverage;
        }`
      )
    }

    return { material: mat, fresnelUniforms }
  }, [palette.tertiaryColor, palette.primaryColor])

  const sparkleAttrs = useMemo(() => {
    const positions = sampleSpherePositions(PARTICLE_COUNT)
    const seeds = new Float32Array(PARTICLE_COUNT)
    const spawnTimes = new Float32Array(PARTICLE_COUNT)
    const lifetimes = new Float32Array(PARTICLE_COUNT)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
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
    // Unscaled anchor points on the unit sphere -- used only at spawn time to
    // compute where the mesh surface actually is (after applying the current
    // breathing scale). Never touched again after a particle spawns.
    const basePositions = sampleSpherePositions(PARTICLE_COUNT_2)
    const positions = basePositions.slice()
    const seeds = new Float32Array(PARTICLE_COUNT_2)
    const spawnTimes = new Float32Array(PARTICLE_COUNT_2)
    const lifetimes = new Float32Array(PARTICLE_COUNT_2)
    const speeds = new Float32Array(PARTICLE_COUNT_2)
    const modes = new Float32Array(PARTICLE_COUNT_2)
    const startOffsets = new Float32Array(PARTICLE_COUNT_2)
    const swoopSpeeds = new Float32Array(PARTICLE_COUNT_2)

    for (let i = 0; i < PARTICLE_COUNT_2; i++) {
      seeds[i] = Math.random()
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
      // Lerp down to 0 so some particles get ~no X velocity and just drift
      // toward the center line instead of spreading outward.
      speeds[i] = THREE.MathUtils.lerp(0, 0.65, Math.random())
      modes[i] = 1
      startOffsets[i] = 0
      swoopSpeeds[i] = 0
    }

    const geometry = new THREE.BufferGeometry()
    const positionAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', positionAttr)
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1))
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    const modeAttr = new THREE.BufferAttribute(modes, 1).setUsage(THREE.DynamicDrawUsage)
    const startOffsetAttr = new THREE.BufferAttribute(startOffsets, 1).setUsage(THREE.DynamicDrawUsage)
    const swoopSpeedAttr = new THREE.BufferAttribute(swoopSpeeds, 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    geometry.setAttribute('aMode', modeAttr)
    geometry.setAttribute('aStartOffset', startOffsetAttr)
    geometry.setAttribute('aSwoopSpeed', swoopSpeedAttr)

    return { geometry, positionAttr, spawnTimeAttr, lifetimeAttr, modeAttr, startOffsetAttr, swoopSpeedAttr, basePositions }
  }, [])

  const sparkleMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uSize:  { value: 120 },
        uColor: { value: new THREE.Color(palette.primaryColor) },
        uTime:  { value: 0 },
      },
      vertexShader: SPARKLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
  }, [palette.primaryColor])

  const flowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uSize:   { value: 120 },
        uColor:  { value: new THREE.Color(palette.primaryColor) },
        uTime:   { value: 0 },
        uSpread: { value: SPREAD_2 },
        uPullRate: { value: 1.2 },
      },
      vertexShader: FLOW_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
  }, [palette.primaryColor])

  useFrame((state, delta) => {
    if (!groupRef.current) return
    // Ease slider input in/out (default convention -- see CLAUDE.md) so
    // every value derived below moves smoothly rather than tracking the
    // thumb's raw position 1:1.
    const lv = THREE.MathUtils.smoothstep(leftVal.current, 0, 1)
    const rv = THREE.MathUtils.smoothstep(rightVal.current, 0, 1)

    const isD = shapeOption === 'd'
    const xScale = THREE.MathUtils.lerp(isD ? OPTION_D_EXHALE_X_SCALE : 4, isD ? OPTION_D_INHALE_X_SCALE : 2.25, lv)
    const zScale = THREE.MathUtils.lerp(isD ? OPTION_D_EXHALE_Z_SCALE : 0.2, isD ? OPTION_D_INHALE_Z_SCALE : 1.5, lv)
    const yScale = THREE.MathUtils.lerp(isD ? OPTION_D_INHALE_Y_SCALE : 3.5, isD ? OPTION_D_EXHALE_Y_SCALE : 0.4, rv)
    groupRef.current.scale.set(xScale, yScale, zScale)

    material.emissiveIntensity = THREE.MathUtils.lerp(1.5, 0, rv)
    material.roughness = THREE.MathUtils.lerp(0.3, 1, rv)
    fresnelUniforms.fresnelPower.value = THREE.MathUtils.lerp(0.0, 0.2, lv)

    // Mesh dissolves into grain across the entire slider travel -- solid and
    // smooth at full inhale (rv=0), fully gone at full exhale (rv=1) -- instead
    // of fading alpha uniformly. The dissolve uniform controls how much of the
    // surface has "burned away" into dots; material.opacity is a separate
    // overall alpha multiplied on top, ramping 0.75 (inhale) -> 0 (exhale).
    const fadeProgress = rv
    material.opacity = THREE.MathUtils.lerp(0.75, 0, rv)
    // Push the mapped range past the noise's [0,1) span by a safety margin so
    // every cell is fully solid at fadeProgress=0 (no holes at rest) and fully
    // gone at fadeProgress=1, instead of some cells already being mid-fade.
    const dissolveMargin = fresnelUniforms.dissolveEdge.value * 2
    fresnelUniforms.dissolveProgress.value = THREE.MathUtils.lerp(-dissolveMargin, 1 + dissolveMargin, fadeProgress)

    // Spawn rate holds steady through 75% of the way to exhale, then ramps to 0.
    const spawnRampProgress = THREE.MathUtils.smoothstep(rv, 0.75, 1.0)
    const spawnRate = THREE.MathUtils.lerp(MAX_SPAWN_RATE, 0, spawnRampProgress)

    // System 2 is fully controlled by the left slider, and ramps down to 0 at
    // BOTH ends: full rate only in the middle (lv 0.25 -> 0.5), ramping to 0
    // toward exhale (matches system 1's timing when both sliders move together)
    // and ramping to 0 toward inhale on the other side.
    const flowExhaleRamp = THREE.MathUtils.smoothstep(1 - lv, 0.75, 1.0)
    const flowInhaleRamp = THREE.MathUtils.smoothstep(lv, 0.5, 0.75)
    const flowRampProgress = Math.max(flowExhaleRamp, flowInhaleRamp)
    const flowSpawnRate = THREE.MathUtils.lerp(MAX_SPAWN_RATE, 0, flowRampProgress)

    const now = state.clock.elapsedTime

    // Track whether lv is currently trending toward exhale or inhale, for
    // newly-spawned flow particles -- held over when the slider is still.
    const dLv = lv - prevLvRef.current
    prevLvRef.current = lv
    if (Math.abs(dLv) > DIRECTION_DEADBAND) {
      flowDirRef.current = dLv < 0 ? 1 : -1
    }

    // System 1: static surface sparkle, no velocity.
    spawnAccumulatorRef.current += spawnRate * delta
    let toSpawn = Math.floor(spawnAccumulatorRef.current)
    if (toSpawn > 0) {
      spawnAccumulatorRef.current -= toSpawn
      toSpawn = Math.min(toSpawn, MAX_SPAWN_PER_FRAME)

      const { spawnTimeAttr, lifetimeAttr } = sparkleAttrs
      for (let k = 0; k < toSpawn; k++) {
        const idx = spawnCursorRef.current % PARTICLE_COUNT
        spawnCursorRef.current += 1
        spawnTimeAttr.array[idx] = now
        lifetimeAttr.array[idx] = 1 + Math.random()
      }
      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
    }
    sparkleMaterial.uniforms.uTime.value = now

    // System 2: blown-away (toward exhale) / sucked-in (toward inhale), XZ-only velocity.
    // Driven entirely by the left slider.
    flowAccumulatorRef.current += flowSpawnRate * delta
    let toSpawnFlow = Math.floor(flowAccumulatorRef.current)
    if (toSpawnFlow > 0) {
      flowAccumulatorRef.current -= toSpawnFlow
      toSpawnFlow = Math.min(toSpawnFlow, MAX_SPAWN_PER_FRAME)

      const { positionAttr, spawnTimeAttr, lifetimeAttr, modeAttr, startOffsetAttr, swoopSpeedAttr, basePositions } = flowAttrs
      const goingOut = flowDirRef.current > 0
      for (let k = 0; k < toSpawnFlow; k++) {
        const idx = flowCursorRef.current % PARTICLE_COUNT_2
        flowCursorRef.current += 1
        // Spawn exactly on the mesh surface as it currently appears, by
        // applying this frame's breathing scale to the base anchor. After
        // this, the particle's position is driven only by the shader's own
        // XZ velocity -- it never reads the scale again.
        positionAttr.array[idx * 3]     = basePositions[idx * 3] * xScale
        positionAttr.array[idx * 3 + 1] = basePositions[idx * 3 + 1] * yScale
        positionAttr.array[idx * 3 + 2] = basePositions[idx * 3 + 2] * zScale
        spawnTimeAttr.array[idx] = now
        lifetimeAttr.array[idx] = 1 + Math.random()
        modeAttr.array[idx] = goingOut ? 1 : -1
        startOffsetAttr.array[idx] = goingOut ? 0 : SPREAD_2 * (0.4 + Math.random() * 0.6)
        // Only particles spawned while moving toward inhale (sucked in) get
        // a swoop; blown-away particles get none. Sign is randomized so some
        // particles rise and others dip as they're drawn into the growing mesh.
        swoopSpeedAttr.array[idx] = goingOut ? 0 : (0.15 + Math.random() * 0.4) * (Math.random() < 0.5 ? -1 : 1)
      }
      positionAttr.needsUpdate = true
      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
      modeAttr.needsUpdate = true
      startOffsetAttr.needsUpdate = true
      swoopSpeedAttr.needsUpdate = true
    }
    flowMaterial.uniforms.uTime.value = now

    // Breath-count rings (see module-level BREATH_* constants).
    const countingEnabled = !!(breathCountingEnabledRef && breathCountingEnabledRef.current)
    // Count source: the left slider, or (Box Breathing / Slowing Down) a paced
    // 0 (exhale) -> 1 (inhale) progress ref chosen by App.jsx.
    const countSource = breathCountSourceRef && breathCountSourceRef.current
    const raw = countSource ? countSource.current : leftRawRef.current
    if (countingEnabled !== breathCountingWasEnabledRef.current) {
      // Counting just started (per-mode start point, see App.jsx) or stopped
      // (mode restart): clear to a clean cycle so counting begins at breath 1.
      breathFallTriggeredRef.current = false
      breathLockedCountRef.current = 0
      breathDirRef.current = -1
      breathExtremeRef.current = raw
      breathArmedRef.current = true
      paletteLerpPendingRef.current = false
      for (let i = 0; i < BREATH_RING_COUNT; i++) {
        breathFallStartTimesRef.current[i] = null
        breathFallSpinRef.current[i] = null
        const group = breathGroupRefs[i].current
        if (group) {
          group.position.y = 0
          group.rotation.set(0, 0, 0)
        }
        breathMaterials[i].opacity = 0
        breathMaterials[i].emissiveIntensity = BREATH_EMISSIVE_MULT
      }
    }
    breathCountingWasEnabledRef.current = countingEnabled
    if (countingEnabled) {

      if (!breathFallTriggeredRef.current) {
        // Deadband rise/fall tracker: only a confirmed reversal from a real
        // trough back to rising re-arms the next ring, so holding the
        // slider up (or wobbling near the threshold) can't lock more than
        // one ring per distinct Inhale.
        if (breathDirRef.current >= 0) {
          if (raw > breathExtremeRef.current) {
            breathExtremeRef.current = raw
          } else if (breathExtremeRef.current - raw > BREATH_REVERSAL_DEADBAND) {
            breathDirRef.current = -1
            breathExtremeRef.current = raw
          }
        } else {
          if (raw < breathExtremeRef.current) {
            breathExtremeRef.current = raw
          } else if (raw - breathExtremeRef.current > BREATH_REVERSAL_DEADBAND) {
            breathDirRef.current = 1
            breathExtremeRef.current = raw
            breathArmedRef.current = true
            if (paletteLerpPendingRef.current) {
              paletteLerpPendingRef.current = false
              if (onBreathPaletteCycle) onBreathPaletteCycle(now)
            }
          }
        }

        // Already-locked rings keep easing toward full opacity at a capped
        // rate too, in case a very fast Inhale locked one before its own
        // fade-in visually caught up.
        const maxDelta = BREATH_FADE_RATE * delta
        for (let i = 0; i < breathLockedCountRef.current; i++) {
          const cur = breathMaterials[i].opacity
          if (cur < BREATH_MAX_ALPHA) breathMaterials[i].opacity = Math.min(BREATH_MAX_ALPHA, cur + maxDelta)
        }

        if (breathLockedCountRef.current < BREATH_RING_COUNT) {
          if (breathArmedRef.current) {
            const activeIdx = breathLockedCountRef.current
            const progress = THREE.MathUtils.clamp((raw - BREATH_FADE_START) / (BREATH_FADE_THRESHOLD - BREATH_FADE_START), 0, 1)
            // Slew-rate limited toward the slider-driven target instead of
            // snapping straight to it, so a fast Inhale still reads as a
            // smooth fade in from 0 rather than an instant pop -- reversing
            // before locking still fades the ring back out, just at the same
            // capped rate rather than instantly.
            const target = BREATH_MAX_ALPHA * progress
            const cur = breathMaterials[activeIdx].opacity
            breathMaterials[activeIdx].opacity = target > cur
              ? Math.min(target, cur + maxDelta)
              : Math.max(target, cur - maxDelta)
            if (progress >= 1) {
              breathLockedCountRef.current += 1
              breathArmedRef.current = false
            }
          }
        } else if (breathDirRef.current === -1) {
          // All 5 locked, and the tracker above just confirmed the downward
          // reversal that starts breath 5's exhale -- trigger the fall-away.
          breathFallTriggeredRef.current = true
          const order = [0, 1, 2, 3, 4]
          for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[order[i], order[j]] = [order[j], order[i]]
          }
          order.forEach((ringIdx, orderPos) => {
            breathFallStartTimesRef.current[ringIdx] = now + orderPos * BREATH_FALL_STAGGER_S
            breathFallSpinRef.current[ringIdx] = {
              rx: THREE.MathUtils.randFloatSpread(BREATH_FALL_ROT_SPEED),
              ry: THREE.MathUtils.randFloatSpread(BREATH_FALL_ROT_SPEED),
              rz: THREE.MathUtils.randFloatSpread(BREATH_FALL_ROT_SPEED),
            }
          })

          // Palette lerp doesn't start yet -- queued for the next cycle's
          // breath 1 inhale (see the rise-confirmation branch above).
          paletteLerpPendingRef.current = true
        }
      } else {
        let allDone = true
        for (let i = 0; i < BREATH_RING_COUNT; i++) {
          const start = breathFallStartTimesRef.current[i]
          if (start === null || now < start) { allDone = false; continue }
          const t = now - start
          const group = breathGroupRefs[i].current
          const spin = breathFallSpinRef.current[i]
          if (group) {
            group.position.y = -BREATH_FALL_Y_SPEED * t
            group.rotation.set(spin.rx * t, spin.ry * t, spin.rz * t)
          }
          const fadeT = THREE.MathUtils.clamp((t - BREATH_FALL_HOLD_S) / BREATH_FALL_FADE_S, 0, 1)
          breathMaterials[i].opacity = BREATH_MAX_ALPHA * (1 - fadeT)
          const emissiveT = THREE.MathUtils.clamp(t / BREATH_EMISSIVE_FALL_RAMP_S, 0, 1)
          breathMaterials[i].emissiveIntensity = THREE.MathUtils.lerp(BREATH_EMISSIVE_MULT, BREATH_EMISSIVE_FALL_TARGET, emissiveT)
          if (fadeT < 1) allDone = false
        }
        if (allDone) {
          breathFallTriggeredRef.current = false
          breathLockedCountRef.current = 0
          breathDirRef.current = -1
          breathExtremeRef.current = raw
          breathArmedRef.current = true
          for (let i = 0; i < BREATH_RING_COUNT; i++) {
            breathFallStartTimesRef.current[i] = null
            breathFallSpinRef.current[i] = null
            const group = breathGroupRefs[i].current
            if (group) {
              group.position.y = 0
              group.rotation.set(0, 0, 0)
            }
            breathMaterials[i].opacity = 0
            breathMaterials[i].emissiveIntensity = BREATH_EMISSIVE_MULT
          }
        }
      }
    }

    // Sync from the shared live palette (App.jsx owns the actual lerp, since
    // it now drives the whole app's palette, not just MorphC's own colors) --
    // cheap in-place copies every frame, no branching needed.
    if (livePaletteRef && livePaletteRef.current) {
      const live = livePaletteRef.current
      material.color.copy(live.tertiary)
      material.emissive.copy(live.primary)
      sparkleMaterial.uniforms.uColor.value.copy(live.primary)
      flowMaterial.uniforms.uColor.value.copy(live.primary)
      fresnelUniforms.uBreathGlowColor.value.copy(live.primary)
      breathMaterials.forEach((m) => {
        m.color.copy(live.primary)
        m.emissive.copy(live.primary)
      })
    }

    // Feed each breath ring's current world position/opacity into the
    // Morph's backlight-glow uniforms (see BREATH_GLOW_* constants and the
    // onBeforeCompile injection above).
    {
      const groupOffsetY = shapeOption === 'd' ? 0 : 0.25
      const glowPos = fresnelUniforms.uBreathGlowPos.value
      const glowIntensity = fresnelUniforms.uBreathGlowIntensity.value
      for (let i = 0; i < BREATH_RING_COUNT; i++) {
        const group = breathGroupRefs[i].current
        const fallY = group ? group.position.y : 0
        glowPos[i].set(0, groupOffsetY + fallY, BREATH_RING_Z[i])
        // Scale by the ring's own emissive ratio too, so the backlight glow
        // dims in step with its visible emissive during the fall-away.
        const emissiveRatio = breathMaterials[i].emissiveIntensity / BREATH_EMISSIVE_MULT
        glowIntensity[i] = breathMaterials[i].opacity * BREATH_GLOW_STRENGTH * emissiveRatio
      }
    }
  })

  return (
    <group position={shapeOption === 'd' ? [0, 0, 0] : [0, 0.25, 0]}>
      <group ref={groupRef}>
        <mesh ref={matRef}>
          <sphereGeometry args={[SPHERE_RADIUS, 32, 16]} />
          <primitive object={material} attach="material" />
        </mesh>
        <points geometry={sparkleAttrs.geometry}>
          <primitive object={sparkleMaterial} attach="material" />
        </points>
      </group>
      {/* System 2 sits outside the scaled group so its particles' travel is
          never stretched/squished by the morph's breathing scale animation. */}
      <points geometry={flowAttrs.geometry}>
        <primitive object={flowMaterial} attach="material" />
      </points>
      {/* Breath-count rings -- also outside the scaled group so they don't
          inherit the sphere's breathing scale. */}
      {breathGroupRefs.map((ref, i) => (
        <group key={i} ref={(obj) => { ref.current = obj }} position={[0, 0, BREATH_RING_Z[i]]}>
          <mesh scale={BREATH_RING_SCALE}>
            <torusGeometry args={[BASE_RADIUS, BREATH_RING_TUBE, 16, 64]} />
            <primitive object={breathMaterials[i]} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  )
}
