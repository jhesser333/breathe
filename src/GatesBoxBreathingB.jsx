import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import { useGateBurstB, isSuccess, missFactor, applyMissScale } from './gateReactionsB'
import { createCubeMorphMaterial, gateLookT, applyGateLook } from './cubeMaterialB'

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
// These targets' own pulse look (glossy, like GatesB's; no metalness).
const BOX_GATE_LOOK = { roughness: 0, metalness: 0 }

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

// Ramps 0 -> 1 from the target's own spawn z to just before the Morph, then
// pulses 1 -> 2 at z=0. Targets stay fully visible until DESPAWN_Z, which is
// past the bottom of the screen.
function calcEmissive(z, spawnZ) {
  if (z < -0.5) return smoothstep((z - spawnZ) / (-0.5 - spawnZ))
  if (z < 0) return 1 + smoothstep((z + 0.5) / 0.5)
  return 2
}

function makeSlot() {
  return { z: 0, speed: 0, active: false, type: 'inhale', isLast: false, isFirst: false, spawnZ: 0, fadeElapsed: 0, hasTriggeredNext: false, hasTriggeredFirst: false, hasPreTriggeredLast: false, judged: false, missElapsed: null }
}

export default function GatesBoxBreathingB({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor, onFirstGate, onLastGate, rightVal, livePaletteRef, boxProgressRef }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const wasEnabled = useRef(false)

  const gateGroupRefs = useRef([])
  const plLRefs = useRef([])
  const plRRefs = useRef([])
  const cbTRefs = useRef([])
  const cbBRefs = useRef([])
  // Cube Morph material per target cube (Exhale look until the pulse -- see
  // cubeMaterialB); no depth write, as before.
  const makeMats = () => Array.from({ length: POOL_SIZE }, () => {
    const m = createCubeMorphMaterial(gateColor, emissiveColor)
    m.material.depthWrite = false
    return m
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plLMats = useMemo(makeMats, [gateColor, emissiveColor])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plRMats = useMemo(makeMats, [gateColor, emissiveColor])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cbTMats = useMemo(makeMats, [gateColor, emissiveColor])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cbBMats = useMemo(makeMats, [gateColor, emissiveColor])

  // Success/miss reactions as each target reaches the Morph.
  const gateBurst = useGateBurstB(emissiveColor)

  // Paced breath progress for the 5-breath count (boxProgressRef, same
  // meaning as GatesBoxBreathingD's): each series' approach is a movement
  // phase (Inhale 0->1, Exhale 1->0) and its crossing is the following Hold.
  const seriesRef = useRef({ type: 'inhale', spawnTime: 0, interval: 1, arrived: true })

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime
    const live = livePaletteRef && livePaletteRef.current
    const ss = slots.current
    const enabled = gatesEnabledRef.current

    function spawnSeries(type) {
      const N = Math.max(1, Math.round(spawnIntervalRef.current))
      const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      const spacing = N > 1 ? Math.abs(SPAWN_Z) / (N - 1) : 0
      seriesRef.current = { type, spawnTime: now, interval: spawnIntervalRef.current, arrived: false }
      for (let i = 0; i < N; i++) {
        const spawnZ = SPAWN_Z - i * spacing
        const idx = ss.findIndex(s => !s.active)
        if (idx === -1) continue
        const s = ss[idx]
        s.z = spawnZ; s.spawnZ = spawnZ; s.speed = speed; s.active = true
        s.type = type; s.isLast = (i === N - 1); s.isFirst = (i === 0)
        s.fadeElapsed = 0; s.hasTriggeredNext = false; s.hasTriggeredFirst = false; s.hasPreTriggeredLast = false
        s.judged = false; s.missElapsed = null
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
        if (s.z >= 0 && s.isFirst && s.type === seriesRef.current.type) seriesRef.current.arrived = true
        if (s.z >= 0 && !s.judged) {
          s.judged = true
          if (rightVal && isSuccess(s.type, rightVal.current)) gateBurst.burst(s.type, s.z, now)
          else s.missElapsed = 0
        }
        if (s.missElapsed != null) s.missElapsed += delta
        const miss = missFactor(s.missElapsed)

        const fadeIn = smoothstep(Math.min(s.fadeElapsed / FADE_DURATION, 1))
        const emissive = calcEmissive(s.z, s.spawnZ) * (1 - miss)
        const isInhale = s.type === 'inhale'

        g.position.z = s.z

        const ml = plLRefs.current[i], mr = plRRefs.current[i]
        const mt = cbTRefs.current[i], mb = cbBRefs.current[i]

        if (ml) ml.visible = isInhale
        if (mr) mr.visible = isInhale
        if (mt) mt.visible = !isInhale
        if (mb) mb.visible = !isInhale
        applyMissScale(ml, miss); applyMissScale(mr, miss)
        applyMissScale(mt, miss); applyMissScale(mb, miss)

        const lookT = gateLookT(s.z)
        const pair = isInhale ? [plLMats[i], plRMats[i]] : [cbTMats[i], cbBMats[i]]
        pair.forEach((m) => applyGateLook(m, lookT, fadeIn, emissive, live, BOX_GATE_LOOK))
      }
    }
    if (boxProgressRef) {
      const sr = seriesRef.current
      const p = sr.arrived ? 1 : Math.min(1, (now - sr.spawnTime) / sr.interval)
      boxProgressRef.current = !enabled ? 0 : sr.type === 'inhale' ? p : 1 - p
    }

    gateBurst.tick(now, livePaletteRef)
  })

  return (
    <>
      {gateBurst.points}
      {Array.from({ length: POOL_SIZE }).map((_, i) => (
        <group key={i} ref={el => { gateGroupRefs.current[i] = el }}>
          <RoundedBox ref={el => { plLRefs.current[i] = el }}
            args={CUBE_ARGS} radius={CUBE_RADIUS}
            position={[-GATE_B_X, GATE_Y, 0]} visible={false}>
            <primitive object={plLMats[i].material} attach="material" />
          </RoundedBox>
          <RoundedBox ref={el => { plRRefs.current[i] = el }}
            args={CUBE_ARGS} radius={CUBE_RADIUS}
            position={[GATE_B_X, GATE_Y, 0]} visible={false}>
            <primitive object={plRMats[i].material} attach="material" />
          </RoundedBox>
          <RoundedBox ref={el => { cbTRefs.current[i] = el }}
            args={CUBE_ARGS} radius={CUBE_RADIUS}
            position={[0, GATE_A_TOP_Y, 0]} visible={false}>
            <primitive object={cbTMats[i].material} attach="material" />
          </RoundedBox>
          <RoundedBox ref={el => { cbBRefs.current[i] = el }}
            args={CUBE_ARGS} radius={CUBE_RADIUS}
            position={[0, GATE_A_BOT_Y, 0]} visible={false}>
            <primitive object={cbBMats[i].material} attach="material" />
          </RoundedBox>
        </group>
      ))}
    </>
  )
}
