import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useGateBurstB, missFactor, applyMissScale } from './gateReactionsB'
import { createPlaneGateMaterial, ringPulseEmissive, GATE_EMISSIVE } from './planeCloudsG'
import { createCubeMorphMaterial, gateLookT, applyGateLook } from './cubeMaterialB'
import { computePhaseDurations } from './BackgroundRingsD'
import { TEXTS } from './copy'
import {
  shipLimits, makeCourse, EXIT_TURN_S, COURSE_SIZE, COURSE_END_Z, WINGSPAN, THICKNESS,
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
//   'exiting' -- the ship dives down and off the side the phone is tipped
//                toward (random when it's level), the cubes fade out and the
//                glowing columns sink. Once it's off the screen it pops out,
//                and a new course and the next 'inhale' start.
//
// Screen placement: the layout is worked out on an unshifted copy of the
// camera, then the real camera gets a lens shift (setViewOffset, no zoom)
// that puts the floor's front edge FLOOR_SCREEN_PX above the screen's bottom,
// just above Home/Restart.

const DOOR_SLIDE_S = 0.6        // floor doors open/close
const RISE_DELAY_S = 0.3        // the ship starts rising this long after the Inhale bell
const RISE_S = 1.2              // ...and reaches its hover height this long after that
const SHIP_FADE_IN_S = 0.4
const FRONT_DOOR_S = 0.5        // front door sinks/rises
const SHIP_SPEED = 5            // units/s
const STOP_GRACE_S = 0.3        // blow-off this long counts as the exhale stopping
const SLOW_S = 1
const SLOW_FACTOR = 0.25
// Exit: forward speed eases from the slow-down speed up to EXIT_FORWARD_SPEED
// while the down and sideways pulls (sideways is in MorphJ) ramp in over
// EXIT_TURN_S, so the ship curves gently off its line rather than snapping.
const EXIT_FORWARD_SPEED = 1.5
const EXIT_DOWN_ACCEL = 2.5     // units/s², at full ramp
const EXIT_FADE_START_S = 1.8   // fades out from here to EXIT_MAX_S (or pops once off the screen)
const EXIT_TILT_DEADZONE_DEG = 3 // phone roll under this = level: random exit side
const EXIT_OFFSCREEN_NDC = 1.15  // pops out once past this far off the screen
const EXIT_MAX_S = 2.8           // ...or after this long
const FLOOR_SCREEN_PX = 80       // floor front edge above the screen's bottom
const CUBE_FADE_S = 1
const COLUMN_SINK_S = 0.6
// Coaching text (onShipText; App fades each in/out over TEXT_FADE_S):
// each inhale alternates shipInhaleA / shipInhaleB, hidden INHALE_TEXT_S after
// it has faded in; while waiting for a blow, shipBlow shows for
// BLOW_PROMPT_S after fading in, then comes back BLOW_PROMPT_WAIT_S after
// fading out, until the first blow.
const TEXT_FADE_S = 1
const INHALE_TEXT_S = 4
const BLOW_PROMPT_S = 1
const BLOW_PROMPT_WAIT_S = 3
const SLIDER_BLOW_RATE = 0.08   // mic failed (Double Sliders): breath falling this fast (per s) = blowing
const FLYING = { flying: true, slowing: true, exiting: true }

// One cube's state on the current course.
const makeCube = ({ x, z, rotY }) => ({ x, z, rotY, judged: false, missElapsed: null })

// Moves value toward target at 1/seconds per second.
const approach = (value, target, seconds, dt) => {
  const step = dt / seconds
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step)
}

