import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const POOL_SIZE = 6
const SPAWN_Z = -20
const DESPAWN_Z = 6
const GATE_Y = 0.25
const FADE_DURATION = 1.0
const TORUS_ARGS = [1.0, 0.06, 16, 64]
const INHALE_SCALE = [0.734, 1.954, 1]
const EXHALE_SCALE = [1.229, 0.245, 1]
// Spans the 20-unit gap between paired gates: 20 / (tube_diameter = 2 * 0.06)
const TUNNEL_Z_SCALE = 20 / (2 * 0.06)

// phase 0: I1 (inhale, no tunnel)
// phase 1: I2 (inhale, owns inhale tunnel)
// phase 2: E1 (exhale, no tunnel)
// phase 3: E2 (exhale, owns exhale tunnel)

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

function calcEmissive(z) {
  if (z < -3) return 0
  if (z < -0.5) return smoothstep((z + 3) / 2.5)
  if (z < 0) return 1 + smoothstep((z + 0.5) / 0.5)
  return 2
}

function makeSlot() {
  return { z: 0, speed: 0, active: false, phase: 0, fadeElapsed: 0, hasTriggeredNext: false }
}

export default function GatesBoxBreathing({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const wasEnabled = useRef(false)

  const groupRefs = useRef([])
  const gateMeshRefs = useRef([])
  const gateMatRefs = useRef([])
  const tunnelMeshRefs = useRef([])
  const tunnelMatRefs = useRef([])

  useFrame((_, delta) => {
    const ss = slots.current
    const enabled = gatesEnabledRef.current

    function spawn(phase) {
      const idx = ss.findIndex(s => !s.active)
      if (idx === -1) return
      const s = ss[idx]
      s.z = SPAWN_Z
      s.speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      s.active = true
      s.phase = phase
      s.fadeElapsed = 0
      s.hasTriggeredNext = false
    }

    if (!enabled) {
      wasEnabled.current = false
      return
    }

    if (!wasEnabled.current) {
      spawn(0)
    }
    wasEnabled.current = true

    for (let i = 0; i < POOL_SIZE; i++) {
      const s = ss[i]
      const g = groupRefs.current[i]
      const gm = gateMeshRefs.current[i]
      const mat = gateMatRefs.current[i]
      const tm = tunnelMeshRefs.current[i]
      const tmat = tunnelMatRefs.current[i]

      if (!g || !gm || !mat || !tm || !tmat) continue

      if (!s.active) {
        g.position.z = 1000
        tm.visible = false
        continue
      }

      s.z += s.speed * delta
      s.fadeElapsed += delta

      if (s.z > DESPAWN_Z) {
        s.active = false
        g.position.z = 1000
        tm.visible = false
        continue
      }

      if (s.z >= 0 && !s.hasTriggeredNext) {
        s.hasTriggeredNext = true
        spawn((s.phase + 1) % 4)
      }

      const fadeIn = smoothstep(Math.min(s.fadeElapsed / FADE_DURATION, 1))
      const fadeOut = s.z > 0 ? 1 - smoothstep(Math.min(s.z / 2, 1)) : 1
      const opacity = fadeIn * fadeOut

      const isInhale = s.phase < 2
      const hasTunnel = s.phase === 1 || s.phase === 3
      const scale = isInhale ? INHALE_SCALE : EXHALE_SCALE

      g.position.z = s.z
      gm.scale.set(scale[0], scale[1], 1)
      mat.opacity = opacity
      mat.emissiveIntensity = calcEmissive(s.z)

      tm.visible = hasTunnel
      if (hasTunnel) {
        tm.scale.set(scale[0], scale[1], TUNNEL_Z_SCALE)
        tmat.opacity = opacity * 0.25
      }
    }
  })

  return (
    <>
      {Array.from({ length: POOL_SIZE }).map((_, i) => (
        <group key={i} ref={el => { groupRefs.current[i] = el }}>
          <mesh ref={el => { gateMeshRefs.current[i] = el }} position={[0, GATE_Y, 0]}>
            <torusGeometry args={TORUS_ARGS} />
            <meshStandardMaterial
              ref={el => { gateMatRefs.current[i] = el }}
              color={gateColor}
              emissive={emissiveColor}
              transparent
              depthWrite={false}
              opacity={0}
            />
          </mesh>
          <mesh ref={el => { tunnelMeshRefs.current[i] = el }} position={[0, GATE_Y, 10]} visible={false}>
            <torusGeometry args={TORUS_ARGS} />
            <meshStandardMaterial
              ref={el => { tunnelMatRefs.current[i] = el }}
              color={gateColor}
              transparent
              depthWrite={false}
              emissiveIntensity={0}
              opacity={0}
            />
          </mesh>
        </group>
      ))}
    </>
  )
}
