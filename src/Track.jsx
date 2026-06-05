import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'

const PERIOD = 20      // matches gate spacing: Gate A every 20 units
const MIN_HALF = 0.08  // half-width at Gate A positions (nearly touching)
const MAX_HALF = 1.2   // half-width at Gate B positions (wider than Gate B mesh)
const Y = 0            // road surface
const Z_START = -70
const Z_END = 10
const SEGMENTS = 300

function waveHalfWidth(z) {
  const base = (MIN_HALF + MAX_HALF) / 2
  const amp = (MAX_HALF - MIN_HALF) / 2
  return base - amp * Math.cos((2 * Math.PI * z) / PERIOD)
}

export default function Track({ gatesEnabledRef, spawnIntervalRef }) {
  const groupRef = useRef()
  const offsetRef = useRef(0)

  const { leftPoints, rightPoints } = useMemo(() => {
    const leftPoints = []
    const rightPoints = []
    for (let i = 0; i <= SEGMENTS; i++) {
      const z = Z_START + ((Z_END - Z_START) * i) / SEGMENTS
      const hw = waveHalfWidth(z)
      leftPoints.push([-hw, Y, z])
      rightPoints.push([hw, Y, z])
    }
    return { leftPoints, rightPoints }
  }, [])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    if (!gatesEnabledRef.current) {
      groupRef.current.visible = false
      offsetRef.current = 0
      return
    }
    groupRef.current.visible = true
    const gateSpeed = 20 / spawnIntervalRef.current
    offsetRef.current += gateSpeed * delta
    if (offsetRef.current >= PERIOD) offsetRef.current -= PERIOD
    groupRef.current.position.z = offsetRef.current
  })

  return (
    <group ref={groupRef} visible={false}>
      <Line points={leftPoints} color="white" lineWidth={3} transparent opacity={0.05} />
      <Line points={rightPoints} color="white" lineWidth={3} transparent opacity={0.05} />
    </group>
  )
}
