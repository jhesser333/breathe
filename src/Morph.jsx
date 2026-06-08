import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const MID_COLOR = '#2299aa'

export default function Morph({ leftVal, rightVal }) {
  const meshRef = useRef()
  const matRef = useRef()

  useFrame(() => {
    if (!matRef.current) return
    const rv = rightVal.current
    matRef.current.emissiveIntensity = THREE.MathUtils.lerp(0.85, 0.5, rv)
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.5, 32, 16]} />
      <meshStandardMaterial
        ref={matRef}
        color={MID_COLOR}
        emissive={MID_COLOR}
        emissiveIntensity={0.85}
        roughness={0.3}
        metalness={0.1}
      />
    </mesh>
  )
}
