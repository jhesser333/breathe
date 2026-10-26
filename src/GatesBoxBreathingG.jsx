import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { BOX_COUNTS } from './breathPace'
import * as THREE from 'three'
import { useGateBurstB, missFactor, applyMissScale, CUBE_INHALE_MAX_ABS_X } from './gateReactionsB'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  planeLimits, makePlaneCubeGate, ringContainsPlane, hitsPlaneBar, sampleRingSurface, isOffScreenBelow, barTopFront, ringTopFront,
  createPlaneGateMaterial, applyPlaneGateLook, CUBE_SIZE, CUBE_RADIUS, BAR_W, BAR_H, RING_R, RING_TUBE, RING_MAX_ABS_X,
} from './planeCloudsG'

// Shape G (Paper Airplane), Box Breathing: ring targets (plus a bar on
// Exhale gates) with GatesBoxBreathingF's series timing -- BOX_COUNTS gates
// per phase, spawned together from SPAWN_Z back, evenly spaced; the last one
// spawns the next series as it reaches z = 0. Every ring in a series is on
// the same side (makePlaneCubeGate).
// Judged at z = 0 against the plane (planePosRef), like the cube's targets:
// plane inside the ring = particle burst, else the ring's glow ramps to 0 and
// it shrinks; the plane touching the bar dims the bar. Each part keeps
// scrolling until it's off the bottom of the screen, then disappears.
const POOL_SIZE = 28
const SPAWN_Z = -6
const DESPAWN_Z = 10   // fallback; parts normally go once off the bottom of the screen

function makeSlot() {
  return { active: false, type: 'inhale', z: 0, speed: 0, isFirst: false, isLast: false, fadeElapsed: 0, judged: false, ringMissElapsed: null, barMissElapsed: null, ringGone: false, barGone: false, hasTriggeredFirst: false, hasPreTriggeredLast: false, gate: null }
}

export default function GatesBoxBreathingG({ gatesEnabledRef, spawnIntervalRef, palette, onFirstGate, onLastGate, planePosRef, livePaletteRef, boxProgressRef }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const groupRefs = useRef([])
  const partRefs = useRef(Array.from({ length: POOL_SIZE }, () => ({ bar: null, ring: null })))
  const wasEnabled = useRef(false)

  const barGeometry = useMemo(() => new RoundedBoxGeometry(BAR_W, BAR_H, CUBE_SIZE, 4, CUBE_RADIUS), [])
  const ringGeometry = useMemo(() => new THREE.TorusGeometry(RING_R, RING_TUBE, 16, 64), [])
  const barMaterials = useMemo(() => Array.from({ length: POOL_SIZE }, () => createPlaneGateMaterial(palette)), [palette])
  const ringMaterials = useMemo(() => Array.from({ length: POOL_SIZE }, () => createPlaneGateMaterial(palette)), [palette])
  useEffect(() => () => { barGeometry.dispose(); ringGeometry.dispose() }, [barGeometry, ringGeometry])
  useEffect(() => () => [...barMaterials, ...ringMaterials].forEach((m) => m.dispose()), [barMaterials, ringMaterials])

  const gateBurst = useGateBurstB(palette.primaryColor)

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
        const gate = makePlaneCubeGate(type, side, limits)
        Object.assign(s, makeSlot(), { active: true, type, z: SPAWN_Z - n * spacing, speed, isFirst: n === 0, isLast: n === N - 1, gate })
        const parts = partRefs.current[i]
        if (parts.bar && gate.bar) parts.bar.position.set(gate.bar.x, gate.bar.y, 0)
        if (parts.ring) { parts.ring.position.set(gate.ring.x, gate.ring.y, 0); parts.ring.scale.set(1, 1, 1) }
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

        const parts = partRefs.current[i]
        const { bar, ring } = s.gate
        if (s.z >= 0 && !s.judged) {
          s.judged = true
          if (s.isLast) spawnSeries(s.type === 'inhale' ? 'exhale' : 'inhale')
          if (s.isFirst && s.type === seriesRef.current.type) seriesRef.current.arrived = true
          const pos = planePosRef?.current
          if (pos && ringContainsPlane(ring, pos.x, pos.y)) {
            const z = s.z
            gateBurst.burstFrom(() => sampleRingSurface(ring, z), RING_MAX_ABS_X, now, RING_MAX_ABS_X / CUBE_INHALE_MAX_ABS_X, ring.x)
          } else {
            s.ringMissElapsed = 0
          }
          if (pos && hitsPlaneBar(bar, pos.x, pos.y)) s.barMissElapsed = 0
        }

        // Past the plane, each part stays until it's off the bottom of the screen.
        if (s.judged) {
          if (!s.barGone) s.barGone = !bar || isOffScreenBelow(state.camera, ...barTopFront(bar, s.z))
          if (!s.ringGone) s.ringGone = isOffScreenBelow(state.camera, ...ringTopFront(ring, s.z))
        }
        if (s.z > DESPAWN_Z || (s.barGone && s.ringGone)) {
          s.active = false; g.visible = false; continue
        }

        if (s.ringMissElapsed != null) s.ringMissElapsed += delta
        if (s.barMissElapsed != null) s.barMissElapsed += delta
        const ringMiss = missFactor(s.ringMissElapsed)
        applyPlaneGateLook(ringMaterials[i], s.z, s.fadeElapsed, ringMiss, live)
        applyPlaneGateLook(barMaterials[i], s.z, s.fadeElapsed, missFactor(s.barMissElapsed), live)
        applyMissScale(parts.ring, ringMiss)
        if (parts.bar) parts.bar.visible = !!bar && !s.barGone
        if (parts.ring) parts.ring.visible = !s.ringGone
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
          <mesh ref={(el) => { partRefs.current[i].bar = el }} geometry={barGeometry} material={barMaterials[i]} />
          <mesh ref={(el) => { partRefs.current[i].ring = el }} geometry={ringGeometry} material={ringMaterials[i]} />
        </group>
      ))}
    </>
  )
}
