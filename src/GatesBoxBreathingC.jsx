import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const POOL_SIZE = 6
const TUNNEL_POOL_SIZE = 4
const SPAWN_Z = -20
const TUNNEL_SPAWN_Z = -10
const DESPAWN_Z = 6
const GATE_Y = 0.25
const FADE_DURATION = 1.0
const TUNNEL_FADE_OUT_DURATION = 2.0

const TORUS_ARGS = [1.0, 0.06, 16, 64]
const GATE_SCALE = [1.376, 1.955, 1]   // inhale torus (phases 0,1), from GatesC
const SPHERE_RADIUS = 0.25             // exhale sphere (phases 2,3)
const SPHERE_ARGS = [SPHERE_RADIUS, 16, 8]
const TUNNEL_Z_SCALE = 20 / (2 * 0.06)             // ≈ 166.67 — torus inhale tunnel
const EXHALE_TUNNEL_Z_SCALE = 20 / (2 * SPHERE_RADIUS)  // = 40 — sphere ellipsoid tunnel

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

export default function GatesBoxBreathingC({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const tunnelSlots = useRef(Array.from({ length: TUNNEL_POOL_SIZE }, makeTunnelSlot))
  const wasEnabled = useRef(false)

  const gateGroupRefs = useRef([])
  const torusMeshRefs = useRef([]);  const torusMatRefs = useRef([])
  const sphereMeshRefs = useRef([]); const sphereMatRefs = useRef([])

  const tunnelGroupRefs = useRef([])
  const tunnelTorusRefs = useRef([]);  const tunnelTorusMatRefs = useRef([])
  const tunnelSphereRefs = useRef([]); const tunnelSphereMatRefs = useRef([])

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
      if (!g) continue

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
      const opacity = fadeIn * fadeOut
      const emissive = calcEmissive(s.z)
      const isInhale = s.phase < 2

      g.position.z = s.z

      const tm = torusMeshRefs.current[i], tmat = torusMatRefs.current[i]
      const sm = sphereMeshRefs.current[i], smat = sphereMatRefs.current[i]

      if (tm) tm.visible = isInhale
      if (sm) sm.visible = !isInhale

      if (isInhale) {
        if (tmat) { tmat.opacity = opacity; tmat.emissiveIntensity = emissive }
      } else {
        if (smat) { smat.opacity = opacity; smat.emissiveIntensity = emissive }
      }
    }

    for (let i = 0; i < TUNNEL_POOL_SIZE; i++) {
      const t = ts[i]
      const tg = tunnelGroupRefs.current[i]
      if (!tg) continue

      if (!t.active) { tg.position.z = 1000; continue }

      t.z += t.speed * delta
      t.fadeElapsed += delta

      if (t.fadeElapsed > t.fadeOutDelay + 2.5) {
        t.active = false; tg.position.z = 1000; continue
      }

      const fadeIn = smoothstep(Math.min(t.fadeElapsed / FADE_DURATION, 1))
      const fadeOut = t.fadeElapsed < t.fadeOutDelay
        ? 1
        : 1 - smoothstep(Math.min((t.fadeElapsed - t.fadeOutDelay) / TUNNEL_FADE_OUT_DURATION, 1))
      const tunnelOpacity = fadeIn * fadeOut * 0.25
      const isInhale = t.type === 'inhale'

      tg.position.z = t.z

      const ttr = tunnelTorusRefs.current[i], ttrm = tunnelTorusMatRefs.current[i]
      const tsr = tunnelSphereRefs.current[i], tsrm = tunnelSphereMatRefs.current[i]

      if (ttr) ttr.visible = isInhale
      if (tsr) tsr.visible = !isInhale

      if (isInhale) {
        if (ttr) ttr.scale.set(GATE_SCALE[0], GATE_SCALE[1], TUNNEL_Z_SCALE)
        if (ttrm) ttrm.opacity = tunnelOpacity
      } else {
        if (tsr) tsr.scale.set(1, 1, EXHALE_TUNNEL_Z_SCALE)
        if (tsrm) tsrm.opacity = tunnelOpacity
      }
    }
  })

  return (
    <>
      {Array.from({ length: POOL_SIZE }).map((_, i) => (
        <group key={i} ref={el => { gateGroupRefs.current[i] = el }}>
          <mesh ref={el => { torusMeshRefs.current[i] = el }} position={[0, GATE_Y, 0]}
            scale={[GATE_SCALE[0], GATE_SCALE[1], 1]} visible={false}>
            <torusGeometry args={TORUS_ARGS} />
            <meshStandardMaterial ref={el => { torusMatRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} transparent depthWrite={false} opacity={0} />
          </mesh>
          <mesh ref={el => { sphereMeshRefs.current[i] = el }} position={[0, GATE_Y, 0]} visible={false}>
            <sphereGeometry args={SPHERE_ARGS} />
            <meshStandardMaterial ref={el => { sphereMatRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} transparent depthWrite={false} opacity={0} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: TUNNEL_POOL_SIZE }).map((_, i) => (
        <group key={`t${i}`} ref={el => { tunnelGroupRefs.current[i] = el }}>
          <mesh ref={el => { tunnelTorusRefs.current[i] = el }} position={[0, GATE_Y, 0]} visible={false}>
            <torusGeometry args={TORUS_ARGS} />
            <meshStandardMaterial ref={el => { tunnelTorusMatRefs.current[i] = el }}
              color={gateColor} transparent depthWrite={false} emissiveIntensity={0} opacity={0} />
          </mesh>
          <mesh ref={el => { tunnelSphereRefs.current[i] = el }} position={[0, GATE_Y, 0]} visible={false}>
            <sphereGeometry args={SPHERE_ARGS} />
            <meshStandardMaterial ref={el => { tunnelSphereMatRefs.current[i] = el }}
              color={gateColor} transparent depthWrite={false} emissiveIntensity={0} opacity={0} />
          </mesh>
        </group>
      ))}
    </>
  )
}
