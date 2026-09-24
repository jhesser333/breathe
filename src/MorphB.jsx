import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

export default function MorphB({ leftVal, rightVal, palette }) {
  const groupRef = useRef()

  const { material } = useMemo(() => {
    // Fixed at what used to be the sliders' Exhale values.
    const fresnelUniforms = {
      fresnelPower:     { value: 0.2 },
      fresnelIntensity: { value: 1.0 },
    }

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.tertiaryColor),
      emissive: new THREE.Color(palette.primaryColor),
      emissiveIntensity: 3,
      roughness: 1,
      metalness: 0,
    })

    mat.customProgramCacheKey = () => `fresnel-morph-b-${palette.primaryColor}`

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, fresnelUniforms)

      shader.vertexShader = 'varying vec3 vFresnelDir;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vFresnelDir = normalize(-mvPosition.xyz);`
      )

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

    return { material: mat }
  }, [palette.tertiaryColor, palette.primaryColor])

  useFrame(() => {
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
    // Material is not slider-driven: fixed at the old Exhale values (see useMemo).
  })

  return (
    <group ref={groupRef} position={[0, 0.25, 0]}>
      <RoundedBox args={[1, 1, 1]} radius={0.15} smoothness={4}>
        <primitive object={material} attach="material" />
      </RoundedBox>
    </group>
  )
}
