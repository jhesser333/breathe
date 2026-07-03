import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'

const POOL_SIZE = 6
const TUNNEL_POOL_SIZE = 4
const SPAWN_Z = -20
const TUNNEL_SPAWN_Z = -30
const DESPAWN_Z = 6
const GATE_Y = 0.25
const FADE_DURATION = 1.0
const TUNNEL_FADE_OUT_DURATION = 2.0

const CUBE_ARGS = [0.5, 0.5, 0.5]
const CUBE_RADIUS = 0.1
const GATE_A_TOP_Y = 0.65   // exhale cubes (phase >= 2)
const GATE_A_BOT_Y = -0.15
const GATE_B_X = 0.9        // inhale cubes (phase < 2)
const TUNNEL_ARGS_PILLAR = [0.5, 0.5, 20]   // inhale tunnel: pillars stretched 20 units in Z
const TUNNEL_ARGS_BAR = [0.5, 0.5, 20]      // exhale tunnel: bars stretched 20 units in Z

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

export default function GatesBoxBreathingB({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const tunnelSlots = useRef(Array.from({ length: TUNNEL_POOL_SIZE }, makeTunnelSlot))
  const wasEnabled = useRef(false)

  // Gate refs: 4 meshes + 4 materials per slot
  const gateGroupRefs = useRef([])
  const plLRefs = useRef([]);    const plLMatRefs = useRef([])
  const plRRefs = useRef([]);    const plRMatRefs = useRef([])
  const cbTRefs = useRef([]);    const cbTMatRefs = useRef([])
  const cbBRefs = useRef([]);    const cbBMatRefs = useRef([])

  // Tunnel refs: 4 meshes + 4 materials per tunnel slot
  const tunnelGroupRefs = useRef([])
  const tPlLRefs = useRef([]);   const tPlLMatRefs = useRef([])
  const tPlRRefs = useRef([]);   const tPlRMatRefs = useRef([])
  const tCbTRefs = useRef([]);   const tCbTMatRefs = useRef([])
  const tCbBRefs = useRef([]);   const tCbBMatRefs = useRef([])

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

      const ml = plLRefs.current[i], mr = plRRefs.current[i]
      const mt = cbTRefs.current[i], mb = cbBRefs.current[i]
      const mml = plLMatRefs.current[i], mmr = plRMatRefs.current[i]
      const mmt = cbTMatRefs.current[i], mmb = cbBMatRefs.current[i]

      if (ml) ml.visible = isInhale
      if (mr) mr.visible = isInhale
      if (mt) mt.visible = !isInhale
      if (mb) mb.visible = !isInhale

      if (isInhale) {
        if (mml) { mml.opacity = opacity; mml.emissiveIntensity = emissive }
        if (mmr) { mmr.opacity = opacity; mmr.emissiveIntensity = emissive }
      } else {
        if (mmt) { mmt.opacity = opacity; mmt.emissiveIntensity = emissive }
        if (mmb) { mmb.opacity = opacity; mmb.emissiveIntensity = emissive }
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

      const tpl = tPlLRefs.current[i], tpr = tPlRRefs.current[i]
      const tct = tCbTRefs.current[i], tcb = tCbBRefs.current[i]
      const tplm = tPlLMatRefs.current[i], tprm = tPlRMatRefs.current[i]
      const tctm = tCbTMatRefs.current[i], tcbm = tCbBMatRefs.current[i]

      if (tpl) tpl.visible = isInhale
      if (tpr) tpr.visible = isInhale
      if (tct) tct.visible = !isInhale
      if (tcb) tcb.visible = !isInhale

      if (isInhale) {
        if (tplm) tplm.opacity = tunnelOpacity
        if (tprm) tprm.opacity = tunnelOpacity
      } else {
        if (tctm) tctm.opacity = tunnelOpacity
        if (tcbm) tcbm.opacity = tunnelOpacity
      }
    }
  })

  return (
    <>
      {Array.from({ length: POOL_SIZE }).map((_, i) => (
        <group key={i} ref={el => { gateGroupRefs.current[i] = el }}>
          {/* Inhale cubes: left and right pillars */}
          <RoundedBox ref={el => { plLRefs.current[i] = el }}
            args={CUBE_ARGS} radius={CUBE_RADIUS}
            position={[-GATE_B_X, GATE_Y, 0]} visible={false}>
            <meshStandardMaterial ref={el => { plLMatRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} transparent depthWrite={false} opacity={0} />
          </RoundedBox>
          <RoundedBox ref={el => { plRRefs.current[i] = el }}
            args={CUBE_ARGS} radius={CUBE_RADIUS}
            position={[GATE_B_X, GATE_Y, 0]} visible={false}>
            <meshStandardMaterial ref={el => { plRMatRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} transparent depthWrite={false} opacity={0} />
          </RoundedBox>
          {/* Exhale cubes: top and bottom bars */}
          <RoundedBox ref={el => { cbTRefs.current[i] = el }}
            args={CUBE_ARGS} radius={CUBE_RADIUS}
            position={[0, GATE_A_TOP_Y, 0]} visible={false}>
            <meshStandardMaterial ref={el => { cbTMatRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} transparent depthWrite={false} opacity={0} />
          </RoundedBox>
          <RoundedBox ref={el => { cbBRefs.current[i] = el }}
            args={CUBE_ARGS} radius={CUBE_RADIUS}
            position={[0, GATE_A_BOT_Y, 0]} visible={false}>
            <meshStandardMaterial ref={el => { cbBMatRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} transparent depthWrite={false} opacity={0} />
          </RoundedBox>
        </group>
      ))}
      {Array.from({ length: TUNNEL_POOL_SIZE }).map((_, i) => (
        <group key={`t${i}`} ref={el => { tunnelGroupRefs.current[i] = el }}>
          {/* Inhale tunnel: stretched pillars */}
          <RoundedBox ref={el => { tPlLRefs.current[i] = el }}
            args={TUNNEL_ARGS_PILLAR} radius={CUBE_RADIUS}
            position={[-GATE_B_X, GATE_Y, 0]} visible={false}>
            <meshStandardMaterial ref={el => { tPlLMatRefs.current[i] = el }}
              color={gateColor} transparent depthWrite={false} emissiveIntensity={0} opacity={0} />
          </RoundedBox>
          <RoundedBox ref={el => { tPlRRefs.current[i] = el }}
            args={TUNNEL_ARGS_PILLAR} radius={CUBE_RADIUS}
            position={[GATE_B_X, GATE_Y, 0]} visible={false}>
            <meshStandardMaterial ref={el => { tPlRMatRefs.current[i] = el }}
              color={gateColor} transparent depthWrite={false} emissiveIntensity={0} opacity={0} />
          </RoundedBox>
          {/* Exhale tunnel: stretched bars */}
          <RoundedBox ref={el => { tCbTRefs.current[i] = el }}
            args={TUNNEL_ARGS_BAR} radius={CUBE_RADIUS}
            position={[0, GATE_A_TOP_Y, 0]} visible={false}>
            <meshStandardMaterial ref={el => { tCbTMatRefs.current[i] = el }}
              color={gateColor} transparent depthWrite={false} emissiveIntensity={0} opacity={0} />
          </RoundedBox>
          <RoundedBox ref={el => { tCbBRefs.current[i] = el }}
            args={TUNNEL_ARGS_BAR} radius={CUBE_RADIUS}
            position={[0, GATE_A_BOT_Y, 0]} visible={false}>
            <meshStandardMaterial ref={el => { tCbBMatRefs.current[i] = el }}
              color={gateColor} transparent depthWrite={false} emissiveIntensity={0} opacity={0} />
          </RoundedBox>
        </group>
      ))}
    </>
  )
}
