import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const POOL_SIZE = 28
const SPAWN_Z = -6
const DESPAWN_Z = 6
const GATE_Y = 0.25
const FADE_DURATION = 1.0
const TORUS_ARGS = [1.0, 0.06, 16, 64]
const INHALE_SCALE = [0.734, 1.954, 1]
const EXHALE_SCALE = [1.229, 0.245, 1]

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
  return { z: 0, speed: 0, active: false, type: 'inhale', isLast: false, isFirst: false, fadeElapsed: 0, hasTriggeredNext: false, hasTriggeredFirst: false, hasPreTriggeredLast: false }
}

export default function GatesBoxBreathingA({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor, onFirstGate, onLastGate }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const wasEnabled = useRef(false)

  const gateGroupRefs = useRef([])
  const gateMeshRefs = useRef([])
  const gateMatRefs = useRef([])

  useFrame((_, delta) => {
    const ss = slots.current
    const enabled = gatesEnabledRef.current

    function spawnSeries(type) {
      const N = Math.max(1, Math.round(spawnIntervalRef.current))
      const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      const spacing = N > 1 ? Math.abs(SPAWN_Z) / (N - 1) : 0
      for (let i = 0; i < N; i++) {
        const spawnZ = SPAWN_Z - i * spacing
        const idx = ss.findIndex(s => !s.active)
        if (idx === -1) continue
        const s = ss[idx]
        s.z = spawnZ; s.speed = speed; s.active = true
        s.type = type; s.isLast = (i === N - 1); s.isFirst = (i === 0)
        s.fadeElapsed = 0; s.hasTriggeredNext = false; s.hasTriggeredFirst = false; s.hasPreTriggeredLast = false
      }
    }

    if (!enabled) {
      wasEnabled.current = false
    }

    if (enabled) {
      if (!wasEnabled.current) {
        spawnSeries('inhale')
      }
      wasEnabled.current = true

      for (let i = 0; i < POOL_SIZE; i++) {
        const s = ss[i]
        const g = gateGroupRefs.current[i]
        const gm = gateMeshRefs.current[i]
        const mat = gateMatRefs.current[i]
        if (!g || !gm || !mat) continue

        if (!s.active) { g.position.z = 1000; continue }

        s.z += s.speed * delta
        s.fadeElapsed += delta

        if (s.z > DESPAWN_Z) { s.active = false; g.position.z = 1000; continue }

        const leadZ = s.speed * 2
        if (s.z >= -leadZ && s.isFirst && !s.hasTriggeredFirst) {
          s.hasTriggeredFirst = true
          onFirstGate?.(s.type)
        }
        if (s.z >= -leadZ && s.isLast && !s.hasPreTriggeredLast) {
          s.hasPreTriggeredLast = true
          onLastGate?.(s.type)
        }
        if (s.z >= 0 && !s.hasTriggeredNext && s.isLast) {
          s.hasTriggeredNext = true
          spawnSeries(s.type === 'inhale' ? 'exhale' : 'inhale')
        }

        const fadeIn = smoothstep(Math.min(s.fadeElapsed / FADE_DURATION, 1))
        const fadeOut = s.z > 0 ? 1 - smoothstep(Math.min(s.z / 2, 1)) : 1
        const scale = s.type === 'inhale' ? INHALE_SCALE : EXHALE_SCALE

        g.position.z = s.z
        gm.scale.set(scale[0], scale[1], 1)
        mat.opacity = fadeIn * fadeOut
        mat.emissiveIntensity = calcEmissive(s.z)
      }
    }
  })

  return (
    <>
      {Array.from({ length: POOL_SIZE }).map((_, i) => (
        <group key={i} ref={el => { gateGroupRefs.current[i] = el }}>
          <mesh ref={el => { gateMeshRefs.current[i] = el }} position={[0, GATE_Y, 0]}>
            <torusGeometry args={TORUS_ARGS} />
            <meshStandardMaterial ref={el => { gateMatRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} transparent depthWrite={false} opacity={0} />
          </mesh>
        </group>
      ))}
    </>
  )
}
