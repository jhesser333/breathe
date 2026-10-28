import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { balloonLimits, balloonY, balloonScale, BALLOON_R, KNOT_R, KNOT_H, WALL_FRONT_Z } from './balloonH'

// Shape H: Balloon (in-progress). A gray-box helium balloon on the Paper
// Airplane's camera. Breath (leftVal = breathRef, 0 exhale -> 1 inhale)
// inflates it from tall and thin at full Exhale to round at full Inhale while
// it rises from the rest height to flight height; phone side tilt moves it
// left/right like the airplane. BalloonCourseH sets the overrides in
// balloonStateRef:
//   mode 'follow'  -- follows the controls.
//   mode 'travel'  -- the exhale trip: tips forward (top toward -Z), holds its
//                     height until the last 20% of the exhale, then drops and
//                     turns upright (stays tipped until the course is
//                     TIP_HOLD_P of the way there).
//   mode 'deflate' -- a missed exhale: shrinks back to full Exhale and rest
//                     height, ignoring the controls.
//   bounceStart    -- clock time of a bump into the door/wall: it moves
//                     forward, squashes flat against the face and springs back.
// Writes planePosRef (x, y) and balloonStateRef.bottom for the course.
const EMISSIVE_INTENSITY = 0.3
const FOLLOW_TIME = 0.1     // smoothDamp seconds on the breath value
const DEFLATE_TIME = 0.6
const Y_TIME = 0.25
const SIDE_TIME = 1.5
const SIDE_TILT_FULL_DEG = 25
const DROP_START = 0.2      // the last 20% of the exhale drops the balloon
const TIP_HOLD_P = 0.85     // stay tipped until the course is this far along
const TIP_SMOOTH_S = 0.2
// Bounce timeline (seconds): reach the face, press flat, spring back.
const BOUNCE_IN = 0.3
const BOUNCE_PRESS = 0.15
const BOUNCE_OUT = 0.7
const SQUASH_XY = 0.3       // pancake: X/Y grow by this, Z shrinks by SQUASH_Z
const SQUASH_Z = 0.65

const smooth = (t) => THREE.MathUtils.smoothstep(t, 0, 1)

// Unity-style SmoothDamp (as MorphG): eases toward target; vel is { v }.
function smoothDamp(current, target, vel, smoothTime, dt) {
  const omega = 2 / smoothTime
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (vel.v + omega * change) * dt
  vel.v = (vel.v - omega * temp) * exp
  return target + (change + temp) * exp
}

