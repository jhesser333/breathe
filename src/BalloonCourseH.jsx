import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useGateBurstB, missFactor, applyMissScale, CUBE_INHALE_MAX_ABS_X } from './gateReactionsB'
import { ringContainsPlane, sampleRingSurface, createPlaneGateMaterial, ringPulseEmissive, GATE_EMISSIVE, RING_FADE_OUT_S, RING_R, RING_TUBE, RING_MAX_ABS_X } from './planeCloudsG'
import { createCubeMorphMaterial, gateLookT, applyGateLook } from './cubeMaterialB'
import { computePhaseDurations } from './BackgroundRingsD'
import {
  balloonLimits, WALL_H, WALL_D, WALL_HEIGHTS, SHORT_H, SHORT_D, DOOR_T, SEGMENT_LEN, RING_COUNT, RING_SIDE_FRAC,
  wallFrontZ, wallCenterZ,
} from './balloonH'

// Shape H (Balloon): the course and its user-gated pace. Unlike every other
// art, nothing scrolls on a clock: the course stands still while the user
// inhales and only moves toward the camera once the app sees the user start
// to exhale through an open door, one SEGMENT_LEN per exhale, arriving in
// the pace's exhale time. Each segment (from its start, the short barrier
// under the balloon): the door on top of the first wall, 3 full walls, 3
// stepping down, rings at flight height over walls 1-5 on one random side.
//
// Phases (balloonPaceRef.phase; paced = gatesEnabledRef on):
//   'inhale'   -- paced: lasts the inhale time (Inhale bell). An exhale now
//                 bumps the balloon into the door/wall.
//                 free (no pace yet): no time limit; any exhale opens the
//                 door and starts the trip if the balloon is high enough.
//   'hold-in'  -- Box only: the closed door pulses on each of the 4 counts.
//   'door-open'-- Exhale bell, the door swings down. An exhale within
//                 DOOR_WINDOW_S starts the trip if the balloon clears the
//                 wall (else it bumps the wall); no exhale = a miss.
//   'retry'    -- after a miss: door closed, balloon deflating (retry text
//                 shown). Once the controls are back at full exhale the
//                 balloon follows them again; the next inhale hides the
//                 text, and reaching full inhale reopens the door.
//   'exhale'   -- the trip: the course moves one segment over the exhale time.
//   'hold-out' -- Box only: the short barrier under the balloon pulses on
//                 each count.
const SLOTS = 4                 // segments cur-1 .. cur+2
const DEADBAND = 0.05           // drop from a peak that counts as an exhale start
const EDGE = 0.02               // controls at full exhale / inhale
const DOOR_WINDOW_S = 1
const DOOR_SWING_S = 0.5
const DEFLATE_MIN_S = 1.2       // a miss deflates at least this long
const BOUNCE_COOLDOWN_S = 1.15  // MorphH's whole bounce
const FREE_EXHALE_S = 6         // trip time before the app's pace starts
const TRAVEL_RAMP = 0.15        // trip speed eases up/down over this fraction
const FADE_IN_S = 1
const PULSE_GAIN = 2            // Box count pulse: emissive × (1 + PULSE_GAIN) at each count

// Trapezoid speed profile: 0 -> 1 over p, easing in/out over TRAVEL_RAMP.
function travelEase(p) {
  const a = TRAVEL_RAMP
  const v = 1 / (1 - a)
  if (p <= 0) return 0
  if (p >= 1) return 1
  if (p < a) return 0.5 * v * p * p / a
  if (p > 1 - a) return 1 - 0.5 * v * (1 - p) * (1 - p) / a
  return v * (p - a / 2)
}

// One spike per count, fading over the count.
function countPulse(elapsed, holdDur) {
  const count = Math.max(0.05, holdDur / 4)
  const f = (elapsed % count) / count
  return 1 + PULSE_GAIN * (1 - f) * (1 - f)
}

function makeSlot() {
  return { index: null, side: 1, fade: 0, door: 0, rings: Array.from({ length: RING_COUNT }, () => ({ judged: false, successElapsed: null, missElapsed: null })) }
}

