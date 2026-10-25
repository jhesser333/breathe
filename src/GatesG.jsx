import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGateBurstB, missFactor } from './gateReactionsB'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { createCloudMaterial, applyCloudLook, FADE_OUT_S, CLOUD_BURST_SIZE } from './cloudShapeF'
import { planeLimits, makePlaneCubeGate, hitsPlaneCubes, sampleCubeGateSurface, CUBE_SIZE, BAR_SCALE_X, CUBE_RADIUS } from './planeCloudsG'

// Shape G (Paper Airplane), Slowing Down / Paced: rounded-cube gates with
// GatesF's timing. Exhale gates spawn at SPAWN_Z every interval; each one
// spawns an Inhale gate farther back (computeGateBZ), hidden until
// GATE_B_FADE_Z. A gate is a side cube on a random side, plus (Exhale gates
// only) a bar at the bottom (makePlaneCubeGate). Judged at z = 0 by collision with the plane
// (planePosRef): clear = particle burst, hit = emissive ramps to 0. Then it
// fades out over FADE_OUT_S.
const POOL_SIZE = 8
const SPAWN_Z = -20
const GATE_B_FADE_Z = -20
const DESPAWN_Z = 6

// Same as GatesB: the Inhale gate arrives `inhale` seconds after the Exhale
// gate it spawns with (ratio 1.5 outside Slowing Down's ramp).
function computeGateBZ(inhaleSecondsRef, exhaleSecondsRef, spawnIntervalRef) {
  const inhale = inhaleSecondsRef?.current
  const exhale = exhaleSecondsRef?.current
  const P = spawnIntervalRef.current
  const ratio = (inhale != null && exhale != null && P > 0) ? 1 + inhale / P : 1.5
  return SPAWN_Z * ratio
}

function makeSlot() {
  return { active: false, type: 'exhale', z: 0, speed: 0, fadeElapsed: 0, judgedElapsed: null, missElapsed: null, gate: null }
}

export default function GatesG({ gatesEnabledRef, spawnIntervalRef, palette, breathPhaseRef, inhaleSecondsRef, exhaleSecondsRef, planePosRef, livePaletteRef, paceProgressRef, startOnInhale = false }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const groupRefs = useRef([])
  const partRefs = useRef(Array.from({ length: POOL_SIZE }, () => ({ bar: null, side: null })))

  const barGeometry = useMemo(() => new RoundedBoxGeometry(CUBE_SIZE * BAR_SCALE_X, CUBE_SIZE, CUBE_SIZE, 4, CUBE_RADIUS), [])
  const cubeGeometry = useMemo(() => new RoundedBoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, 4, CUBE_RADIUS), [])
  const materials = useMemo(() => Array.from({ length: POOL_SIZE }, () => createCloudMaterial(palette)), [palette])
  useEffect(() => () => { barGeometry.dispose(); cubeGeometry.dispose() }, [barGeometry, cubeGeometry])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  const gateBurst = useGateBurstB(palette.primaryColor, CLOUD_BURST_SIZE)

  // Paced breath progress (paceProgressRef, 0 exhale -> 1 inhale): 1 as each
  // Inhale gate passes, 0 as each Exhale gate passes, ramping between them
  // over the next opposite gate's exact arrival time.
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
    const limits = planeLimits(state.camera, state.size)

    const spawn = (type, z, speed) => {
      const i = slots.current.findIndex((s) => !s.active)
      if (i === -1) return
      const s = slots.current[i]
      const gate = makePlaneCubeGate(type, Math.random() < 0.5 ? -1 : 1, limits)
      Object.assign(s, makeSlot(), { active: true, type, z, speed, gate })
      const parts = partRefs.current[i]
      if (parts.bar) { parts.bar.visible = !!gate.bar; if (gate.bar) parts.bar.position.set(gate.bar.x, gate.bar.y, 0) }
      if (parts.side) parts.side.position.set(gate.side.x, gate.side.y, 0)
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
        // extra Inhale gate placed to arrive exactly inhaleSeconds later.
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
        const pos = planePosRef?.current
        if (pos && !hitsPlaneCubes(s.gate, pos.x, pos.y)) {
          const z = s.z
          gateBurst.burstFrom(() => sampleCubeGateSurface(s.gate, z), limits.halfW, now)
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
      group.position.set(0, 0, s.z)
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
          <mesh ref={(el) => { partRefs.current[i].bar = el }} geometry={barGeometry} material={materials[i]} />
          <mesh ref={(el) => { partRefs.current[i].side = el }} geometry={cubeGeometry} material={materials[i]} />
        </group>
      ))}
    </>
  )
}
