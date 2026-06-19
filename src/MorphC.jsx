import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const PARTICLE_COUNT = 1500
const SPHERE_RADIUS = 0.5
const MAX_SPAWN_RATE = 300 // particles/sec at the moment dissolve begins, ramping to 0 by full exhale
const MAX_SPAWN_PER_FRAME = 150 // safety cap against huge dt spikes (e.g. tab refocus)
const SPAWN_SENTINEL = -1e4

const PARTICLE_VERTEX_SHADER = `
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
  float fade = 1.0 - smoothstep(0.0, 1.0, lifeT);

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (0.5 + aSeed * 0.8) / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;

  vAlpha = fade;
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

export default function MorphC({ leftVal, rightVal, palette }) {
  const groupRef = useRef()
  const matRef = useRef()
  const pointsMatRef = useRef()

  // Cyclic index into the particle pool, and leftover fractional spawn
  // count carried between frames (rate * dt isn't usually a whole number).
  const spawnCursorRef = useRef(0)
  const spawnAccumulatorRef = useRef(0)

  const { material, fresnelUniforms } = useMemo(() => {
    const fresnelUniforms = {
      fresnelPower:     { value: 1.5 },
      fresnelIntensity: { value: 1.0 },
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

      // Pass view direction from vertex to fragment via custom varying
      shader.vertexShader = 'varying vec3 vFresnelDir;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vFresnelDir = normalize(-mvPosition.xyz);`
      )

      // Inject uniforms + varying declaration, then add Fresnel to emissive
      shader.fragmentShader =
        `uniform float fresnelPower;
uniform float fresnelIntensity;
varying vec3 vFresnelDir;\n` + shader.fragmentShader

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float fr = pow(1.0 - max(dot(normalize(vNormal), vFresnelDir), 0.0), fresnelPower);
          totalEmissiveRadiance *= (1.0 - fr * fresnelIntensity);
        }`
      )
    }

    return { material: mat, fresnelUniforms }
  }, [palette.morphBase, palette.morphEmissive])

  const particleAttrs = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const seeds = new Float32Array(PARTICLE_COUNT)
    const spawnTimes = new Float32Array(PARTICLE_COUNT)
    const lifetimes = new Float32Array(PARTICLE_COUNT)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Uniform distribution on a sphere surface (Archimedes method)
      const z = Math.random() * 2 - 1
      const theta = Math.acos(z)
      const phi = Math.random() * Math.PI * 2
      const sinTheta = Math.sin(theta)

      positions[i * 3]     = SPHERE_RADIUS * sinTheta * Math.cos(phi)
      positions[i * 3 + 1] = SPHERE_RADIUS * sinTheta * Math.sin(phi)
      positions[i * 3 + 2] = SPHERE_RADIUS * z

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

  const particleMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uSize:  { value: 60 },
        uColor: { value: new THREE.Color(palette.morphEmissive) },
        uTime:  { value: 0 },
      },
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  }, [palette.morphEmissive])

  useFrame((state, delta) => {
    if (!groupRef.current) return
    const lv = leftVal.current
    const rv = rightVal.current

    const xScale = THREE.MathUtils.lerp(2.2, 1.2, lv)
    const zScale = THREE.MathUtils.lerp(0.5, 1.2, lv)
    const yScale = THREE.MathUtils.lerp(3.5, 0.4, rv)
    groupRef.current.scale.set(xScale, yScale, zScale)

    material.emissiveIntensity = rv < 0.85
      ? THREE.MathUtils.lerp(2, 1, rv / 0.85)
      : THREE.MathUtils.lerp(1, 3, (rv - 0.85) / 0.15)
    material.roughness = THREE.MathUtils.lerp(0.3, 1, rv)
    fresnelUniforms.fresnelPower.value = THREE.MathUtils.lerp(0.2, 1.5, lv)

    // Dissolve only happens in the back half of the exhale travel (rv 0.5 -> 1).
    // Nothing spawns and the mesh stays fully solid below that threshold.
    const progress = THREE.MathUtils.smoothstep(rv, 0.5, 1.0)
    material.opacity = 1 - progress

    // Spawn rate starts at MAX_SPAWN_RATE the moment dissolve begins and
    // ramps down to 0 by full exhale (and mirrors symmetrically on the way
    // back toward inhale, since it's purely a function of progress).
    const spawnRate = progress <= 0 ? 0 : THREE.MathUtils.lerp(MAX_SPAWN_RATE, 0, progress)

    const now = state.clock.elapsedTime
    spawnAccumulatorRef.current += spawnRate * delta
    let toSpawn = Math.floor(spawnAccumulatorRef.current)
    if (toSpawn > 0) {
      spawnAccumulatorRef.current -= toSpawn
      toSpawn = Math.min(toSpawn, MAX_SPAWN_PER_FRAME)

      const { spawnTimeAttr, lifetimeAttr } = particleAttrs

      for (let k = 0; k < toSpawn; k++) {
        const idx = spawnCursorRef.current % PARTICLE_COUNT
        spawnCursorRef.current += 1

        spawnTimeAttr.array[idx] = now
        lifetimeAttr.array[idx] = 1 + Math.random() // fades out 1-2s after spawning
      }

      spawnTimeAttr.needsUpdate = true
      lifetimeAttr.needsUpdate = true
    }

    particleMaterial.uniforms.uTime.value = now
  })

  return (
    <group ref={groupRef} position={[0, 0.25, 0]}>
      <mesh ref={matRef}>
        <sphereGeometry args={[SPHERE_RADIUS, 32, 16]} />
        <primitive object={material} attach="material" />
      </mesh>
      <points geometry={particleAttrs.geometry}>
        <primitive ref={pointsMatRef} object={particleMaterial} attach="material" />
      </points>
    </group>
  )
}
