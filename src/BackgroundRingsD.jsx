import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Continuous ring tunnel for Shape Option D, replacing BackgroundA's cubes.
// Unlike the Gates system, ring motion is NOT breath-paced -- it's a slow,
// constant conveyor-loop scroll toward the Morph, independent of breath
// timing. Material opacity stays flat at FLAT_ALPHA at all times; only the
// emissive glow ramps, via a plain smoothstep ease (no exaggerated start/end
// jumps), staggered by spatial position so it reads as a wave traveling
// along the tunnel rather than a lockstep flash: on inhale it sweeps from
// the far end toward the Morph, finishing at full inhale; on exhale it
// sweeps the opposite way, starting at the Morph/camera end and finishing
// (fully faded) at full exhale.

const RING_COUNT = 5            // exactly fits TUNNEL_FAR_Z..TUNNEL_NEAR_Z at 5-unit spacing, no extra headroom
const RING_SPACING = 5
const TUNNEL_FAR_Z = -20
const TUNNEL_NEAR_Z = 3          // recycle/disappear point
const RING_SPEED = 0.5          // slow constant scroll, units/sec -- independent of breath pace
const RING_Y = 0                // matches Option D's Morph, centered at true origin
const WAVE_SPAN = 0.35          // fraction of the inhale/exhale duration one ring's own fade occupies; the rest staggers across rings
const WAVE_EFFECT_ENABLED = true  // breath-paced emissive wave (opacity always stays flat)
const FLAT_ALPHA = 0.5          // constant material opacity, on or off

const BASE_RADIUS = 1.0
const BASE_TUBE = 0.06
const GATE_SCALE = [1.376, 1.955, 1]   // same clearance scale as GatesC/GatesBoxBreathingC's inhale torus

function smoothstep(t) {
  t = Math.max(0, Math.min(1, t))
  return t * t * (3 - 2 * t)
}

export default function BackgroundRingsD({ baseColor, emissiveColor, breathPhaseRef, gatesEnabledRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef }) {
  const startZs = useMemo(() => {
    const zs = []
    for (let i = 0; i < RING_COUNT; i++) zs.push(TUNNEL_FAR_Z + i * RING_SPACING)
    return zs
  }, [])

  const meshRefs = useRef([])
  const matRefs = useRef([])
  const zRef = useRef(startZs.slice())
  const progressRef = useRef(0)

  useFrame((_, delta) => {
    const gatesActive = gatesEnabledRef?.current ?? false
    const target = gatesActive && breathPhaseRef?.current === 'inhale' ? 1 : 0

    const inhale = inhaleSecondsRef?.current
    const exhale = exhaleSecondsRef?.current
    const hasSplit = inhale != null && exhale != null
    const fallback = (spawnIntervalRef?.current ?? 6) / 2
    const halfInterval = target === 1 ? (hasSplit ? inhale : fallback) : (hasSplit ? exhale : fallback)
    const dir = target > progressRef.current ? 1 : -1
    progressRef.current = THREE.MathUtils.clamp(progressRef.current + dir * delta / halfInterval, 0, 1)

    const tunnelLength = RING_COUNT * RING_SPACING
    const tunnelSpan = 0 - TUNNEL_FAR_Z

    for (let i = 0; i < RING_COUNT; i++) {
      const mesh = meshRefs.current[i]
      const mat = matRefs.current[i]
      if (!mesh || !mat) continue

      zRef.current[i] += RING_SPEED * delta
      if (zRef.current[i] > TUNNEL_NEAR_Z) zRef.current[i] -= tunnelLength

      mesh.position.z = zRef.current[i]

      const u = THREE.MathUtils.clamp((zRef.current[i] - TUNNEL_FAR_Z) / tunnelSpan, 0, 1)
      let wave
      if (target === 1) {
        const orderFraction = u
        const localRaw = THREE.MathUtils.clamp((progressRef.current - orderFraction * (1 - WAVE_SPAN)) / WAVE_SPAN, 0, 1)
        wave = smoothstep(localRaw)
      } else {
        const q = 1 - progressRef.current
        const orderFraction = 1 - u
        const localRaw = THREE.MathUtils.clamp((q - orderFraction * (1 - WAVE_SPAN)) / WAVE_SPAN, 0, 1)
        wave = 1 - smoothstep(localRaw)
      }

      mat.opacity = FLAT_ALPHA
      mat.emissiveIntensity = WAVE_EFFECT_ENABLED ? THREE.MathUtils.lerp(0, 1, wave) : 0
    }
  })

  return (
    <group>
      {startZs.map((z, i) => (
        <mesh
          key={i}
          ref={el => { meshRefs.current[i] = el }}
          position={[0, RING_Y, z]}
          scale={GATE_SCALE}
        >
          <torusGeometry args={[BASE_RADIUS, BASE_TUBE, 16, 64]} />
          <meshStandardMaterial
            ref={el => { matRefs.current[i] = el }}
            color={baseColor}
            emissive={emissiveColor}
            emissiveIntensity={0}
            roughness={0.5}
            metalness={0.1}
            transparent
            opacity={FLAT_ALPHA}
          />
        </mesh>
      ))}
    </group>
  )
}