export default function MorphH({ leftVal, palette, planePosRef, balloonStateRef }) {
  const outerRef = useRef()
  const tipRef = useRef()
  const shapeRef = useRef()
  const state = useRef({ x: 0, vx: { v: 0 }, y: null, vy: { v: 0 }, lv: 0, vlv: { v: 0 }, tip: 0, travelY: null })
  const gammaRef = useRef(0)
  const scaleRef = useRef(new THREE.Vector3())

  useEffect(() => {
    const onTilt = (e) => { if (e.gamma !== null && e.gamma !== undefined) gammaRef.current = e.gamma }
    window.addEventListener('deviceorientation', onTilt)
    return () => window.removeEventListener('deviceorientation', onTilt)
  }, [])

  const sphere = useMemo(() => new THREE.SphereGeometry(BALLOON_R, 48, 32), [])
  const knot = useMemo(() => new THREE.ConeGeometry(KNOT_R, KNOT_H, 24), [])
  useEffect(() => () => { sphere.dispose(); knot.dispose() }, [sphere, knot])

  useFrame(({ camera, size, clock }, delta) => {
    const dt = Math.min(delta, 0.05)
    const s = state.current
    const b = balloonStateRef?.current || { mode: 'follow', travelP: 0, bounceStart: -Infinity }
    const limits = balloonLimits(camera, size)
    const lvIn = THREE.MathUtils.smoothstep(leftVal.current, 0, 1)

    // Breath value: the controls, or shrinking to 0 on a miss.
    const deflating = b.mode === 'deflate'
    s.lv = THREE.MathUtils.clamp(smoothDamp(s.lv, deflating ? 0 : lvIn, s.vlv, deflating ? DEFLATE_TIME : FOLLOW_TIME, dt), 0, 1)
    const scale = balloonScale(s.lv, scaleRef.current)

    // Height: the breath, except on the trip, where it holds the height it
    // left at until the last DROP_START of the exhale.
    let ty
    if (b.mode === 'travel') {
      if (s.travelY === null) s.travelY = s.y ?? balloonY(limits, s.lv)
      ty = THREE.MathUtils.lerp(limits.restY, s.travelY, THREE.MathUtils.smoothstep(lvIn, 0, DROP_START))
    } else {
      s.travelY = null
      ty = balloonY(limits, s.lv)
    }
    if (s.y === null) s.y = ty
    s.y = smoothDamp(s.y, ty, s.vy, Y_TIME, dt)

    // Tip forward on the trip; upright as it drops (not before TIP_HOLD_P).
    let tipTarget = 0
    if (b.mode === 'travel') {
      tipTarget = b.travelP < TIP_HOLD_P ? 1 : THREE.MathUtils.smoothstep(lvIn, 0, DROP_START)
    }
    s.tip += (tipTarget - s.tip) * (1 - Math.exp(-dt / TIP_SMOOTH_S))

    const tx = THREE.MathUtils.clamp(gammaRef.current / SIDE_TILT_FULL_DEG, -1, 1) * limits.spanX
    s.x = smoothDamp(s.x, tx, s.vx, SIDE_TIME, dt)

    // Bounce: forward to the face, pressed flat, then back.
    let z = 0
    let squash = 0
    const bt = clock.elapsedTime - (b.bounceStart ?? -Infinity)
    if (bt >= 0 && bt < BOUNCE_IN + BOUNCE_PRESS + BOUNCE_OUT) {
      if (bt < BOUNCE_IN) squash = 0
      else if (bt < BOUNCE_IN + BOUNCE_PRESS) squash = Math.sin(Math.PI * (bt - BOUNCE_IN) / BOUNCE_PRESS * 0.5)
      else squash = 1 - smooth((bt - BOUNCE_IN - BOUNCE_PRESS) / (BOUNCE_OUT * 0.5))
      const contact = -(-WALL_FRONT_Z - BALLOON_R * scale.z * (1 - SQUASH_Z * squash))
      if (bt < BOUNCE_IN) z = contact * smooth(bt / BOUNCE_IN)
      else if (bt < BOUNCE_IN + BOUNCE_PRESS) z = contact
      else z = contact * (1 - smooth((bt - BOUNCE_IN - BOUNCE_PRESS) / BOUNCE_OUT))
    }

    outerRef.current.position.set(s.x, s.y, z)
    outerRef.current.scale.set(1 + SQUASH_XY * squash, 1 + SQUASH_XY * squash, 1 - SQUASH_Z * squash)
    tipRef.current.rotation.x = -Math.PI / 2 * s.tip
    shapeRef.current.scale.copy(scale)

    if (planePosRef) { planePosRef.current.x = s.x; planePosRef.current.y = s.y }
    if (balloonStateRef) balloonStateRef.current.bottom = s.y - BALLOON_R * scale.y - KNOT_H
  })

  return (
    <group ref={outerRef}>
      <group ref={tipRef}>
        <group ref={shapeRef}>
          <mesh geometry={sphere}>
            <meshStandardMaterial color={palette.tertiaryColor} emissive={palette.primaryColor} emissiveIntensity={EMISSIVE_INTENSITY} roughness={0.4} />
          </mesh>
          <mesh geometry={knot} position={[0, -BALLOON_R - KNOT_H / 2 + 0.02, 0]}>
            <meshStandardMaterial color={palette.tertiaryColor} emissive={palette.primaryColor} emissiveIntensity={EMISSIVE_INTENSITY} roughness={0.4} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
