import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const RING_COUNT = 5
const RADIUS_MIN = 0.6
const RADIUS_MAX = 2.4
const TUBE = 0.05
const GROUP_POSITION = [0, 0.25, -2]

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}

export default function BackgroundB({ gateColor, breathPhaseRef, gatesEnabledRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef }) {
  const groupRef = useRef()
  const progressRef = useRef(0)

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(gateColor),
    roughness: 0.5,
    metalness: 0.1,
    transparent: true,
    opacity: 0.6,
  }), [gateColor])

  const radii = useMemo(() => Array.from({ length: RING_COUNT }, (_, i) =>
    THREE.MathUtils.lerp(RADIUS_MIN, RADIUS_MAX, RING_COUNT > 1 ? i / (RING_COUNT - 1) : 0)
  ), [])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const gatesActive = gatesEnabledRef?.current ?? false
    const target = gatesActive && breathPhaseRef?.current === 'exhale' ? 1 : 0
    const inhale = inhaleSecondsRef?.current
    const exhale = exhaleSecondsRef?.current
    const hasSplit = inhale != null && exhale != null
    const fallback = (spawnIntervalRef?.current ?? 6) / 2
    const halfInterval = target === 1 ? (hasSplit ? exhale : fallback) : (hasSplit ? inhale : fallback)
    const dir = target > progressRef.current ? 1 : -1
    progressRef.current = THREE.MathUtils.clamp(progressRef.current + dir * delta / halfInterval, 0, 1)
    groupRef.current.scale.setScalar(smoothstep(progressRef.current))
  })

  return (
    <group ref={groupRef} position={GROUP_POSITION} scale={0}>
      {radii.map((r, i) => (
        <mesh key={i}>
          <torusGeometry args={[r, TUBE, 16, 64]} />
          <primitive object={material} attach="material" />
        </mesh>
      ))}
    </group>
  )
}
