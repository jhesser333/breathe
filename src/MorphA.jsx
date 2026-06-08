import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export default function MorphA({ leftVal, rightVal, palette }) {
  const meshRef = useRef()
  const matRef = useRef()

  useFrame(() => {
    if (!meshRef.current || !matRef.current) return
    const lv = leftVal.current
    const rv = rightVal.current
    const xScale = THREE.MathUtils.lerp(2.2, 1.2, lv)
    const zScale = THREE.MathUtils.lerp(0.5, 1.2, lv)
    const yScale = THREE.MathUtils.lerp(3.5, 0.25, rv)
    meshRef.current.scale.set(xScale, yScale, zScale)
    matRef.current.emissiveIntensity = THREE.MathUtils.lerp(2, 0.2, rv)
  })

  return (
    <mesh ref={meshRef} position={[0, 0.25, 0]}>
      <sphereGeometry args={[0.5, 32, 16]} />
      <meshStandardMaterial
        ref={matRef}
        color={palette.morphBase}
        emissive={palette.morphEmissive}
        emissiveIntensity={0.2}
        roughness={0.3}
        metalness={0.1}
      />
    </mesh>
  )
}
