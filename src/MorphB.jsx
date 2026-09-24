import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

// Material: same parameters as the Morphing Sphere (MorphC), all driven by the
// right slider only. rv is eased; rv=0 is Inhale, rv=1 is Exhale (the default).
// Paired INHALE_/EXHALE_ values: equal pairs don't change with the slider yet.
const EXHALE_EMISSIVE = 1.5
const INHALE_EMISSIVE = 1.5
const EXHALE_ROUGHNESS = 0.3
const INHALE_ROUGHNESS = 0.3
const EXHALE_OPACITY = 0.5
const INHALE_OPACITY = 0.5
const EXHALE_FRESNEL_POWER = 0
const INHALE_FRESNEL_POWER = 0.2
const FRESNEL_INTENSITY = 1
// Dissolve (same grain effect as MorphC): 0 = fully solid, 1 = fully gone.
// Both ends solid for now.
const EXHALE_DISSOLVE = 0
const INHALE_DISSOLVE = 0
const DISSOLVE_SCALE = 80
const DISSOLVE_EDGE = 0.12

// Burst sparkles: MorphC's surface-sparkle look (size, life, fade, twinkle),
// but fired in one burst each time the right slider reaches its top or bottom.
// Top (Exhale): particles fly outward along X; bottom (Inhale): along Y. Speed
// is random, scaled by how far the particle spawned from the cube's pivot
// along that axis (0 at the center, full at the face).
const BURST_POOL = 1500
const BURST_COUNT = 150
const BURST_SPEED = [0.15, 0.5]  // units/s at the face (scales to 0 at the pivot)
const BURST_EDGE = 0.02          // raw slider distance from an end that counts as "hit"
const BURST_REARM = 0.1          // must move this far back from that end before it can fire again
const BURST_SIZE = 60
const SPAWN_SENTINEL = -1e4
// Surface sparkles: same look as the bursts, but no velocity, emitted
// continuously, and inside the scaled group so they stick to the cube.
const SURFACE_POOL = 1500
const SURFACE_SPAWN_RATE = 300   // particles/sec (the sphere's MAX_SPAWN_RATE)
const SURFACE_SIZE = BURST_SIZE
const MAX_SPAWN_PER_FRAME = 150  // safety cap against huge dt spikes (e.g. tab refocus)
const MORPH_Y = 0.25

const BURST_VERTEX_SHADER = `
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

const BURST_FRAGMENT_SHADER = `
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

// Uniform random point on the surface of the unit cube (-0.5..0.5).
function sampleCubeSurface(out, i) {
  const axis = Math.floor(Math.random() * 3)
  const side = Math.random() < 0.5 ? -0.5 : 0.5
  const p = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]
  p[axis] = side
  out[i * 3] = p[0]
  out[i * 3 + 1] = p[1]
  out[i * 3 + 2] = p[2]
}

