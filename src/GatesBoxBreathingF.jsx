import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGateBurstB, isSuccess, missFactor, CUBE_INHALE_MAX_ABS_X } from './gateReactionsB'
import { makeCloud, applyCloud, sampleCloudSurface, cloudMaxAbsX, createCloudMaterial, applyCloudLook, CLOUD_MESH_COUNT, FADE_OUT_S, CLOUD_BURST_SIZE, randomCloudX } from './cloudShapeF'

// Shape F (Hot Air Balloon), Box Breathing: cloud gates with
// GatesBoxBreathingB's series timing -- N (= interval seconds) clouds per
// phase, spawned together from SPAWN_Z back, evenly spaced; the last one
// spawns the next series as it reaches z = 0. Each cloud is judged at z = 0
// (hit: emissive pulse + particle burst; miss: emissive ramps to 0), then
// fades out over FADE_OUT_S.
const POOL_SIZE = 28
const SPAWN_Z = -6
const DESPAWN_Z = 6
const EXHALE_Y = 8
const INHALE_Y = -4

function makeSlot() {
  return { active: false, x: 0, type: 'inhale', z: 0, speed: 0, isFirst: false, isLast: false, fadeElapsed: 0, judgedElapsed: null, missElapsed: null, hasTriggeredFirst: false, hasPreTriggeredLast: false, cloud: makeCloud() }
}

export default function GatesBoxBreathingF({ gatesEnabledRef, spawnIntervalRef, palette, onFirstGate, onLastGate, rightVal, livePaletteRef, boxProgressRef }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const groupRefs = useRef([])
  const meshRefs = useRef(Array.from({ length: POOL_SIZE }, () => []))
  const wasEnabled = useRef(false)

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 32, 16), [])
  const materials = useMemo(() => Array.from({ length: POOL_SIZE }, () => createCloudMaterial(palette)), [palette])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  const gateBurst = useGateBurstB(palette.primaryColor, CLOUD_BURST_SIZE)

  // Paced breath progress for the 5-breath count (boxProgressRef, same
  // meaning as GatesBoxBreathingB's).
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
      for (let n = 0; n < N; n++) {
        const i = ss.findIndex((s) => !s.active)
        if (i === -1) continue
        const s = ss[i]
        Object.assign(s, makeSlot(), { active: true, type, z: SPAWN_Z - n * spacing, speed, isFirst: n === 0, isLast: n === N - 1, x: randomCloudX() })
        applyCloud(meshRefs.current[i], s.cloud)
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

        const y = s.type === 'exhale' ? EXHALE_Y : INHALE_Y
        if (s.z >= 0 && s.judgedElapsed == null) {
          s.judgedElapsed = 0
          if (s.isLast) spawnSeries(s.type === 'inhale' ? 'exhale' : 'inhale')
          if (s.isFirst && s.type === seriesRef.current.type) seriesRef.current.arrived = true
          if (rightVal && isSuccess(s.type, rightVal.current)) {
            const z = s.z
          const maxX = cloudMaxAbsX(s.cloud)
            gateBurst.burstFrom(() => {
              const p = sampleCloudSurface(s.cloud)
              return [p[0] + s.x, p[1] + y, p[2] + z]
            }, maxX, now, maxX / CUBE_INHALE_MAX_ABS_X, s.x)   // speed scaled to the cloud's size
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
        g.position.set(s.x, y, s.z)
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
          {Array.from({ length: CLOUD_MESH_COUNT }, (_, k) => (
            <mesh key={k} ref={(el) => { meshRefs.current[i][k] = el }} geometry={geometry} material={materials[i]} />
          ))}
        </group>
      ))}
    </>
  )
}
