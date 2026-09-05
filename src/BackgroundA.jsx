import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const COUNT = 30

// Approx world-Y of "screen center" at a given depth, derived from the
// camera ([0, 3.5, 5], looking at the origin, ~35° downward tilt) — a flat
// world-Y range would drift wildly off-center across this scene's huge
// Z spread, so each cube's travel is anchored to this line instead.
const SIGHT_SLOPE = 0.7
const TOP_OFFSET = 4     // above sight line — top half of screen (full exhale)
const BOTTOM_OFFSET = 4  // below sight line — bottom half of screen (full inhale)
const OFFSET_JITTER = 1  // per-cube variation so cubes don't all travel identically

const PULSE_WIDTH = 0.1          // fraction of travel over which the pulse ramps
const PULSE_OPACITY_BOOST = 0.07 // extra opacity at the extremes (both top and bottom)
const PULSE_EMISSIVE_BOOST = 0.6 // extra emissiveIntensity at the extremes

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}

// Peaks at t=0 (full inhale) and t=1 (full exhale), 0 in the middle of the travel.
function pulseFactor(t) {
  const d = Math.min(t, 1 - t)
  return 1 - smoothstep(Math.min(d / PULSE_WIDTH, 1))
}

export default function BackgroundA({ gateColor, emissiveColor, breathPhaseRef, gatesEnabledRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef }) {
  const positions = useMemo(() => {
    const pts = []
    for (let i = 0; i < COUNT; i++) {
      const x = Math.random() * 16 - 8
      const z = Math.random() * 35 - 30
      const sightY = SIGHT_SLOPE * z
      const topY = sightY + TOP_OFFSET + (Math.random() * 2 - 1) * OFFSET_JITTER
      const bottomY = sightY - BOTTOM_OFFSET - (Math.random() * 2 - 1) * OFFSET_JITTER
      pts.push([x, topY, z, bottomY])
    }
    return pts
  }, [])

  const meshRefs = useRef([])
  const matRefs = useRef([])
  const progressRef = useRef(0)

  useFrame((_, delta) => {
    const gatesActive = gatesEnabledRef?.current ?? false
    const target = gatesActive && breathPhaseRef?.current === 'exhale' ? 1 : 0
    const inhale = inhaleSecondsRef?.current
    const exhale = exhaleSecondsRef?.current
    const hasSplit = inhale != null && exhale != null
    const fallback = (spawnIntervalRef?.current ?? 6) / 2
    const halfInterval = target === 1 ? (hasSplit ? exhale : fallback) : (hasSplit ? inhale : fallback)
    const dir = target > progressRef.current ? 1 : -1
    progressRef.current = THREE.MathUtils.clamp(progressRef.current + dir * delta / halfInterval, 0, 1)
    const t = smoothstep(progressRef.current)
    const pulse = pulseFactor(t)

    for (let i = 0; i < COUNT; i++) {
      const mesh = meshRefs.current[i]
      const mat = matRefs.current[i]
      if (!mesh || !mat) continue
      const [, topY, , bottomY] = positions[i]
      mesh.position.y = THREE.MathUtils.lerp(bottomY, topY, t)
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
          position={[pos[0], pos[3], pos[2]]}
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
