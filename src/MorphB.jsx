import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

export default function MorphB({ leftVal, rightVal, palette }) {
  const groupRef = useRef()

  const { material, fresnelUniforms } = useMemo(() => {
    const fresnelUniforms = {
      fresnelPower:     { value: 4.0 },
      fresnelIntensity: { value: 0.3 },
    }

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.morphBase),
      emissive: new THREE.Color(palette.morphEmissive),
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.1,
    })

    mat.customProgramCacheKey = () => `fresnel-morph-b-${palette.morphEmissive}`

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

    return { material: mat, fresnelUniforms }
  }, [palette.morphBase, palette.morphEmissive])

  useFrame(() => {
    if (!groupRef.current) return
    const lv = leftVal.current
    const rv = rightVal.current

    const xScale = THREE.MathUtils.lerp(2.2, 1.2, lv)
    const zScale = THREE.MathUtils.lerp(2.2, 1.2, lv)
    const yScale = THREE.MathUtils.lerp(3.5, 0.5, rv)
    groupRef.current.scale.set(xScale, yScale, zScale)

    material.emissiveIntensity = THREE.MathUtils.lerp(1, 0.2, rv)
    fresnelUniforms.fresnelIntensity.value = THREE.MathUtils.lerp(0.3, 1.0, lv)
  })

  return (
    <group ref={groupRef} position={[0, 0.25, 0]}>
      <RoundedBox args={[1, 1, 1]} radius={0.15} smoothness={4}>
        <primitive object={material} attach="material" />
      </RoundedBox>
    </group>
  )
}
