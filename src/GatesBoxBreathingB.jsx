import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'

const POOL_SIZE = 28
const SPAWN_Z = -6
const DESPAWN_Z = 6
const GATE_Y = 0.25
const FADE_DURATION = 1.0

const CUBE_ARGS = [0.5, 0.5, 0.5]
const CUBE_RADIUS = 0.1
const GATE_A_TOP_Y = 0.65
const GATE_A_BOT_Y = -0.15
const GATE_B_X = 0.9

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
  return { z: 0, speed: 0, active: false, type: 'inhale', isLast: false, isFirst: false, fadeElapsed: 0, hasTriggeredNext: false, hasTriggeredFirst: false }
}

export default function GatesBoxBreathingB({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor, onFirstGate, onLastGate }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const wasEnabled = useRef(false)

  const gateGroupRefs = useRef([])
  const plLRefs = useRef([]);    const plLMatRefs = useRef([])
  const plRRefs = useRef([]);    const plRMatRefs = useRef([])
  const cbTRefs = useRef([]);    const cbTMatRefs = useRef([])
  const cbBRefs = useRef([]);    const cbBMatRefs = useRef([])

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
        s.fadeElapsed = 0; s.hasTriggeredNext = false; s.hasTriggeredFirst = false
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
        if (!g) continue

        if (!s.active) { g.position.z = 1000; continue }

        s.z += s.speed * delta
        s.fadeElapsed += delta

        if (s.z > DESPAWN_Z) { s.active = false; g.position.z = 1000; continue }

        if (s.z >= 0 && s.isFirst && !s.hasTriggeredFirst) {
          s.hasTriggeredFirst = true
          onFirstGate?.(s.type)
        }
        if (s.z >= 0 && !s.hasTriggeredNext && s.isLast) {
          s.hasTriggeredNext = true
          onLastGate?.(s.type)
          spawnSeries(s.type === 'inhale' ? 'exhale' : 'inhale')
        }

        const fadeIn = smoothstep(Math.min(s.fadeElapsed / FADE_DURATION, 1))
        const fadeOut = s.z > 0 ? 1 - smoothstep(Math.min(s.z / 2, 1)) : 1
        const opacity = fadeIn * fadeOut
        const emissive = calcEmissive(s.z)
        const isInhale = s.type === 'inhale'

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
    }
  })

  return (
    <>
      {Array.from({ length: POOL_SIZE }).map((_, i) => (
        <group key={i} ref={el => { gateGroupRefs.current[i] = el }}>
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
    </>
  )
}
