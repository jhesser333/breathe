import * as THREE from 'three'

// Shape B (Morphing Cube) only: the cube Morph's material (Fresnel mask +
// dissolve grain via onBeforeCompile), shared by MorphB and the cube targets
// (GatesB / GatesBoxBreathingB), which borrow its Exhale look while they
// approach the Morph.

// Material: same parameters as the Morphing Sphere (MorphC), all driven by the
// right slider only. rv is eased; rv=0 is Inhale, rv=1 is Exhale (the default).
// Paired INHALE_/EXHALE_ values: equal pairs don't change with the slider yet.
export const EXHALE_EMISSIVE = 1.5
export const INHALE_EMISSIVE = 1.5
export const EXHALE_ROUGHNESS = 0.3
export const INHALE_ROUGHNESS = 0.3
export const EXHALE_OPACITY = 0.5
export const INHALE_OPACITY = 0.5
export const EXHALE_FRESNEL_POWER = 0
export const INHALE_FRESNEL_POWER = 0.2
export const FRESNEL_INTENSITY = 1
// Dissolve (same grain effect as MorphC): 0 = fully solid, 1 = fully gone.
// Both ends solid for now.
export const EXHALE_DISSOLVE = 0
export const INHALE_DISSOLVE = 0
export const DISSOLVE_SCALE = 80
export const DISSOLVE_EDGE = 0.12

// Uniforms are per material, so every caller gets its own Fresnel/dissolve
// controls. Starts at the Exhale settings, fully solid.
// flatShade (the Morph only): shade every point as if it faced the camera
// like the cube's front face (world +Z) -- lighting, specular and the Fresnel
// mask alike -- so the top and the (Y-stretched) rounded edges match the
// front instead of going darker.
export function createCubeMorphMaterial(color, emissive, { flatShade = false } = {}) {
  const fresnelUniforms = {
    fresnelPower:     { value: EXHALE_FRESNEL_POWER },
    fresnelIntensity: { value: FRESNEL_INTENSITY },
    dissolveProgress: { value: -DISSOLVE_EDGE * 2 },   // solid until set
    dissolveScale:    { value: DISSOLVE_SCALE },
    dissolveEdge:     { value: DISSOLVE_EDGE },
  }

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(emissive),
    emissiveIntensity: EXHALE_EMISSIVE,
    roughness: EXHALE_ROUGHNESS,
    metalness: 0,
    transparent: true,
    opacity: EXHALE_OPACITY,
  })

  mat.customProgramCacheKey = () => (flatShade ? 'fresnel-morph-b-flat' : 'fresnel-morph-b')

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

    if (flatShade) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);`
      )
    }

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        float fr = pow(1.0 - max(dot(${flatShade ? 'normal' : 'normalize(vNormal)'}, vFresnelDir), 0.0), fresnelPower);
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
}

// Cube targets: from spawn until the pulse they wear the cube Morph's Exhale
// look (this material at its Exhale settings, tertiary base), then blend into
// their own pulse look (secondary base, roughness 0.5, metalness 0.1, opaque,
// unmasked emissive) over the pulse window, z = GATE_PULSE_START_Z -> 0.
// Set GATE_EXHALE_LOOK false to go back to the plain target look throughout.
export const GATE_EXHALE_LOOK = true
export const GATE_PULSE_START_Z = -0.5
// Target pulse look: GatesB's cubes (Box Breathing's use roughness 1, metalness 0).
export const GATE_LOOK = { roughness: 0.5, metalness: 0.1 }
// Approach glow: unlike the Morph at Exhale (whose Fresnel power 0 masks its
// emissive entirely), targets glow unmasked at this multiplier from spawn,
// in the primary color, rising into their pulse.
export const GATE_APPROACH_EMISSIVE = 0.5

// 0 = Exhale look, 1 = target pulse look.
export function gateLookT(z) {
  if (!GATE_EXHALE_LOOK || z >= 0) return 1
  if (z <= GATE_PULSE_START_Z) return 0
  const t = (z - GATE_PULSE_START_Z) / -GATE_PULSE_START_Z
  return t * t * (3 - 2 * t)
}

// One target cube's frame: t from gateLookT, fadeIn 0-1, pulseEmissive = the
// target's own emissive (ramp/pulse, already dimmed on a miss); live = the
// app's live palette (tertiary/secondary/primary) or null. look may also set
// approachEmissive and emissiveFrom ('primary' default, or 'tertiary').
export function applyGateLook({ material, fresnelUniforms }, t, fadeIn, pulseEmissive, live, look = GATE_LOOK) {
  const lerp = THREE.MathUtils.lerp
  material.roughness = lerp(EXHALE_ROUGHNESS, look.roughness, t)
  material.metalness = lerp(0, look.metalness, t)
  material.opacity = fadeIn * lerp(EXHALE_OPACITY, 1, t)
  material.emissiveIntensity = lerp(look.approachEmissive ?? GATE_APPROACH_EMISSIVE, pulseEmissive, t)
  fresnelUniforms.fresnelPower.value = EXHALE_FRESNEL_POWER
  fresnelUniforms.fresnelIntensity.value = 0   // emissive unmasked
  if (live) {
    material.color.copy(live.tertiary).lerp(live.secondary, t)
    material.emissive.copy(look.emissiveFrom === 'tertiary' ? live.tertiary : live.primary)
  }
}
