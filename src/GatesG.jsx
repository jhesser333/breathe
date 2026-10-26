import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useGateBurstB, missFactor, applyMissScale, CUBE_INHALE_MAX_ABS_X } from './gateReactionsB'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {
  planeLimits, makePlaneCubeGate, ringContainsPlane, hitsPlaneBar, sampleRingSurface, isOffScreenBelow, barTopFront, ringTopFront,
  createPlaneGateMaterial, applyPlaneGateLook, ringPulseEmissive, RING_FADE_OUT_S, CUBE_SIZE, CUBE_RADIUS, BAR_W, BAR_H, RING_R, RING_TUBE, RING_MAX_ABS_X,
} from './planeCloudsG'
import { createCubeMorphMaterial, gateLookT, applyGateLook } from './cubeMaterialB'

// Shape G (Paper Airplane), Slowing Down / Paced: ring targets (plus a bar on
// Exhale gates) with GatesF's timing. Exhale gates spawn at SPAWN_Z every
// interval, plus an Inhale gate farther back (computeGateBZ), each one
// interval further out than it needs (LOOKAHEAD_Z, same speed) so the track
// ahead is already filled in; gates show from VISIBLE_Z (makePlaneCubeGate).
// Judged at z = 0 against the plane (planePosRef), like the cube's targets:
// plane inside the ring = particle burst, then the ring fades out; else the
// ring's glow ramps to 0 and it shrinks; the plane touching the bar dims the
// bar. Rings use the cube targets' look. Parts that remain keep scrolling
// until they're off the bottom of the screen, then disappear.
const POOL_SIZE = 12
const SPAWN_Z = -20
const LOOKAHEAD_Z = -SPAWN_Z   // one interval of travel
const VISIBLE_Z = -30
const FADE_IN_S = 1
const DESPAWN_Z = 10   // fallback; parts normally go once off the bottom of the screen

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
  return { active: false, type: 'exhale', z: 0, speed: 0, fadeElapsed: 0, judged: false, ringSuccessElapsed: null, ringMissElapsed: null, barMissElapsed: null, ringGone: false, barGone: false, gate: null }
}

export default function GatesG({ gatesEnabledRef, spawnIntervalRef, palette, breathPhaseRef, inhaleSecondsRef, exhaleSecondsRef, planePosRef, livePaletteRef, paceProgressRef, startOnInhale = false }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const groupRefs = useRef([])
  const partRefs = useRef(Array.from({ length: POOL_SIZE }, () => ({ bar: null, ring: null })))

  const barGeometry = useMemo(() => new RoundedBoxGeometry(BAR_W, BAR_H, CUBE_SIZE, 4, CUBE_RADIUS), [])
  const ringGeometry = useMemo(() => new THREE.TorusGeometry(RING_R, RING_TUBE, 16, 64), [])
  const barMaterials = useMemo(() => Array.from({ length: POOL_SIZE }, () => createPlaneGateMaterial(palette)), [palette])
  const ringMaterials = useMemo(() => Array.from({ length: POOL_SIZE }, () => createCubeMorphMaterial(palette.secondaryColor, palette.primaryColor)), [palette])
  useEffect(() => () => { barGeometry.dispose(); ringGeometry.dispose() }, [barGeometry, ringGeometry])
  useEffect(() => () => [...barMaterials, ...ringMaterials.map((m) => m.material)].forEach((m) => m.dispose()), [barMaterials, ringMaterials])

  const gateBurst = useGateBurstB(palette.primaryColor)

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
      if (parts.bar && gate.bar) parts.bar.position.set(gate.bar.x, gate.bar.y, 0)
      if (parts.ring) { parts.ring.position.set(gate.ring.x, gate.ring.y, 0); parts.ring.scale.set(1, 1, 1) }
    }
    // One Exhale + Inhale cycle, `ahead` units further back than it arrives
    // from: 0 for the first cycle, LOOKAHEAD_Z for each one after.
    const spawnA = (ahead = LOOKAHEAD_Z) => {
      const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      spawn('exhale', SPAWN_Z - ahead, speed)
      spawn('inhale', computeGateBZ(inhaleSecondsRef, exhaleSecondsRef, spawnIntervalRef) - ahead, speed)
    }

    if (gatesEnabledRef.current && !wasEnabled.current) {
      wasEnabled.current = true
      spawnA(0)
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
      const parts = partRefs.current[i]
      const { bar, ring } = s.gate

      s.z += s.speed * delta

      if (s.z >= 0 && !s.judged) {
        s.judged = true
        if (breathPhaseRef) breathPhaseRef.current = s.type === 'exhale' ? 'inhale' : 'exhale'   // the phase to breathe next
        const pos = planePosRef?.current
        if (pos && ringContainsPlane(ring, pos.x, pos.y)) {
          const z = s.z
          gateBurst.burstFrom(() => sampleRingSurface(ring, z), RING_MAX_ABS_X, now, RING_MAX_ABS_X / CUBE_INHALE_MAX_ABS_X, ring.x)
          s.ringSuccessElapsed = 0
        } else {
          s.ringMissElapsed = 0
        }
        if (pos && hitsPlaneBar(bar, pos.x, pos.y)) s.barMissElapsed = 0
        startPaceRamp(s.type, now)
        if (s.type === 'exhale') spawnA()
      }

      // Past the plane, each part stays until it's off the bottom of the screen.
      if (s.judged) {
        if (!s.barGone) s.barGone = !bar || isOffScreenBelow(state.camera, ...barTopFront(bar, s.z))
        if (!s.ringGone) s.ringGone = (s.ringSuccessElapsed != null && s.ringSuccessElapsed >= RING_FADE_OUT_S)
          || isOffScreenBelow(state.camera, ...ringTopFront(ring, s.z))
      }
      if (s.z > DESPAWN_Z || (s.barGone && s.ringGone)) {
        s.active = false; group.visible = false; return
      }
      if (s.z < VISIBLE_Z) { group.visible = false; return }

      s.fadeElapsed += delta
      if (s.ringSuccessElapsed != null) s.ringSuccessElapsed += delta
      if (s.ringMissElapsed != null) s.ringMissElapsed += delta
      if (s.barMissElapsed != null) s.barMissElapsed += delta
      const ringMiss = missFactor(s.ringMissElapsed)
      const ringFade = THREE.MathUtils.smoothstep(s.fadeElapsed / FADE_IN_S, 0, 1)
        * (s.ringSuccessElapsed == null ? 1 : 1 - THREE.MathUtils.smoothstep(s.ringSuccessElapsed / RING_FADE_OUT_S, 0, 1))
      applyGateLook(ringMaterials[i], gateLookT(s.z), ringFade, ringPulseEmissive(s.z) * (1 - ringMiss), live)
      applyPlaneGateLook(barMaterials[i], s.z, s.fadeElapsed, missFactor(s.barMissElapsed), live)
      applyMissScale(parts.ring, ringMiss)
      if (parts.bar) parts.bar.visible = !!bar && !s.barGone
      if (parts.ring) parts.ring.visible = !s.ringGone
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
          <mesh ref={(el) => { partRefs.current[i].bar = el }} geometry={barGeometry} material={barMaterials[i]} />
          <mesh ref={(el) => { partRefs.current[i].ring = el }} geometry={ringGeometry} material={ringMaterials[i].material} />
        </group>
      ))}
    </>
  )
}
