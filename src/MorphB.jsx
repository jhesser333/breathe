import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

export default function MorphB({ leftVal, rightVal, palette }) {
  const groupRef = useRef()
  const matRef = useRef()
  const rimMatRef = useRef()

  const rimColor = useMemo(() => new THREE.Color(palette.morphEmissive), [palette.morphEmissive])

  useFrame(() => {
    if (!groupRef.current || !matRef.current || !rimMatRef.current) return
    const lv = leftVal.current
    const rv = rightVal.current

    const xScale = THREE.MathUtils.lerp(2.2, 1.2, lv)
    const zScale = THREE.MathUtils.lerp(0.5, 1.2, lv)
    const yScale = THREE.MathUtils.lerp(3.5, 0.25, rv)
    groupRef.current.scale.set(xScale, yScale, zScale)

    matRef.current.emissiveIntensity = THREE.MathUtils.lerp(1, 0.2, rv)

    const rimIntensity = THREE.MathUtils.lerp(0.5, 3.0, lv)
    rimMatRef.current.color.copy(rimColor).multiplyScalar(rimIntensity)
  })

  return (
    <group ref={groupRef} position={[0, 0.25, 0]}>
      <RoundedBox args={[1, 1, 1]} radius={0.15} smoothness={4} scale={[1.12, 1.12, 1.12]}>
        <meshBasicMaterial
          ref={rimMatRef}
          color={palette.morphEmissive}
          side={THREE.BackSide}
        />
      </RoundedBox>
      <RoundedBox args={[1, 1, 1]} radius={0.15} smoothness={4}>
        <meshStandardMaterial
          ref={matRef}
          color={palette.morphBase}
          emissive={palette.morphEmissive}
          emissiveIntensity={0.2}
          roughness={0.3}
          metalness={0.1}
        />
      </RoundedBox>
    </group>
  )
}
