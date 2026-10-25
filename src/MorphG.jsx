import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { planeLimits } from './planeCloudsG'

// Shape G: Paper Airplane (in-progress), ported from the PaperPlane project's
// PlaneMorph. Breath flies it up and down: full Inhale sits it just above the
// sliders, Exhale lifts it to the top of the screen, and Inhale lets it drift
// back down. Tilting the phone left/right sets its sideways position.
// App passes breathRef as leftVal (0 exhale -> 1 inhale). The plane's range
// comes from planeLimits (planeCloudsG.js), shared with the cloud gates; its
// rendered position is written to planePosRef for their collision checks.

// Gray-box paper airplane: a 4-sided pyramid, tip pointing away from the
// camera (-Z), flattened and widened. Sizes in world units.
const WINGSPAN = 1.4
const THICKNESS = 0.25
const LENGTH = 2
const EMISSIVE_INTENSITY = 0.3
// Blow on the Mic feedback: the emissive doubles while the mic hears a blow
// (blowRef), easing up and down over BLOW_GLOW_SMOOTH_S.
const BLOW_GLOW_SMOOTH_S = 0.15

// Seconds to (mostly) reach a new target -- a smooth ease in and out.
const RISE_TIME = 1.5
const SINK_TIME = 2.5   // slower, so it drifts down rather than drops
const SIDE_TIME = 1.5

// Tilt: banks into sideways movement and pitches with vertical movement.
const BANK_MAX = 0.6            // radians at TILT_FULL_SPEED sideways
const PITCH_MAX = 0.35          // radians at TILT_FULL_SPEED up/down
const TILT_FULL_SPEED = 3       // world units per second
const REST_PITCH = -0.12        // slight nose-down glide, so the camera sees the top
const TILT_SMOOTH_S = 0.15

// Phone roll (deviceorientation gamma) that puts the plane at a side edge.
const SIDE_TILT_FULL_DEG = 25

// Floating: slow wing rocking and bobbing, each swing a random size and time.
const FLOAT_ROLL_MIN = 0.04       // radians per wing dip
const FLOAT_ROLL_MAX = 0.12
const FLOAT_ROLL_TIME_MIN = 2.5   // seconds per swing
const FLOAT_ROLL_TIME_MAX = 4.5
const FLOAT_BOB_MIN = 0.05        // world units up or down
const FLOAT_BOB_MAX = 0.15
const FLOAT_BOB_TIME_MIN = 2      // seconds per bob
const FLOAT_BOB_TIME_MAX = 3.5

const rand = (min, max) => min + Math.random() * (max - min)

// Eases (cosine) to a random target on the other side, then picks the next one.
function makeDrifter(min, max, timeMin, timeMax) {
  const d = { from: 0, to: rand(min, max), t: 0, dur: rand(timeMin, timeMax), sign: 1 }
  return (dt) => {
    d.t += dt
    if (d.t >= d.dur) {
      d.from = d.to
      d.sign = -d.sign
      d.to = d.sign * rand(min, max)
      d.t = 0
      d.dur = rand(timeMin, timeMax)
    }
    return d.from + (d.to - d.from) * (1 - Math.cos(Math.PI * d.t / d.dur)) / 2
  }
}

// Unity-style SmoothDamp: eases toward target; vel is { v }.
function smoothDamp(current, target, vel, smoothTime, dt) {
  const omega = 2 / smoothTime
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (vel.v + omega * change) * dt
  vel.v = (vel.v - omega * temp) * exp
  return target + (change + temp) * exp
}

export default function MorphG({ leftVal, palette, planePosRef, blowRef }) {
  const groupRef = useRef()
  const materialRef = useRef()
  const glowRef = useRef(0)
  const state = useRef({ x: 0, y: null, vx: { v: 0 }, vy: { v: 0 }, bank: 0, pitch: 0 })
  const gammaRef = useRef(0)
  const floatRoll = useMemo(() => makeDrifter(FLOAT_ROLL_MIN, FLOAT_ROLL_MAX, FLOAT_ROLL_TIME_MIN, FLOAT_ROLL_TIME_MAX), [])
  const floatBob = useMemo(() => makeDrifter(FLOAT_BOB_MIN, FLOAT_BOB_MAX, FLOAT_BOB_TIME_MIN, FLOAT_BOB_TIME_MAX), [])

  // Side tilt (motion access is asked for in the Start/Restart tap).
  useEffect(() => {
    const onTilt = (e) => { if (e.gamma !== null && e.gamma !== undefined) gammaRef.current = e.gamma }
    window.addEventListener('deviceorientation', onTilt)
    return () => window.removeEventListener('deviceorientation', onTilt)
  }, [])

  const geometry = useMemo(() => {
    const g = new THREE.ConeGeometry(0.5, 1, 4)
    g.rotateY(Math.PI / 4)   // square base edges along X/Y
    g.rotateX(-Math.PI / 2)  // tip toward -Z
    g.scale(WINGSPAN / 0.707, THICKNESS / 0.707, LENGTH)
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame(({ camera, size }, delta) => {
    const dt = Math.min(delta, 0.05)
    const s = state.current
    const lv = THREE.MathUtils.smoothstep(leftVal.current, 0, 1)

    const { topY, bottomY, spanX } = planeLimits(camera, size)

    const tx = THREE.MathUtils.clamp(gammaRef.current / SIDE_TILT_FULL_DEG, -1, 1) * spanX
    const ty = THREE.MathUtils.lerp(topY, bottomY, lv)
    if (s.y === null) s.y = ty
    s.x = smoothDamp(s.x, tx, s.vx, SIDE_TIME, dt)
    s.y = smoothDamp(s.y, ty, s.vy, ty > s.y ? RISE_TIME : SINK_TIME, dt)

    const k = 1 - Math.exp(-dt / TILT_SMOOTH_S)
    const bankTarget = -BANK_MAX * THREE.MathUtils.clamp(s.vx.v / TILT_FULL_SPEED, -1, 1)
    const pitchTarget = REST_PITCH + PITCH_MAX * THREE.MathUtils.clamp(s.vy.v / TILT_FULL_SPEED, -1, 1)
    s.bank += (bankTarget - s.bank) * k
    s.pitch += (pitchTarget - s.pitch) * k

    const g = groupRef.current
    const y = s.y + floatBob(dt)
    g.position.set(s.x, y, 0)
    g.rotation.set(s.pitch, 0, s.bank + floatRoll(dt))

    const blowing = blowRef ? blowRef.current : 0
    glowRef.current += (blowing - glowRef.current) * (1 - Math.exp(-dt / BLOW_GLOW_SMOOTH_S))
    if (materialRef.current) materialRef.current.emissiveIntensity = EMISSIVE_INTENSITY * (1 + glowRef.current)
    if (planePosRef) { planePosRef.current.x = s.x; planePosRef.current.y = y }
  })

  return (
    <group ref={groupRef}>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          ref={materialRef}
          color={palette.tertiaryColor}
          emissive={palette.primaryColor}
          emissiveIntensity={EMISSIVE_INTENSITY}
          roughness={0.4}
          flatShading
        />
      </mesh>
    </group>
  )
}
