import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const COUNT = 50
const STAR_RADIUS = 0.045

export default function StarFieldE({ gateColor, emissiveColor, holdFlareRef }) {
  const positions = useMemo(() => {
    const pts = []
    for (let i = 0; i < COUNT; i++) {
      const x = Math.random() * 16 - 8
      const y = Math.random() * 9 - 3
      const z = Math.random() * 35 - 30
      pts.push([x, y, z])
    }
    return pts
  }, [])

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(gateColor),
    emissive: new THREE.Color(emissiveColor),
    emissiveIntensity: 0,
    roughness: 0.5,
    metalness: 0.1,
  }), [gateColor, emissiveColor])

  useFrame(() => {
    material.emissiveIntensity = holdFlareRef?.current ?? 0
  })

  return (
    <group>
      {positions.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[STAR_RADIUS, 8, 6]} />
          <primitive object={material} attach="material" />
        </mesh>
      ))}
    </group>
  )
}
