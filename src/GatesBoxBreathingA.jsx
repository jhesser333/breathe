import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const POOL_SIZE = 6
const TUNNEL_POOL_SIZE = 4
const SPAWN_Z = -20
const TUNNEL_SPAWN_Z = -10   // center 10 units behind I1; spans SPAWN_Z to z=0
const DESPAWN_Z = 6
const GATE_Y = 0.25
const FADE_DURATION = 1.0
const TUNNEL_FADE_OUT_DURATION = 2.0
const TORUS_ARGS = [1.0, 0.06, 16, 64]
const INHALE_SCALE = [0.734, 1.954, 1]
const EXHALE_SCALE = [1.229, 0.245, 1]
const TUNNEL_Z_SCALE = 20 / (2 * 0.06)  // ≈ 166.67

// phase 0: I1 (inhale)  phase 1: I2 (inhale)
// phase 2: E1 (exhale)  phase 3: E2 (exhale)

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
function makeTunnelSlot() {
  return { z: 0, speed: 0, active: false, type: 'inhale', fadeElapsed: 0, fadeOutDelay: 0 }
}

export default function GatesBoxBreathingA({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const tunnelSlots = useRef(Array.from({ length: TUNNEL_POOL_SIZE }, makeTunnelSlot))
  const wasEnabled = useRef(false)

  const gateGroupRefs = useRef([])
  const gateMeshRefs = useRef([])
  const gateMatRefs = useRef([])
  const tunnelGroupRefs = useRef([])
  const tunnelMeshRefs = useRef([])
  const tunnelMatRefs = useRef([])

  useFrame((_, delta) => {
    const ss = slots.current
    const ts = tunnelSlots.current
    const enabled = gatesEnabledRef.current

    function spawnTunnel(type) {
      const idx = ts.findIndex(t => !t.active)
      if (idx === -1) return
      const t = ts[idx]
      t.z = TUNNEL_SPAWN_Z
      t.speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      t.active = true
      t.type = type
      t.fadeElapsed = 0
      t.fadeOutDelay = 2 * spawnIntervalRef.current
    }

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
      if (phase === 0) spawnTunnel('inhale')
      if (phase === 2) spawnTunnel('exhale')
    }

    if (!enabled) { wasEnabled.current = false; return }
    if (!wasEnabled.current) spawn(0)
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

      if (s.z >= 0 && !s.hasTriggeredNext) {
        s.hasTriggeredNext = true
        spawn((s.phase + 1) % 4)
      }

      const fadeIn = smoothstep(Math.min(s.fadeElapsed / FADE_DURATION, 1))
      const fadeOut = s.z > 0 ? 1 - smoothstep(Math.min(s.z / 2, 1)) : 1
      const scale = s.phase < 2 ? INHALE_SCALE : EXHALE_SCALE

      g.position.z = s.z
      gm.scale.set(scale[0], scale[1], 1)
      mat.opacity = fadeIn * fadeOut
      mat.emissiveIntensity = calcEmissive(s.z)
    }

    for (let i = 0; i < TUNNEL_POOL_SIZE; i++) {
      const t = ts[i]
      const tg = tunnelGroupRefs.current[i]
      const tm = tunnelMeshRefs.current[i]
      const tmat = tunnelMatRefs.current[i]
      if (!tg || !tm || !tmat) continue

      if (!t.active) { tg.position.z = 1000; tm.visible = false; continue }

      t.z += t.speed * delta
      t.fadeElapsed += delta

      if (t.fadeElapsed > t.fadeOutDelay + 2.5) {
        t.active = false; tg.position.z = 1000; tm.visible = false; continue
      }

      const fadeIn = smoothstep(Math.min(t.fadeElapsed / FADE_DURATION, 1))
      const fadeOut = t.fadeElapsed < t.fadeOutDelay
        ? 1
        : 1 - smoothstep(Math.min((t.fadeElapsed - t.fadeOutDelay) / TUNNEL_FADE_OUT_DURATION, 1))
      const scale = t.type === 'inhale' ? INHALE_SCALE : EXHALE_SCALE

      tg.position.z = t.z
      tm.visible = true
      tm.scale.set(scale[0], scale[1], TUNNEL_Z_SCALE)
      tmat.opacity = fadeIn * fadeOut * 0.25
    }
  })

  return (
    <>
      {Array.from({ length: POOL_SIZE }).map((_, i) => (
        <group key={i} ref={el => { gateGroupRefs.current[i] = el }}>
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
        </group>
      ))}
      {Array.from({ length: TUNNEL_POOL_SIZE }).map((_, i) => (
        <group key={`t${i}`} ref={el => { tunnelGroupRefs.current[i] = el }}>
          <mesh ref={el => { tunnelMeshRefs.current[i] = el }} position={[0, GATE_Y, 0]} visible={false}>
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
