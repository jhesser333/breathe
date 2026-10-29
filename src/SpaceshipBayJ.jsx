import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useGateBurstB, missFactor, applyMissScale } from './gateReactionsB'
import { createPlaneGateMaterial, ringPulseEmissive, GATE_EMISSIVE } from './planeCloudsG'
import { createCubeMorphMaterial, gateLookT, applyGateLook } from './cubeMaterialB'
import { computePhaseDurations } from './BackgroundRingsD'
import {
  shipLimits, makeCourse, COURSE_SIZE, COURSE_END_Z, WINGSPAN, THICKNESS,
  PANEL_W, PANEL_H, PANEL_D, DOOR_GAP, FRONT_DOOR_T, FRONT_DOOR_Z, FRONT_DOOR_CLEAR,
  COLUMN_R, GLOW_COLUMN_SCALE, TARGET_SIZE,
} from './spaceshipJ'

// Shape J (Space Ship): the docking bay, columns, front door and cube
// targets, plus the pace. Nothing here moves along Z; the ship flies away.
// The app paces the inhale; the user decides when the exhale ends.
//
// Phases (shipPaceRef.phase; nothing runs until gatesEnabledRef turns on):
//   'idle'    -- before the pace: the ship waits under the closed floor.
//   'inhale'  -- Inhale bell. The floor doors slide apart, the ship rises,
//                the doors close under it, the front door rises. Over the
//                inhale time the ship floats up to full height, its engines
//                rev (glow, particles, rocking) and the glowing columns
//                rise to cover the plain ones. Blowing is ignored.
//   'ready'   -- Exhale bell: the front door sinks into the floor. The ship
//                waits at full height until the first blow, however long.
//   'flying'  -- the ship flies away at a steady SHIP_SPEED (blow strength
//                doesn't matter), steered by phone side tilt, judging each
//                cube it passes. STOP_GRACE_S without a blow -> 'slowing'.
//   'slowing' -- SLOW_FACTOR speed for SLOW_S; a blow goes back to 'flying'.
//   'fading'  -- the ship fades out, the cubes fade out and the glowing
//                columns sink; then a new course and the next 'inhale'.

const DOOR_SLIDE_S = 0.6        // floor doors open/close
const RISE_DELAY_S = 0.3        // the ship starts rising this long after the Inhale bell
const RISE_S = 1.2              // ...and reaches its hover height this long after that
const SHIP_FADE_IN_S = 0.4
const FRONT_DOOR_S = 0.5        // front door sinks/rises
const SHIP_SPEED = 2.5          // units/s
const STOP_GRACE_S = 0.3        // blow-off this long counts as the exhale stopping
const SLOW_S = 1
const SLOW_FACTOR = 0.25
const SHIP_FADE_S = 1
const CUBE_FADE_S = 1
const COLUMN_SINK_S = 0.6
const SLIDER_BLOW_RATE = 0.08   // mic failed (Double Sliders): breath falling this fast (per s) = blowing
const FLYING = { flying: true, slowing: true, fading: true }

// One cube's state on the current course.
const makeCube = ({ x, z }) => ({ x, z, judged: false, missElapsed: null })

// Moves value toward target at 1/seconds per second.
const approach = (value, target, seconds, dt) => {
  const step = dt / seconds
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step)
}

