import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const PARTICLE_COUNT = 1500       // system 1: static surface sparkle, no velocity
const PARTICLE_COUNT_2 = 700      // system 2: blown-away / sucked-in, XZ velocity only
const SPHERE_RADIUS = 0.5
const MAX_SPAWN_RATE = 300        // particles/sec, shared by both systems
const SPREAD_2 = 0.9              // max XZ travel distance for system 2
const MAX_SPAWN_PER_FRAME = 150   // safety cap against huge dt spikes (e.g. tab refocus)
const SPAWN_SENTINEL = -1e4
const DIRECTION_DEADBAND = 1e-5   // ignore sub-pixel lv jitter when deciding flow direction

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

  // Radial direction in the XZ plane only -- Y never moves.
  vec2 xz = position.xz;
  float len = length(xz);
  vec2 dirXZ = len > 0.0001 ? xz / len : vec2(1.0, 0.0);

  float travel = aSpeed * age;
  float extraRadius = aMode > 0.0
    ? min(travel, uSpread)                  // blown away: grows outward from the surface
    : max(aStartOffset - travel, 0.0);       // sucked in: shrinks back toward the surface

  vec3 displaced = vec3(
    position.x + dirXZ.x * extraRadius,
    position.y,
    position.z + dirXZ.y * extraRadius
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

export default function MorphC({ leftVal, rightVal, palette }) {
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

  const { material, fresnelUniforms } = useMemo(() => {
    const fresnelUniforms = {
      fresnelPower:     { value: 1.5 },
      fresnelIntensity: { value: 1.0 },
      dissolveProgress: { value: 0 },
      dissolveScale:    { value: 36.0 },
      dissolveEdge:     { value: 0.12 },
    }

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.morphBase),
      emissive: new THREE.Color(palette.morphEmissive),
      emissiveIntensity: 2,
      roughness: 1,
      metalness: 0,
      transparent: true,
    })

    mat.customProgramCacheKey = () => `fresnel-morph-c-${palette.morphEmissive}`

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, fresnelUniforms)

      // Pass view direction and local (unscaled) position from vertex to
      // fragment via custom varyings -- local position drives the dissolve
      // grain so dot size stays stable regardless of the mesh's breathing scale.
      shader.vertexShader = 'varying vec3 vFresnelDir;\nvarying vec3 vDissolvePos;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vFresnelDir = normalize(-mvPosition.xyz);
        vDissolvePos = position;`
      )

      // Inject uniforms + varying declaration, then add Fresnel to emissive
      shader.fragmentShader =
        `uniform float fresnelPower;
uniform float fresnelIntensity;
uniform float dissolveProgress;
uniform float dissolveScale;
uniform float dissolveEdge;
varying vec3 vFresnelDir;
varying vec3 vDissolvePos;

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
                float dFalloff = 1.0 - smoothstep(0.8, 1.0, dDist);
                dCoverage = max(dCoverage, dFalloff * dProgress);
              }
            }
          }
          gl_FragColor.a *= dCoverage;
        }`
      )
    }

    return { material: mat, fresnelUniforms }
  }, [palette.morphBase, palette.morphEmissive])

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

    for (let i = 0; i < PARTICLE_COUNT_2; i++) {
      seeds[i] = Math.random()
      spawnTimes[i] = SPAWN_SENTINEL
      lifetimes[i] = 1
      speeds[i] = 0.25 + Math.random() * 0.4
      modes[i] = 1
      startOffsets[i] = 0
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
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    geometry.setAttribute('aMode', modeAttr)
    geometry.setAttribute('aStartOffset', startOffsetAttr)

    return { geometry, positionAttr, spawnTimeAttr, lifetimeAttr, modeAttr, startOffsetAttr, basePositions }
  }, [])

  const sparkleMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uSize:  { value: 60 },
        uColor: { value: new THREE.Color(palette.morphEmissive) },
        uTime:  { value: 0 },
      },
      vertexShader: SPARKLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
  }, [palette.morphEmissive])

  const flowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uSize:   { value: 60 },
        uColor:  { value: new THREE.Color(palette.morphEmissive) },
        uTime:   { value: 0 },
        uSpread: { value: SPREAD_2 },
      },
      vertexShader: FLOW_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
  }, [palette.morphEmissive])

  useFrame((state, delta) => {
    if (!groupRef.current) return
    const lv = leftVal.current
    const rv = rightVal.current

    const xScale = THREE.MathUtils.lerp(2.8, 1.5, lv)
    const zScale = THREE.MathUtils.lerp(0.5, 1.5, lv)
    const yScale = THREE.MathUtils.lerp(3.5, 0.4, rv)
    groupRef.current.scale.set(xScale, yScale, zScale)

    material.emissiveIntensity = rv < 0.85
      ? THREE.MathUtils.lerp(2, 1, rv / 0.85)
      : THREE.MathUtils.lerp(1, 3, (rv - 0.85) / 0.15)
    material.roughness = THREE.MathUtils.lerp(0.3, 1, rv)
    fresnelUniforms.fresnelPower.value = THREE.MathUtils.lerp(0.2, 1.5, lv)

    // Mesh dissolves into grain starting halfway to exhale, fully gone at exhale,
    // instead of fading alpha uniformly. Base opacity is capped at 0.75 even on
    // inhale (the surface stays somewhat transparent); the dissolve uniform
    // controls how much of the surface has "burned away" into dots.
    const fadeProgress = THREE.MathUtils.smoothstep(rv, 0.5, 1.0)
    material.opacity = 0.75
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

      const { positionAttr, spawnTimeAttr, lifetimeAttr, modeAttr, startOffsetAttr, basePositions } = flowAttrs
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
      }
      positionAttr.needsUpdate = true
      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
      modeAttr.needsUpdate = true
      startOffsetAttr.needsUpdate = true
    }
    flowMaterial.uniforms.uTime.value = now
  })

  return (
    <group position={[0, 0.25, 0]}>
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
    </group>
  )
}
