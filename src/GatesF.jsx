import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGateBurstB, isSuccess, missFactor } from './gateReactionsB'
import { makeCloud, applyCloud, sampleCloudSurface, cloudMaxAbsX, createCloudMaterial, applyCloudLook, CLOUD_MESH_COUNT, FADE_OUT_S } from './cloudShapeF'

// Shape F (Hot Air Balloon), Slowing Down / Paced: cloud gates with GatesB's
// timing (no ties). Exhale clouds spawn at SPAWN_Z every interval; each one
// spawns an Inhale cloud farther back (computeGateBZ), hidden until
// GATE_B_FADE_Z. Each cloud is judged at z = 0 (hit: emissive pulse + particle
// burst; miss: emissive ramps to 0), then fades out over FADE_OUT_S.
const POOL_SIZE = 8
const SPAWN_Z = -20
const GATE_B_FADE_Z = -20
const DESPAWN_Z = 6
const EXHALE_Y = 8
const INHALE_Y = 0

// Same as GatesB: the Inhale cloud arrives `inhale` seconds after the Exhale
// cloud it spawns with (ratio 1.5 outside Slowing Down's ramp).
function computeGateBZ(inhaleSecondsRef, exhaleSecondsRef, spawnIntervalRef) {
  const inhale = inhaleSecondsRef?.current
  const exhale = exhaleSecondsRef?.current
  const P = spawnIntervalRef.current
  const ratio = (inhale != null && exhale != null && P > 0) ? 1 + inhale / P : 1.5
  return SPAWN_Z * ratio
}

function makeSlot() {
  return { active: false, type: 'exhale', z: 0, speed: 0, fadeElapsed: 0, judgedElapsed: null, missElapsed: null, cloud: makeCloud() }
}

export default function GatesF({ gatesEnabledRef, spawnIntervalRef, palette, breathPhaseRef, inhaleSecondsRef, exhaleSecondsRef, rightVal, livePaletteRef, paceProgressRef, startOnInhale = false }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const groupRefs = useRef([])
  const meshRefs = useRef(Array.from({ length: POOL_SIZE }, () => []))

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 32, 16), [])
  const materials = useMemo(() => Array.from({ length: POOL_SIZE }, () => createCloudMaterial(palette)), [palette])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  const gateBurst = useGateBurstB(palette.primaryColor)

  // Paced breath progress (paceProgressRef, 0 exhale -> 1 inhale): 1 as each
  // Inhale cloud passes, 0 as each Exhale cloud passes, ramping between them
  // over the next opposite cloud's exact arrival time.
  const paceRampRef = useRef({ from: 0, to: 0, start: 0, dur: 1 })
  const startPaceRamp = (type, now) => {
    const from = type === 'inhale' ? 1 : 0
    let next = null
    slots.current.forEach((o) => {
      if (o.active && o.type !== type && o.z < 0 && (!next || o.z > next.z)) next = o
    })
    paceRampRef.current = next
      ? { from, to: 1 - from, start: now, dur: Math.max(0.05, -next.z / next.speed) }
      : { from, to: from, start: now, dur: 1 }
  }

  const wasEnabled = useRef(false)

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime
    const live = livePaletteRef && livePaletteRef.current

    const spawn = (type, z, speed) => {
      const i = slots.current.findIndex((s) => !s.active)
      if (i === -1) return
      const s = slots.current[i]
      Object.assign(s, makeSlot(), { active: true, type, z, speed })
      applyCloud(meshRefs.current[i], s.cloud)
    }
    const spawnA = () => {
      const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      spawn('exhale', SPAWN_Z, speed)
      spawn('inhale', computeGateBZ(inhaleSecondsRef, exhaleSecondsRef, spawnIntervalRef), speed)
    }

    if (gatesEnabledRef.current && !wasEnabled.current) {
      wasEnabled.current = true
      spawnA()
      if (startOnInhale) {
        // Slowing Down: the paced cycle begins right on an Inhale, with an
        // extra Inhale cloud placed to arrive exactly inhaleSeconds later.
        if (breathPhaseRef) breathPhaseRef.current = 'inhale'
        const P = spawnIntervalRef.current
        const inhale = inhaleSecondsRef?.current ?? P / 2
        spawn('inhale', SPAWN_Z * (inhale / P), Math.abs(SPAWN_Z) / P)
        startPaceRamp('exhale', now)
      }
    }
    if (!gatesEnabledRef.current) wasEnabled.current = false

    slots.current.forEach((s, i) => {
      const group = groupRefs.current[i]
      if (!group) return
      if (!s.active) { group.visible = false; return }

      s.z += s.speed * delta

      if (s.z >= 0 && s.judgedElapsed == null) {
        s.judgedElapsed = 0
        if (breathPhaseRef) breathPhaseRef.current = s.type === 'exhale' ? 'inhale' : 'exhale'   // the phase to breathe next
        const y = s.type === 'exhale' ? EXHALE_Y : INHALE_Y
        if (rightVal && isSuccess(s.type, rightVal.current)) {
          const z = s.z
          gateBurst.burstFrom(() => {
            const p = sampleCloudSurface(s.cloud)
            return [p[0], p[1] + y, p[2] + z]
          }, cloudMaxAbsX(s.cloud), now)
        } else {
          s.missElapsed = 0
        }
        startPaceRamp(s.type, now)
        if (s.type === 'exhale') spawnA()
      } else if (s.judgedElapsed != null) {
        s.judgedElapsed += delta
      }

      if (s.z > DESPAWN_Z || (s.judgedElapsed != null && s.judgedElapsed >= FADE_OUT_S)) {
        s.active = false; group.visible = false; return
      }
      if (s.z < GATE_B_FADE_Z) { group.visible = false; return }

      s.fadeElapsed += delta
      if (s.missElapsed != null) s.missElapsed += delta
      applyCloudLook(materials[i], s.z, s.fadeElapsed, s.judgedElapsed, missFactor(s.missElapsed), live)
      group.position.set(0, s.type === 'exhale' ? EXHALE_Y : INHALE_Y, s.z)
      group.visible = true
    })

    if (paceProgressRef) {
      const r = paceRampRef.current
      paceProgressRef.current = THREE.MathUtils.lerp(r.from, r.to, Math.min(1, (now - r.start) / r.dur))
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
