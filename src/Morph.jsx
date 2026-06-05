import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const GREEN = new THREE.Color('#22dd55')
const BLUE = new THREE.Color('#2255ff')
const tempColor = new THREE.Color()

export default function Morph({ leftVal, rightVal }) {
  const meshRef = useRef()
  const matRef = useRef()

  useFrame(() => {
    if (!meshRef.current || !matRef.current) return

    const lv = leftVal.current
    const rv = rightVal.current

    const hScale = THREE.MathUtils.lerp(0.5, 2.5, lv)
    const vScale = THREE.MathUtils.lerp(0.6, 2.5, rv)
    meshRef.current.scale.set(hScale, vScale, 1)

    tempColor.copy(GREEN).lerp(BLUE, lv)
    matRef.current.color.copy(tempColor)
    matRef.current.emissive.copy(tempColor)
    matRef.current.emissiveIntensity = THREE.MathUtils.lerp(0.5, 0.85, rv)
  })

  return (
    <RoundedBox ref={meshRef} args={[1, 1, 1]} radius={0.15} smoothness={4}>
      <meshStandardMaterial
        ref={matRef}
        color="#22dd55"
        emissive="#22dd55"
        emissiveIntensity={0}
        roughness={0.3}
        metalness={0.1}
      />
    </RoundedBox>
  )
}
