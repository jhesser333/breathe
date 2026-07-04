import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const COUNT = 30
const LERP_SPEED = 1.5

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}

export default function BackgroundA({ gateColor, emissiveColor, breathPhaseRef, gatesEnabledRef }) {
  const positions = useMemo(() => {
    const pts = []
    for (let i = 0; i < COUNT; i++) {
      const x = Math.random() * 16 - 8
      const y = Math.random() * -6 - 4
      const z = Math.random() * 35 - 30
      pts.push([x, y, z])
    }
    return pts
  }, [])

  const meshRefs = useRef([])
  const matRefs = useRef([])
  const progressRef = useRef(0)

  useFrame((_, delta) => {
    const gatesActive = gatesEnabledRef?.current ?? false
    const target = gatesActive && breathPhaseRef?.current === 'exhale' ? 1 : 0
    progressRef.current = THREE.MathUtils.lerp(progressRef.current, target, Math.min(delta * LERP_SPEED, 1))
    const t = smoothstep(progressRef.current)

    for (let i = 0; i < COUNT; i++) {
      const mesh = meshRefs.current[i]
      const mat = matRefs.current[i]
      if (!mesh || !mat) continue
      mesh.position.y = THREE.MathUtils.lerp(positions[i][1] - 5, positions[i][1], t)
      mat.opacity = THREE.MathUtils.lerp(0, 0.1, t)
      mat.emissiveIntensity = THREE.MathUtils.lerp(0, 1, t)
    }
  })

  return (
    <group>
      {positions.map((pos, i) => (
        <RoundedBox
          key={i}
          ref={el => { meshRefs.current[i] = el }}
          args={[0.5, 0.5, 0.5]}
          radius={0.1}
          smoothness={3}
          position={[pos[0], pos[1] - 5, pos[2]]}
        >
          <meshStandardMaterial
            ref={el => { matRefs.current[i] = el }}
            color={gateColor}
            emissive={emissiveColor}
            emissiveIntensity={0}
            roughness={0.5}
            metalness={0.1}
            transparent
            opacity={0}
          />
        </RoundedBox>
      ))}
    </group>
  )
}
