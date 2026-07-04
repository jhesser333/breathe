import { useMemo } from 'react'
import { RoundedBox } from '@react-three/drei'

const COUNT = 30

export default function BackgroundA({ gateColor }) {
  const positions = useMemo(() => {
    const pts = []
    for (let i = 0; i < COUNT; i++) {
      const x = Math.random() < 0.5
        ? Math.random() * 6 - 8
        : Math.random() * 6 + 2
      const z = Math.random() * -10
      pts.push([x, -2, z])
    }
    return pts
  }, [])

  return (
    <group>
      {positions.map((pos, i) => (
        <RoundedBox key={i} args={[0.5, 0.5, 0.5]} radius={0.1} smoothness={3} position={pos}>
          <meshStandardMaterial color={gateColor} roughness={0.5} metalness={0.1} />
        </RoundedBox>
      ))}
    </group>
  )
}