export default function SpaceshipBayJ({
  leftVal, gatesEnabledRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef,
  blowRef, micFailed, shipStateRef, shipPaceRef, planePosRef, palette, livePaletteRef,
}) {
  const st = useRef(null)
  if (st.current === null) {
    st.current = {
      phase: 'idle', start: 0, lastBlow: -Infinity, z: 0, seq: 0, doorOpen: 0, frontDoor: 1, columnH: 0,
      courseFade: 0, courseFading: false, cubes: makeCourse().map(makeCube), prevV: null, fallRate: 0,
    }
  }
  const refs = useRef({ panels: [], columns: [], glows: [], frontDoor: null, cubes: [] })

  const panelGeometry = useMemo(() => new RoundedBoxGeometry(PANEL_W, PANEL_H, PANEL_D, 2, 0.05), [])
  const frontDoorGeometry = useMemo(() => new RoundedBoxGeometry(PANEL_W, 1, FRONT_DOOR_T, 2, 0.04), [])
  const columnGeometry = useMemo(() => new THREE.CylinderGeometry(COLUMN_R, COLUMN_R, 1, 24), [])
  const glowGeometry = useMemo(() => new THREE.CylinderGeometry(COLUMN_R * GLOW_COLUMN_SCALE, COLUMN_R * GLOW_COLUMN_SCALE, 1, 24), [])
  const cubeGeometry = useMemo(() => new RoundedBoxGeometry(TARGET_SIZE, TARGET_SIZE, TARGET_SIZE, 2, 0.08), [])
  useEffect(() => () => [panelGeometry, frontDoorGeometry, columnGeometry, glowGeometry, cubeGeometry].forEach((g) => g.dispose()),
    [panelGeometry, frontDoorGeometry, columnGeometry, glowGeometry, cubeGeometry])

  const mats = useMemo(() => ({
    panel: createPlaneGateMaterial(palette),
    frontDoor: createPlaneGateMaterial(palette),
    column: new THREE.MeshStandardMaterial({ color: palette.tertiaryColor, roughness: 0.5 }),
    glow: new THREE.MeshStandardMaterial({ color: palette.tertiaryColor, emissive: palette.tertiaryColor, emissiveIntensity: 3, roughness: 0.5 }),
    cubes: Array.from({ length: COURSE_SIZE }, () => createCubeMorphMaterial(palette.secondaryColor, palette.primaryColor)),
  }), [palette])
  useEffect(() => () => {
    mats.panel.dispose(); mats.frontDoor.dispose(); mats.column.dispose(); mats.glow.dispose()
    mats.cubes.forEach((c) => c.material.dispose())
  }, [mats])

  const gateBurst = useGateBurstB(palette.primaryColor)

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime
    const dt = Math.min(delta, 0.05)
    const s = st.current
    const live = livePaletteRef && livePaletteRef.current
    const limits = shipLimits(state.camera, state.size)
    const paced = !!gatesEnabledRef.current
    const { inhaleDuration } = computePhaseDurations(spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef)
    const inhaleDur = Math.max(0.05, inhaleDuration)

    // Blowing: the mic (blowRef), or with the mic failed, the breath value falling.
    const v = THREE.MathUtils.clamp(leftVal.current, 0, 1)
    if (s.prevV !== null && dt > 0) s.fallRate += ((s.prevV - v) / dt - s.fallRate) * (1 - Math.exp(-dt / 0.15))
    s.prevV = v
    const blowing = micFailed ? s.fallRate > SLIDER_BLOW_RATE : !!(blowRef && blowRef.current > 0.5)
    if (blowing) s.lastBlow = now

    const setPhase = (p) => { s.phase = p; s.start = now }
    const startInhale = () => {
      setPhase('inhale')
      s.seq++
      s.z = 0
    }

    if (s.phase === 'idle' && paced) startInhale()
    const elapsed = now - s.start
    const riseEnd = RISE_DELAY_S + RISE_S
    switch (s.phase) {
      case 'inhale':
        if (elapsed >= inhaleDur) setPhase('ready')
        break
      case 'ready':
        if (blowing) setPhase('flying')
        break
      case 'flying':
        s.z -= SHIP_SPEED * dt
        if (now - s.lastBlow > STOP_GRACE_S) setPhase('slowing')
        if (s.z <= COURSE_END_Z) setPhase('fading')
        break
      case 'slowing':
        s.z -= SHIP_SPEED * SLOW_FACTOR * dt
        if (blowing) setPhase('flying')
        else if (elapsed >= SLOW_S || s.z <= COURSE_END_Z) setPhase('fading')
        break
      case 'fading':
        s.z -= SHIP_SPEED * SLOW_FACTOR * dt
        if (elapsed >= SHIP_FADE_S) {
          s.cubes = makeCourse().map(makeCube)
          s.courseFade = 0
          startInhale()
        }
        break
      default:
    }
    const pe = now - s.start   // elapsed in the (possibly new) phase

    // The ship.
    const belowY = limits.floorTop - PANEL_H - THICKNESS
    const ship = shipStateRef.current
    ship.seq = s.seq
    ship.z = s.z
    ship.steer = !!FLYING[s.phase]
    if (s.phase === 'idle') {
      Object.assign(ship, { y: belowY, alpha: 0, rev: 0, rock: 0, emit: 0 })
    } else if (s.phase === 'inhale') {
      const rev = THREE.MathUtils.clamp(pe / inhaleDur, 0, 1)
      const y = pe < riseEnd
        ? THREE.MathUtils.lerp(belowY, limits.hoverY, THREE.MathUtils.smoothstep((pe - RISE_DELAY_S) / RISE_S, 0, 1))
        : THREE.MathUtils.lerp(limits.hoverY, limits.fullY, THREE.MathUtils.smoothstep((pe - riseEnd) / Math.max(0.05, inhaleDur - riseEnd), 0, 1))
      Object.assign(ship, { y, alpha: THREE.MathUtils.smoothstep((pe - RISE_DELAY_S) / SHIP_FADE_IN_S, 0, 1), rev, rock: rev, emit: rev })
    } else if (s.phase === 'ready') {
      Object.assign(ship, { y: limits.fullY, alpha: 1, rev: 1, rock: 1, emit: 1 })
    } else {
      const fade = s.phase === 'fading' ? 1 - THREE.MathUtils.smoothstep(pe / SHIP_FADE_S, 0, 1) : 1
      Object.assign(ship, { y: limits.fullY, alpha: fade, rev: 1, rock: 0, emit: (s.phase === 'flying' ? 1 : 0.4) * fade })
    }

    // Floor doors: apart while the ship rises, closed under it after.
    const doorsOpen = s.phase === 'inhale' && pe < riseEnd
    s.doorOpen = approach(s.doorOpen, doorsOpen ? 1 : 0, DOOR_SLIDE_S, dt)
    const slide = THREE.MathUtils.smoothstep(s.doorOpen, 0, 1) * PANEL_W
    refs.current.panels.forEach((p, n) => {
      if (!p) return
      const side = n === 0 ? -1 : 1
      p.position.set(side * (PANEL_W / 2 + DOOR_GAP / 2 + slide), limits.floorTop - PANEL_H / 2, 0)
    })

    // Columns: plain ones floor -> top; the glowing ones grow up from the floor
    // over the inhale, reaching the top at the Exhale bell.
    const colH = limits.columnTop - limits.floorTop
    if (s.phase === 'inhale') s.columnH = THREE.MathUtils.clamp(pe / inhaleDur, 0, 1)
    else if (s.phase === 'idle') s.columnH = 0
    else if (s.phase === 'fading') s.columnH = approach(s.columnH, 0, COLUMN_SINK_S, dt)
    else s.columnH = 1
    for (let n = 0; n < 2; n++) {
      const x = (n === 0 ? -1 : 1) * limits.columnX
      const c = refs.current.columns[n]
      if (c) { c.scale.y = colH; c.position.set(x, limits.floorTop + colH / 2, 0) }
      const g = refs.current.glows[n]
      if (g) {
        const h = colH * s.columnH
        g.visible = h > 0.001
        g.scale.y = Math.max(h, 0.001)
        g.position.set(x, limits.floorTop + h / 2, 0)
      }
    }

    // Front door: up through the inhale, sinks at the Exhale bell.
    const doorUp = s.phase === 'idle' || s.phase === 'inhale'
    s.frontDoor = approach(s.frontDoor, doorUp ? 1 : 0, FRONT_DOOR_S, dt)
    const fd = refs.current.frontDoor
    if (fd) {
      const h = (limits.fullY + THICKNESS / 2 + FRONT_DOOR_CLEAR - limits.floorTop) * THREE.MathUtils.smoothstep(s.frontDoor, 0, 1)
      fd.visible = h > 0.001
      fd.scale.y = Math.max(h, 0.001)
      fd.position.set(0, limits.floorTop + h / 2, FRONT_DOOR_Z)
    }

    // Floor panels: no emissive, like the balloon's barriers; the front door
    // keeps the balloon door's GATE_EMISSIVE glow.
    for (const [mat, color, glow] of [[mats.panel, 'text', 0], [mats.frontDoor, 'primary', GATE_EMISSIVE]]) {
      mat.emissiveIntensity = glow
      if (live) { mat.color.copy(live[color]); mat.emissive.copy(live.secondary) }
    }
    if (live) { mats.column.color.copy(live.tertiary); mats.glow.color.copy(live.tertiary); mats.glow.emissive.copy(live.tertiary) }

    // Cube targets: fade out with the ship, fade in with a new course.
    s.courseFade = s.phase === 'fading'
      ? Math.min(s.courseFade, 1 - THREE.MathUtils.smoothstep(pe / CUBE_FADE_S, 0, 1))
      : approach(s.courseFade, 1, CUBE_FADE_S, dt)
    const courseFade = THREE.MathUtils.smoothstep(s.courseFade, 0, 1)
    const px = planePosRef?.current?.x ?? 0
    s.cubes.forEach((cube, n) => {
      const mesh = refs.current.cubes[n]
      if (!mesh) return
      if (!cube.judged && FLYING[s.phase] && s.z <= cube.z) {
        cube.judged = true
        if (Math.abs(px - cube.x) < WINGSPAN / 2 + TARGET_SIZE / 2) {
          gateBurst.burstFrom(() => {
            const p = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]
            p[Math.floor(Math.random() * 3)] = Math.random() < 0.5 ? -0.5 : 0.5
            return [cube.x + p[0] * TARGET_SIZE, limits.fullY + p[1] * TARGET_SIZE, cube.z + p[2] * TARGET_SIZE]
          }, TARGET_SIZE / 2, now, 1, cube.x)
        } else cube.missElapsed = 0
      }
      if (cube.missElapsed != null) cube.missElapsed += dt
      const missF = missFactor(cube.missElapsed)
      const rel = cube.judged ? 0 : Math.min(cube.z - s.z, -1e-4)   // < 0 = still ahead of the ship
      applyGateLook(mats.cubes[n], gateLookT(rel), courseFade, ringPulseEmissive(rel) * (1 - missF), live)
      applyMissScale(mesh, missF)
      mesh.position.set(cube.x, limits.fullY, cube.z)
      mesh.visible = courseFade > 0.001
    })
    gateBurst.tick(now, livePaletteRef)

    const pace = shipPaceRef.current
    pace.paced = paced
    pace.phase = s.phase
    pace.inhaleDur = inhaleDur
  })

  return (
    <>
      {gateBurst.points}
      {[0, 1].map((n) => (
        <mesh key={`p${n}`} ref={(el) => { refs.current.panels[n] = el }} geometry={panelGeometry} material={mats.panel} />
      ))}
      {[0, 1].map((n) => (
        <mesh key={`c${n}`} ref={(el) => { refs.current.columns[n] = el }} geometry={columnGeometry} material={mats.column} />
      ))}
      {[0, 1].map((n) => (
        <mesh key={`g${n}`} ref={(el) => { refs.current.glows[n] = el }} geometry={glowGeometry} material={mats.glow} visible={false} />
      ))}
      <mesh ref={(el) => { refs.current.frontDoor = el }} geometry={frontDoorGeometry} material={mats.frontDoor} />
      {Array.from({ length: COURSE_SIZE }, (_, n) => (
        <mesh key={`t${n}`} ref={(el) => { refs.current.cubes[n] = el }} geometry={cubeGeometry} material={mats.cubes[n].material} />
      ))}
    </>
  )
}