export default function SpaceshipBayJ({
  leftVal, gatesEnabledRef, spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef,
  blowRef, micFailed, shipStateRef, shipPaceRef, planePosRef, palette, livePaletteRef, onShipText,
}) {
  const st = useRef(null)
  if (st.current === null) {
    st.current = {
      phase: 'idle', start: 0, inhaleCount: 0, text: null, lastBlow: -Infinity, z: 0, exitDir: 0, exitVy: 0, exitDrop: 0, seq: 0, doorOpen: 0, frontDoor: 1, columnH: 0,
      courseFade: 0, cubes: makeCourse().map(makeCube), prevV: null, fallRate: 0,
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

  // Unshifted copy of the camera for the layout, and the lens shift's cleanup.
  const { camera } = useThree()
  const refCam = useMemo(() => new THREE.PerspectiveCamera(), [])
  const shiftRef = useRef(null)
  useEffect(() => () => { camera.clearViewOffset(); camera.updateProjectionMatrix() }, [camera])
  const _v = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime
    const dt = Math.min(delta, 0.05)
    const s = st.current
    const live = livePaletteRef && livePaletteRef.current
    const cam = state.camera
    const { width: W, height: H } = state.size
    refCam.fov = cam.fov
    refCam.aspect = W / H
    refCam.near = cam.near
    refCam.far = cam.far
    refCam.position.copy(cam.position)
    refCam.quaternion.copy(cam.quaternion)
    refCam.updateProjectionMatrix()
    refCam.updateMatrixWorld()
    const limits = shipLimits(refCam, state.size)
    // Lens shift: drop the scene so the floor's front edge sits FLOOR_SCREEN_PX up.
    _v.set(0, limits.floorTop, PANEL_D / 2).project(refCam)
    const shift = (_v.y + 1) / 2 * H - FLOOR_SCREEN_PX
    if (shiftRef.current === null || Math.abs(shift - shiftRef.current) > 0.5) {
      shiftRef.current = shift
      cam.setViewOffset(W, H, 0, -shift, W, H)
      cam.updateProjectionMatrix()
    }
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
      s.inhaleCount++
      s.z = 0
      s.exitDir = 0
    }
    // Exit side: the way the phone is tipped, or random when it's level.
    const startExit = () => {
      setPhase('exiting')
      const gamma = shipStateRef.current.gamma
      s.exitDir = gamma == null || Math.abs(gamma) < EXIT_TILT_DEADZONE_DEG ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(gamma)
      s.exitVy = 0
      s.exitVz = SHIP_SPEED * SLOW_FACTOR
      s.exitDrop = 0
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
        if (s.z <= COURSE_END_Z) startExit()
        break
      case 'slowing':
        s.z -= SHIP_SPEED * SLOW_FACTOR * dt
        if (blowing) setPhase('flying')
        else if (elapsed >= SLOW_S || s.z <= COURSE_END_Z) startExit()
        break
      case 'exiting': {
        const turn = THREE.MathUtils.smoothstep(elapsed / EXIT_TURN_S, 0, 1)
        s.exitVz = THREE.MathUtils.lerp(SHIP_SPEED * SLOW_FACTOR, EXIT_FORWARD_SPEED, THREE.MathUtils.smoothstep(elapsed / 1, 0, 1))
        s.z -= s.exitVz * dt
        s.exitVy += EXIT_DOWN_ACCEL * turn * dt
        s.exitDrop += s.exitVy * dt
        const pos = planePosRef?.current
        let off = elapsed >= EXIT_MAX_S
        if (pos && !off) {
          _v.set(pos.x, pos.y, pos.z ?? s.z).project(cam)
          off = Math.abs(_v.x) > EXIT_OFFSCREEN_NDC || _v.y < -EXIT_OFFSCREEN_NDC
        }
        if (off) {
          s.cubes = makeCourse().map(makeCube)
          s.courseFade = 0
          startInhale()
        }
        break
      }
      default:
    }
    const pe = now - s.start   // elapsed in the (possibly new) phase

    // The ship.
    const belowY = limits.floorTop - PANEL_H - THICKNESS
    const ship = shipStateRef.current
    ship.seq = s.seq
    ship.z = s.z
    ship.steer = !!FLYING[s.phase]
    ship.exitDir = s.phase === 'exiting' ? s.exitDir : 0
    ship.exitT = s.phase === 'exiting' ? pe : 0
    ship.exitVy = s.phase === 'exiting' ? s.exitVy : 0
    ship.exitVz = s.phase === 'exiting' ? s.exitVz : 0
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
      const drop = s.phase === 'exiting' ? s.exitDrop : 0
      const alpha = s.phase === 'exiting' ? 1 - THREE.MathUtils.smoothstep((pe - EXIT_FADE_START_S) / (EXIT_MAX_S - EXIT_FADE_START_S), 0, 1) : 1
      Object.assign(ship, { y: limits.fullY - drop, alpha, rev: 1, rock: 0, emit: s.phase === 'flying' ? 1 : 0.4 })
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
    else if (s.phase === 'exiting') s.columnH = approach(s.columnH, 0, COLUMN_SINK_S, dt)
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
    s.courseFade = s.phase === 'exiting'
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
      mats.cubes[n].material.opacity = courseFade   // opaque, not the look's 50% approach
      applyMissScale(mesh, missF)
      mesh.position.set(cube.x, limits.fullY, cube.z)
      mesh.rotation.y = cube.rotY
      mesh.visible = courseFade > 0.001
    })
    gateBurst.tick(now, livePaletteRef)

    // Coaching text.
    let text = null
    if (s.phase === 'inhale' && pe < TEXT_FADE_S + INHALE_TEXT_S) {
      text = s.inhaleCount % 2 === 1 ? TEXTS.shipInhaleA : TEXTS.shipInhaleB
    } else if (s.phase === 'ready') {
      const cycle = TEXT_FADE_S + BLOW_PROMPT_S + TEXT_FADE_S + BLOW_PROMPT_WAIT_S
      if (pe % cycle < TEXT_FADE_S + BLOW_PROMPT_S) text = TEXTS.shipBlow
    }
    if (text !== s.text) { s.text = text; onShipText?.(text) }

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