export default function BalloonCourseH({
  leftVal, gatesEnabledRef, isBox, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef, breathPhaseRef,
  balloonStateRef, balloonPaceRef, planePosRef, palette, livePaletteRef, onRetryText,
}) {
  const slots = useRef(Array.from({ length: SLOTS }, makeSlot))
  const refs = useRef(Array.from({ length: SLOTS }, () => ({ group: null, short: null, walls: [], doorPivot: null, door: null, rings: [] })))
  const st = useRef(null)
  if (st.current === null) {
    st.current = { phase: 'inhale', start: 0, travel: 0, travelFrom: 0, cur: 0, doorTarget: 0, recovering: false, bellSeq: 0, wasPaced: false, showingRetry: false,
      det: { dir: 'down', peak: 0, trough: 0 } }
  }

  const shortGeometry = useMemo(() => new RoundedBoxGeometry(WALL_H, SHORT_H, SHORT_D, 2, 0.05), [])
  const wallGeometry = useMemo(() => new RoundedBoxGeometry(WALL_H, WALL_H, WALL_D, 4, 0.2), [])
  const doorGeometry = useMemo(() => new RoundedBoxGeometry(WALL_H, 1, DOOR_T, 2, 0.04), [])
  const ringGeometry = useMemo(() => new THREE.TorusGeometry(RING_R, RING_TUBE, 16, 64), [])
  useEffect(() => () => [shortGeometry, wallGeometry, doorGeometry, ringGeometry].forEach((g) => g.dispose()), [shortGeometry, wallGeometry, doorGeometry, ringGeometry])

  const mats = useMemo(() => Array.from({ length: SLOTS }, () => ({
    wall: createPlaneGateMaterial(palette),
    short: createPlaneGateMaterial(palette),
    door: createPlaneGateMaterial(palette),
    rings: Array.from({ length: RING_COUNT }, () => createCubeMorphMaterial(palette.secondaryColor, palette.primaryColor)),
  })), [palette])
  useEffect(() => () => mats.forEach((m) => {
    m.wall.dispose(); m.short.dispose(); m.door.dispose(); m.rings.forEach((r) => r.material.dispose())
  }), [mats])

  const gateBurst = useGateBurstB(palette.primaryColor)

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime
    const dt = Math.min(delta, 0.05)
    const s = st.current
    const b = balloonStateRef.current
    const live = livePaletteRef && livePaletteRef.current
    const limits = balloonLimits(state.camera, state.size)
    const paced = !!gatesEnabledRef.current
    const v = THREE.MathUtils.clamp(leftVal.current, 0, 1)

    const interval = Math.max(0.05, spawnIntervalRef.current)
    const d = computePhaseDurations(spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef)
    const inhaleDur = isBox ? interval : Math.max(0.05, d.inhaleDuration)
    const exhaleDur = !paced ? FREE_EXHALE_S : isBox ? interval : Math.max(0.05, d.exhaleDuration)

    // Exhale / inhale starts: a DEADBAND turn from the last peak / trough.
    let exhaleStart = false
    let inhaleStart = false
    const det = s.det
    if (det.dir === 'up') {
      if (v > det.peak) det.peak = v
      else if (v < det.peak - DEADBAND) { det.dir = 'down'; det.trough = v; exhaleStart = true }
    } else {
      if (v < det.trough) det.trough = v
      else if (v > det.trough + DEADBAND) { det.dir = 'up'; det.peak = v; inhaleStart = true }
    }

    const setPhase = (phase) => { s.phase = phase; s.start = now }
    const setBreathPhase = (p) => { if (paced && breathPhaseRef) breathPhaseRef.current = p }
    const showRetry = (on) => { if (s.showingRetry !== on) { s.showingRetry = on; onRetryText?.(on) } }
    const bounce = () => { if (now - b.bounceStart > BOUNCE_COOLDOWN_S) b.bounceStart = now }
    const highEnough = () => b.bottom >= limits.wallTop
    const startInhale = () => {
      setPhase('inhale'); s.doorTarget = 0; b.mode = 'follow'; setBreathPhase('inhale')
    }
    const openDoor = () => {
      setPhase('door-open'); s.doorTarget = 1; s.bellSeq++; setBreathPhase('exhale')
    }
    const startExhale = () => {
      setPhase('exhale'); s.doorTarget = 1; s.travelFrom = s.travel; s.tripDur = exhaleDur
      b.mode = 'travel'; b.travelP = 0; setBreathPhase('exhale')
    }
    const miss = () => {
      setPhase('retry'); s.doorTarget = 0; s.recovering = true; b.mode = 'deflate'; showRetry(true); setBreathPhase('inhale')
    }

    // The pace starting (or the tutorial's paced part): begin on an Inhale.
    if (paced && !s.wasPaced && (s.phase === 'inhale' || s.phase === 'retry')) {
      showRetry(false); s.recovering = false; startInhale()
    }
    s.wasPaced = paced

    const elapsed = now - s.start
    switch (s.phase) {
      case 'inhale':
        if (!paced) {
          if (exhaleStart) { if (highEnough()) startExhale(); else bounce() }
        } else if (exhaleStart) bounce()
        else if (elapsed >= inhaleDur) { if (isBox) setPhase('hold-in'); else openDoor() }
        break
      case 'hold-in':
        if (exhaleStart) bounce()
        else if (elapsed >= interval) openDoor()
        break
      case 'door-open':
        if (exhaleStart) { if (highEnough()) startExhale(); else { bounce(); miss() } }
        else if (elapsed > DOOR_WINDOW_S) miss()
        break
      case 'retry':
        if (s.recovering) {
          if (elapsed >= DEFLATE_MIN_S && v <= EDGE) { s.recovering = false; b.mode = 'follow' }
        } else {
          if (inhaleStart) showRetry(false)
          if (exhaleStart) bounce()
          if (v >= 1 - EDGE) { showRetry(false); openDoor() }
        }
        break
      case 'exhale': {
        const p = Math.min(1, elapsed / s.tripDur)
        s.travel = s.travelFrom + SEGMENT_LEN * travelEase(p)
        b.travelP = p
        if (p >= 1) {
          s.travel = s.travelFrom + SEGMENT_LEN
          s.cur++
          b.mode = 'follow'
          if (paced && isBox) { setPhase('hold-out'); setBreathPhase('exhale') } else startInhale()
        }
        break
      }
      case 'hold-out':
        if (elapsed >= interval) startInhale()
        break
      default:
        break
    }

    const pace = balloonPaceRef.current
    pace.paced = paced
    pace.phase = s.phase
    pace.bellSeq = s.bellSeq
    pace.inhaleDur = inhaleDur

    // Segments cur-1 .. cur+2, each in slot index mod SLOTS.
    const phaseElapsed = now - s.start
    const doorPulse = paced && s.phase === 'hold-in' ? countPulse(phaseElapsed, interval) : 1
    const shortPulse = paced && s.phase === 'hold-out' ? countPulse(phaseElapsed, interval) : 1
    const pos = planePosRef?.current
    for (let i = s.cur - 1; i <= s.cur + 2; i++) {
      const k = ((i % SLOTS) + SLOTS) % SLOTS
      const slot = slots.current[k]
      const r = refs.current[k]
      const m = mats[k]
      if (!r.group) continue
      if (slot.index !== i) {
        Object.assign(slot, makeSlot(), { index: i, side: Math.random() < 0.5 ? -1 : 1, door: i < s.cur ? 1 : 0, fade: i <= s.cur + 1 ? FADE_IN_S : 0 })
        if (i < s.cur) slot.rings.forEach((rs) => { rs.judged = true })   // already behind the balloon
      }
      slot.fade += dt
      const origin = s.travel - i * SEGMENT_LEN
      r.group.position.set(0, 0, origin)
      r.group.visible = true

      // Barriers: no emissive (the short barrier only glows in its Box
      // Hold-out pulse); the door: GATE_EMISSIVE in the primary color.
      const fade = THREE.MathUtils.smoothstep(slot.fade / FADE_IN_S, 0, 1)
      const isCur = i === s.cur
      for (const [mat, color, pulse] of [[m.wall, 'text', 0], [m.short, 'text', isCur ? shortPulse - 1 : 0], [m.door, 'primary', isCur ? doorPulse : 1]]) {
        mat.opacity = fade
        mat.emissiveIntensity = GATE_EMISSIVE * pulse
        if (live) { mat.color.copy(live[color]); mat.emissive.copy(live.secondary) }
      }
      r.short.position.set(0, limits.groundY + SHORT_H / 2, 0)
      r.walls.forEach((w, n) => {
        if (!w) return
        const h = WALL_HEIGHTS[n]
        w.scale.set(h, h, 1)   // as wide as it is tall
        w.position.set(0, limits.groundY + WALL_H * h / 2, wallCenterZ(n))
      })

      // Door: pivots on its back-bottom edge, swinging its top toward -Z.
      const doorTarget = i < s.cur ? 1 : isCur ? s.doorTarget : 0
      slot.door = THREE.MathUtils.clamp(slot.door + Math.sign(doorTarget - slot.door) * dt / DOOR_SWING_S, Math.min(slot.door, doorTarget), Math.max(slot.door, doorTarget))
      r.doorPivot.position.set(0, limits.wallTop, wallFrontZ(0) - DOOR_T)
      r.doorPivot.rotation.x = -Math.PI / 2 * THREE.MathUtils.smoothstep(slot.door, 0, 1)
      r.door.scale.y = limits.doorH
      r.door.position.set(0, limits.doorH / 2, DOOR_T / 2)

      // Rings: judged against the balloon as they reach z = 0 on the trip.
      const ringX = slot.side * limits.spanX * RING_SIDE_FRAC
      slot.rings.forEach((rs, n) => {
        const mesh = r.rings[n]
        if (!mesh) return
        const z = origin + wallCenterZ(n)
        const ring = { x: ringX, y: limits.flightY }
        if (!rs.judged && z >= 0) {
          rs.judged = true
          if (pos && ringContainsPlane(ring, pos.x, pos.y)) {
            gateBurst.burstFrom(() => sampleRingSurface(ring, z), RING_MAX_ABS_X, now, RING_MAX_ABS_X / CUBE_INHALE_MAX_ABS_X, ring.x)
            rs.successElapsed = 0
          } else rs.missElapsed = 0
        }
        if (rs.successElapsed != null) rs.successElapsed += dt
        if (rs.missElapsed != null) rs.missElapsed += dt
        const missF = missFactor(rs.missElapsed)
        const ringFade = fade * (rs.successElapsed == null ? 1 : 1 - THREE.MathUtils.smoothstep(rs.successElapsed / RING_FADE_OUT_S, 0, 1))
        applyGateLook(m.rings[n], gateLookT(z), ringFade, ringPulseEmissive(z) * (1 - missF), live)
        applyMissScale(mesh, missF)
        mesh.position.set(ringX, limits.flightY, wallCenterZ(n))
        mesh.visible = ringFade > 0.001
      })
    }

    gateBurst.tick(now, livePaletteRef)
  })

  return (
    <>
      {gateBurst.points}
      {Array.from({ length: SLOTS }, (_, k) => (
        <group key={k} ref={(el) => { refs.current[k].group = el }} visible={false}>
          <mesh ref={(el) => { refs.current[k].short = el }} geometry={shortGeometry} material={mats[k].short} />
          {WALL_HEIGHTS.map((_, n) => (
            <mesh key={n} ref={(el) => { refs.current[k].walls[n] = el }} geometry={wallGeometry} material={mats[k].wall} />
          ))}
          <group ref={(el) => { refs.current[k].doorPivot = el }}>
            <mesh ref={(el) => { refs.current[k].door = el }} geometry={doorGeometry} material={mats[k].door} />
          </group>
          {Array.from({ length: RING_COUNT }, (_, n) => (
            <mesh key={n} ref={(el) => { refs.current[k].rings[n] = el }} geometry={ringGeometry} material={mats[k].rings[n].material} />
          ))}
        </group>
      ))}
    </>
  )
}