export default function MorphB({ leftVal, rightVal, palette }) {
  const groupRef = useRef()

  const { material, fresnelUniforms } = useMemo(() => {
    const fresnelUniforms = {
      fresnelPower:     { value: EXHALE_FRESNEL_POWER },
      fresnelIntensity: { value: FRESNEL_INTENSITY },
      dissolveProgress: { value: 0 },
      dissolveScale:    { value: DISSOLVE_SCALE },
      dissolveEdge:     { value: DISSOLVE_EDGE },
    }

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.tertiaryColor),
      emissive: new THREE.Color(palette.primaryColor),
      emissiveIntensity: EXHALE_EMISSIVE,
      roughness: EXHALE_ROUGHNESS,
      metalness: 0,
      transparent: true,
      opacity: EXHALE_OPACITY,
    })

    mat.customProgramCacheKey = () => `fresnel-morph-b-${palette.primaryColor}`

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, fresnelUniforms)

      // View direction for the Fresnel mask; local (unscaled) position for the
      // dissolve grain so dot size stays stable as the cube scales.
      shader.vertexShader = 'varying vec3 vFresnelDir;\nvarying vec3 vDissolvePos;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vFresnelDir = normalize(-mvPosition.xyz);
        vDissolvePos = position;`
      )

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

      // Dissolve: same metaball-style grain as MorphC.
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

  const burst = useMemo(() => {
    const positions = new Float32Array(BURST_POOL * 3)
    const seeds = new Float32Array(BURST_POOL)
    const spawnTimes = new Float32Array(BURST_POOL).fill(SPAWN_SENTINEL)
    const lifetimes = new Float32Array(BURST_POOL).fill(1)
    const vel = new Float32Array(BURST_POOL * 3)
    for (let i = 0; i < BURST_POOL; i++) seeds[i] = Math.random()

    const geometry = new THREE.BufferGeometry()
    const positionAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
    const spawnTimeAttr = new THREE.BufferAttribute(spawnTimes, 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(lifetimes, 1).setUsage(THREE.DynamicDrawUsage)
    const velAttr = new THREE.BufferAttribute(vel, 3).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', positionAttr)
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    geometry.setAttribute('aVel', velAttr)
    return { geometry, positionAttr, spawnTimeAttr, lifetimeAttr, velAttr, base: new Float32Array(3) }
  }, [])

  const burstMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uSize:  { value: BURST_SIZE },
      uColor: { value: new THREE.Color(palette.primaryColor) },
      uTime:  { value: 0 },
    },
    vertexShader: BURST_VERTEX_SHADER,
    fragmentShader: BURST_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  }), [palette.primaryColor])

  // Surface sparkles reuse the burst shaders with every velocity at 0.
  const surface = useMemo(() => {
    const positions = new Float32Array(SURFACE_POOL * 3)
    const seeds = new Float32Array(SURFACE_POOL)
    for (let i = 0; i < SURFACE_POOL; i++) {
      sampleCubeSurface(positions, i)
      seeds[i] = Math.random()
    }
    const geometry = new THREE.BufferGeometry()
    const spawnTimeAttr = new THREE.BufferAttribute(new Float32Array(SURFACE_POOL).fill(SPAWN_SENTINEL), 1).setUsage(THREE.DynamicDrawUsage)
    const lifetimeAttr = new THREE.BufferAttribute(new Float32Array(SURFACE_POOL).fill(1), 1).setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.setAttribute('aSpawnTime', spawnTimeAttr)
    geometry.setAttribute('aLifetime', lifetimeAttr)
    geometry.setAttribute('aVel', new THREE.BufferAttribute(new Float32Array(SURFACE_POOL * 3), 3))
    return { geometry, spawnTimeAttr, lifetimeAttr }
  }, [])

  const surfaceMaterial = useMemo(() => {
    const m = burstMaterial.clone()
    m.uniforms.uSize.value = SURFACE_SIZE
    return m
  }, [burstMaterial])

  const surfaceCursorRef = useRef(0)
  const surfaceAccumulatorRef = useRef(0)
  const burstCursorRef = useRef(0)
  // Which end the right slider last burst at ('top' | 'bottom' | null); cleared
  // once it moves BURST_REARM away, so resting at an end never repeats.
  // undefined until the first frame, which adopts the starting position
  // without firing (the slider starts at the top).
  const burstEndRef = useRef(undefined)

  useFrame((state, delta) => {
    if (!groupRef.current) return
    // Ease slider input in/out (default convention -- see CLAUDE.md) so
    // every value derived below moves smoothly rather than tracking the
    // thumb's raw position 1:1.
    const lv = THREE.MathUtils.smoothstep(leftVal.current, 0, 1)
    const rv = THREE.MathUtils.smoothstep(rightVal.current, 0, 1)

    const xScale = THREE.MathUtils.lerp(2.2, 1.2, lv)
    const zScale = THREE.MathUtils.lerp(0.5, 1.2, lv)
    const yScale = THREE.MathUtils.lerp(3.5, 0.4, rv)
    groupRef.current.scale.set(xScale, yScale, zScale)

    material.emissiveIntensity = THREE.MathUtils.lerp(INHALE_EMISSIVE, EXHALE_EMISSIVE, rv)
    material.roughness = THREE.MathUtils.lerp(INHALE_ROUGHNESS, EXHALE_ROUGHNESS, rv)
    material.opacity = THREE.MathUtils.lerp(INHALE_OPACITY, EXHALE_OPACITY, rv)
    fresnelUniforms.fresnelPower.value = THREE.MathUtils.lerp(INHALE_FRESNEL_POWER, EXHALE_FRESNEL_POWER, rv)
    // Map 0..1 past the noise's range by a margin so 0 is fully solid and 1
    // fully gone (same margin math as MorphC).
    const margin = DISSOLVE_EDGE * 2
    const dissolve = THREE.MathUtils.lerp(INHALE_DISSOLVE, EXHALE_DISSOLVE, rv)
    fresnelUniforms.dissolveProgress.value = THREE.MathUtils.lerp(-margin, 1 + margin, dissolve)

    // Burst when the raw right slider hits either end.
    const now = state.clock.elapsedTime
    const raw = rightVal.current
    const atEnd = raw >= 1 - BURST_EDGE ? 'top' : raw <= BURST_EDGE ? 'bottom' : null
    if (burstEndRef.current === undefined) burstEndRef.current = atEnd
    if (burstEndRef.current === 'top' && raw < 1 - BURST_REARM) burstEndRef.current = null
    if (burstEndRef.current === 'bottom' && raw > BURST_REARM) burstEndRef.current = null
    if (atEnd && burstEndRef.current !== atEnd) {
      burstEndRef.current = atEnd
      const axis = atEnd === 'top' ? 0 : 1   // Exhale end: X, Inhale end: Y
      const { positionAttr, spawnTimeAttr, lifetimeAttr, velAttr, base } = burst
      for (let k = 0; k < BURST_COUNT; k++) {
        const idx = burstCursorRef.current % BURST_POOL
        burstCursorRef.current += 1
        sampleCubeSurface(base, 0)
        // Spawn on the cube's visible surface at this frame's scale.
        positionAttr.array[idx * 3]     = base[0] * xScale
        positionAttr.array[idx * 3 + 1] = base[1] * yScale
        positionAttr.array[idx * 3 + 2] = base[2] * zScale
        // Outward along the axis; base is on the unit cube, so |base|/0.5 is
        // 0 at the pivot and 1 at the face regardless of the current scale.
        velAttr.array[idx * 3] = 0
        velAttr.array[idx * 3 + 1] = 0
        velAttr.array[idx * 3 + 2] = 0
        velAttr.array[idx * 3 + axis] = (base[axis] / 0.5) * THREE.MathUtils.randFloat(...BURST_SPEED)
        spawnTimeAttr.array[idx] = now
        lifetimeAttr.array[idx] = 1 + Math.random()
      }
      positionAttr.needsUpdate = true
      velAttr.needsUpdate = true
      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
    }
    burstMaterial.uniforms.uTime.value = now

    // Surface sparkles: steady emission, no velocity.
    surfaceAccumulatorRef.current += SURFACE_SPAWN_RATE * delta
    let toSpawn = Math.floor(surfaceAccumulatorRef.current)
    if (toSpawn > 0) {
      surfaceAccumulatorRef.current -= toSpawn
      toSpawn = Math.min(toSpawn, MAX_SPAWN_PER_FRAME)
      const { spawnTimeAttr, lifetimeAttr } = surface
      for (let k = 0; k < toSpawn; k++) {
        const idx = surfaceCursorRef.current % SURFACE_POOL
        surfaceCursorRef.current += 1
        spawnTimeAttr.array[idx] = now
        lifetimeAttr.array[idx] = 1 + Math.random()
      }
      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
    }
    surfaceMaterial.uniforms.uTime.value = now
  })

  return (
    <>
      <group ref={groupRef} position={[0, MORPH_Y, 0]}>
        <RoundedBox args={[1, 1, 1]} radius={0.15} smoothness={4}>
          <primitive object={material} attach="material" />
        </RoundedBox>
        <points geometry={surface.geometry}>
          <primitive object={surfaceMaterial} attach="material" />
        </points>
      </group>
      {/* Burst sparkles sit outside the scaled group so their X travel isn't
          stretched by the cube's breathing scale. */}
      {/* Particles move in the shader, so skip frustum culling on stale bounds. */}
      <points position={[0, MORPH_Y, 0]} geometry={burst.geometry} frustumCulled={false}>
        <primitive object={burstMaterial} attach="material" />
      </points>
    </>
  )
}
