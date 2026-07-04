import { useMemo } from 'react'
import { RoundedBox } from '@react-three/drei'

const COUNT = 30

export default function BackgroundA({ gateColor }) {
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

  return (
    <group>
      {positions.map((pos, i) => (
        <RoundedBox key={i} args={[0.5, 0.5, 0.5]} radius={0.1} smoothness={3} position={pos}>
          <meshStandardMaterial color={gateColor} roughness={0.5} metalness={0.1} transparent opacity={0.2} />
        </RoundedBox>
      ))}
    </group>
  )
}
