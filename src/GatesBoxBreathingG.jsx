import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { BOX_COUNTS } from './breathPace'
import * as THREE from 'three'
import { useGateBurstB, missFactor } from './gateReactionsB'
import { applyCloud, createCloudMaterial, applyCloudLook, CLOUD_MESH_COUNT, FADE_OUT_S, CLOUD_BURST_SIZE } from './cloudShapeF'
import { planeLimits, makePlaneGate, hitsPlane, sampleGateSurface, applyPlaneGate } from './planeCloudsG'

// Shape G (Paper Airplane), Box Breathing: cloud gates with
// GatesBoxBreathingF's series timing -- BOX_COUNTS gates per phase, spawned
// together from SPAWN_Z back, evenly spaced; the last one spawns the next
// series as it reaches z = 0. A gate is a big cloud (bottom for Exhale, top
// for Inhale) plus a side cloud; every gate in a series blocks the same side.
// Judged at z = 0 by collision with the plane (planePosRef): clear = particle
// burst, hit = emissive ramps to 0. Then it fades out over FADE_OUT_S.
const POOL_SIZE = 28
const SPAWN_Z = -6
const DESPAWN_Z = 6

function makeSlot() {
  return { active: false, type: 'inhale', z: 0, speed: 0, isFirst: false, isLast: false, fadeElapsed: 0, judgedElapsed: null, missElapsed: null, hasTriggeredFirst: false, hasPreTriggeredLast: false, gate: null }
}

export default function GatesBoxBreathingG({ gatesEnabledRef, spawnIntervalRef, palette, onFirstGate, onLastGate, planePosRef, livePaletteRef, boxProgressRef }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const groupRefs = useRef([])
  const partRefs = useRef(Array.from({ length: POOL_SIZE }, () => ({ main: null, side: null })))
  const meshRefs = useRef(Array.from({ length: POOL_SIZE }, () => ({ main: [], side: [] })))
  const wasEnabled = useRef(false)

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 32, 16), [])
  const materials = useMemo(() => Array.from({ length: POOL_SIZE }, () => createCloudMaterial(palette)), [palette])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  const gateBurst = useGateBurstB(palette.primaryColor, CLOUD_BURST_SIZE)

  // Paced breath progress (boxProgressRef, same meaning as GatesBoxBreathingB's).
  const seriesRef = useRef({ type: 'inhale', spawnTime: 0, interval: 1, arrived: true })

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime
    const live = livePaletteRef && livePaletteRef.current
    const ss = slots.current
    const enabled = gatesEnabledRef.current
    const limits = planeLimits(state.camera, state.size)

    function spawnSeries(type) {
      const N = BOX_COUNTS   // counts per step, spread over the step's interval
      const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      const spacing = N > 1 ? Math.abs(SPAWN_Z) / (N - 1) : 0
      const side = Math.random() < 0.5 ? -1 : 1   // one side for the whole series
      seriesRef.current = { type, spawnTime: now, interval: spawnIntervalRef.current, arrived: false }
      for (let n = 0; n < N; n++) {
        const i = ss.findIndex((s) => !s.active)
        if (i === -1) continue
        const s = ss[i]
        const gate = makePlaneGate(type, side, limits)
        Object.assign(s, makeSlot(), { active: true, type, z: SPAWN_Z - n * spacing, speed, isFirst: n === 0, isLast: n === N - 1, gate })
        const parts = partRefs.current[i]
        if (parts.main && parts.side) applyPlaneGate(parts.main, parts.side, gate)
        applyCloud(meshRefs.current[i].main, gate.main.cloud)
        applyCloud(meshRefs.current[i].side, gate.side.cloud)
      }
    }

    if (!enabled) wasEnabled.current = false

    if (enabled) {
      if (!wasEnabled.current) spawnSeries('inhale')
      wasEnabled.current = true

      for (let i = 0; i < POOL_SIZE; i++) {
        const s = ss[i]
        const g = groupRefs.current[i]
        if (!g) continue
        if (!s.active) { g.visible = false; continue }

        s.z += s.speed * delta
        s.fadeElapsed += delta

        const leadZ = s.speed * 2
        if (s.z >= -leadZ && s.isFirst && !s.hasTriggeredFirst) {
          s.hasTriggeredFirst = true
          onFirstGate?.(s.type)
        }
        if (s.z >= -leadZ && s.isLast && !s.hasPreTriggeredLast) {
          s.hasPreTriggeredLast = true
          onLastGate?.(s.type)
        }

        if (s.z >= 0 && s.judgedElapsed == null) {
          s.judgedElapsed = 0
          if (s.isLast) spawnSeries(s.type === 'inhale' ? 'exhale' : 'inhale')
          if (s.isFirst && s.type === seriesRef.current.type) seriesRef.current.arrived = true
          const pos = planePosRef?.current
          if (pos && !hitsPlane(s.gate, pos.x, pos.y)) {
            const z = s.z
            gateBurst.burstFrom(() => sampleGateSurface(s.gate, z), limits.halfW, now)
          } else {
            s.missElapsed = 0
          }
        } else if (s.judgedElapsed != null) {
          s.judgedElapsed += delta
        }

        if (s.z > DESPAWN_Z || (s.judgedElapsed != null && s.judgedElapsed >= FADE_OUT_S)) {
          s.active = false; g.visible = false; continue
        }

        if (s.missElapsed != null) s.missElapsed += delta
        applyCloudLook(materials[i], s.z, s.fadeElapsed, s.judgedElapsed, missFactor(s.missElapsed), live)
        g.position.set(0, 0, s.z)
        g.visible = true
      }
    } else {
      groupRefs.current.forEach((g) => { if (g) g.visible = false })
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
      {Array.from({ length: POOL_SIZE }, (_, i) => (
        <group key={i} ref={(el) => { groupRefs.current[i] = el }} visible={false}>
          {['main', 'side'].map((part) => (
            <group key={part} ref={(el) => { partRefs.current[i][part] = el }}>
              {Array.from({ length: CLOUD_MESH_COUNT }, (_, k) => (
                <mesh key={k} ref={(el) => { meshRefs.current[i][part][k] = el }} geometry={geometry} material={materials[i]} />
              ))}
            </group>
          ))}
        </group>
      ))}
    </>
  )
}
