import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export default function MorphA({ leftVal, rightVal, palette }) {
  const meshRef = useRef()

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(palette.morphBase),
      emissive: new THREE.Color(palette.morphEmissive),
      emissiveIntensity: 0.2,
      roughness: 0.3,
      metalness: 0.1,
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.fresnelColor = { value: new THREE.Color(palette.morphEmissive) }
      shader.uniforms.fresnelPower = { value: 3.0 }
      shader.uniforms.fresnelIntensity = { value: 1.5 }

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

    return mat
  }, [palette.morphBase, palette.morphEmissive])

  useFrame(() => {
    if (!meshRef.current) return
    const lv = leftVal.current
    const rv = rightVal.current
    const xScale = THREE.MathUtils.lerp(2.2, 1.2, lv)
    const zScale = THREE.MathUtils.lerp(0.5, 1.2, lv)
    const yScale = THREE.MathUtils.lerp(3.5, 0.25, rv)
    meshRef.current.scale.set(xScale, yScale, zScale)
    material.emissiveIntensity = THREE.MathUtils.lerp(2, 0.2, rv)
  })

  return (
    <mesh ref={meshRef} position={[0, 0.25, 0]}>
      <sphereGeometry args={[0.5, 32, 16]} />
      <primitive object={material} attach="material" />
    </mesh>
  )
}
