import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const GREEN = new THREE.Color('#22dd55')
const BLUE = new THREE.Color('#2255ff')
const tempColor = new THREE.Color()

export default function Morph({ leftVal, rightVal }) {
  const meshLeftRef = useRef()
  const meshRightRef = useRef()
  const matLeftRef = useRef()
  const matRightRef = useRef()

  useFrame(() => {
    if (!meshLeftRef.current || !meshRightRef.current) return
    if (!matLeftRef.current || !matRightRef.current) return

    const lv = leftVal.current
    const rv = rightVal.current

    const hScale = THREE.MathUtils.lerp(0.75, 2.0, lv)
    const vScale = THREE.MathUtils.lerp(1.2, 2.5, rv)
    const spreadX = THREE.MathUtils.lerp(0, 1.4, lv)

    meshLeftRef.current.scale.set(hScale, vScale, 1)
    meshRightRef.current.scale.set(hScale, vScale, 1)
    meshLeftRef.current.position.x = -spreadX
    meshRightRef.current.position.x = spreadX

    tempColor.copy(GREEN).lerp(BLUE, lv)
    const emissive = THREE.MathUtils.lerp(0.5, 0.85, rv)
    for (const mat of [matLeftRef.current, matRightRef.current]) {
      mat.color.copy(tempColor)
      mat.emissive.copy(tempColor)
      mat.emissiveIntensity = emissive
    }
  })

  const matProps = {
    color: '#22dd55',
    emissive: '#22dd55',
    emissiveIntensity: 0,
    roughness: 0.3,
    metalness: 0.1,
  }

  return (
    <>
      <mesh ref={meshLeftRef}>
        <sphereGeometry args={[0.5, 32, 16]} />
        <meshStandardMaterial ref={matLeftRef} {...matProps} />
      </mesh>
      <mesh ref={meshRightRef}>
        <sphereGeometry args={[0.5, 32, 16]} />
        <meshStandardMaterial ref={matRightRef} {...matProps} />
      </mesh>
    </>
  )
}
