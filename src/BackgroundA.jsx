import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const COUNT = 30

// Default (exhale) position, before rising toward the inhale position.
const SPAWN_X_MIN = -5
const SPAWN_X_MAX = 5
const SPAWN_Y_MIN = -20
const SPAWN_Y_MAX = -10
const SPAWN_Z_MIN = -20
const SPAWN_Z_MAX = -10
const RISE_MIN = 10  // how far cubes move up from exhale -> inhale position
const RISE_MAX = 15

const PULSE_WIDTH = 0.1          // fraction of travel over which the pulse ramps
const PULSE_OPACITY_BOOST = 0.07 // extra opacity at the extremes (both top and bottom)
const PULSE_EMISSIVE_BOOST = 0.6 // extra emissiveIntensity at the extremes

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}

// Peaks at t=0 (full exhale) and t=1 (full inhale), 0 in the middle of the travel.
function pulseFactor(t) {
  const d = Math.min(t, 1 - t)
  return 1 - smoothstep(Math.min(d / PULSE_WIDTH, 1))
}

export default function BackgroundA({ gateColor, emissiveColor, breathPhaseRef, gatesEnabledRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef }) {
  const positions = useMemo(() => {
    const pts = []
    for (let i = 0; i < COUNT; i++) {
      const x = SPAWN_X_MIN + Math.random() * (SPAWN_X_MAX - SPAWN_X_MIN)
      const exhaleY = SPAWN_Y_MIN + Math.random() * (SPAWN_Y_MAX - SPAWN_Y_MIN)
      const z = SPAWN_Z_MIN + Math.random() * (SPAWN_Z_MAX - SPAWN_Z_MIN)
      const rise = RISE_MIN + Math.random() * (RISE_MAX - RISE_MIN)
      const inhaleY = exhaleY + rise
      pts.push([x, exhaleY, z, inhaleY])
    }
    return pts
  }, [])

  const meshRefs = useRef([])
  const matRefs = useRef([])
  const progressRef = useRef(0)
  const hasStartedRef = useRef(false)

  useFrame((_, delta) => {
    const gatesActive = gatesEnabledRef?.current ?? false
    const target = gatesActive && breathPhaseRef?.current === 'inhale' ? 1 : 0
    if (target === 1) hasStartedRef.current = true
    const inhale = inhaleSecondsRef?.current
    const exhale = exhaleSecondsRef?.current
    const hasSplit = inhale != null && exhale != null
    const fallback = (spawnIntervalRef?.current ?? 6) / 2
    const halfInterval = target === 1 ? (hasSplit ? inhale : fallback) : (hasSplit ? exhale : fallback)
    const dir = target > progressRef.current ? 1 : -1
    progressRef.current = THREE.MathUtils.clamp(progressRef.current + dir * delta / halfInterval, 0, 1)
    const t = smoothstep(progressRef.current)
    const pulse = hasStartedRef.current ? pulseFactor(t) : 0

    for (let i = 0; i < COUNT; i++) {
      const mesh = meshRefs.current[i]
      const mat = matRefs.current[i]
      if (!mesh || !mat) continue
      const [, exhaleY, , inhaleY] = positions[i]
      mesh.position.y = THREE.MathUtils.lerp(exhaleY, inhaleY, t)
      mat.opacity = THREE.MathUtils.clamp(THREE.MathUtils.lerp(0, 0.1, t) + PULSE_OPACITY_BOOST * pulse, 0, 1)
      mat.emissiveIntensity = THREE.MathUtils.lerp(0, 1, t) + PULSE_EMISSIVE_BOOST * pulse
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
          position={[pos[0], pos[1], pos[2]]}
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
