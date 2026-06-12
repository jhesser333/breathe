import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export default function MorphA({ leftVal, rightVal, palette }) {
  const groupRef = useRef()
  const matRef = useRef()

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
    })

    mat.customProgramCacheKey = () => `fresnel-morph-a-${palette.morphEmissive}`

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

  useFrame(() => {
    if (!groupRef.current) return
    const lv = leftVal.current
    const rv = rightVal.current

    const xScale = THREE.MathUtils.lerp(2.2, 1.2, lv)
    const zScale = THREE.MathUtils.lerp(0.5, 1.2, lv)
    const yScale = THREE.MathUtils.lerp(3.5, 0.4, rv)
    groupRef.current.scale.set(xScale, yScale, zScale)

    material.emissiveIntensity = rv < 0.5
      ? THREE.MathUtils.lerp(2, 1, rv * 2)
      : THREE.MathUtils.lerp(1, 3, (rv - 0.5) * 2)
    material.roughness = THREE.MathUtils.lerp(0.3, 1, rv)
    fresnelUniforms.fresnelPower.value = THREE.MathUtils.lerp(0.2, 1.5, lv)
  })

  return (
    <group ref={groupRef} position={[0, 0.25, 0]}>
      <mesh ref={matRef}>
        <sphereGeometry args={[0.5, 32, 16]} />
        <primitive object={material} attach="material" />
      </mesh>
    </group>
  )
}
