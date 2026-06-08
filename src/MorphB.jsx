import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

export default function MorphB({ leftVal, rightVal, palette }) {
  const meshRef = useRef()

  const { material, fresnelUniforms } = useMemo(() => {
    const fresnelUniforms = {
      fresnelColor:     { value: new THREE.Color(palette.morphEmissive) },
      fresnelPower:     { value: 3.0 },
      fresnelIntensity: { value: 0.3 },
    }

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.morphBase),
      emissive: new THREE.Color(palette.morphEmissive),
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.1,
    })

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, fresnelUniforms)
      shader.fragmentShader =
        `uniform vec3 fresnelColor;
uniform float fresnelPower;
uniform float fresnelIntensity;\n` + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <output_fragment>',
        `#include <output_fragment>
        float fr = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), fresnelPower);
        gl_FragColor.rgb += fresnelColor * fr * fresnelIntensity;`
      )
    }

    return { material: mat, fresnelUniforms }
  }, [palette.morphBase, palette.morphEmissive])

  useFrame(() => {
    if (!meshRef.current) return
    const lv = leftVal.current
    const rv = rightVal.current
    const xScale = THREE.MathUtils.lerp(2.2, 1.2, lv)
    const zScale = THREE.MathUtils.lerp(0.5, 1.2, lv)
    const yScale = THREE.MathUtils.lerp(3.5, 0.25, rv)
    meshRef.current.scale.set(xScale, yScale, zScale)
    material.emissiveIntensity = THREE.MathUtils.lerp(1, 0.2, rv)
    fresnelUniforms.fresnelIntensity.value = THREE.MathUtils.lerp(0.3, 3.0, lv)
  })

  return (
    <RoundedBox ref={meshRef} args={[1, 1, 1]} radius={0.15} smoothness={4} position={[0, 0.25, 0]}>
      <primitive object={material} attach="material" />
    </RoundedBox>
  )
}
