import { useEffect, useRef, useState } from 'react'

// Control Options other than the sliders: each one drives the breath value
// v (0 exhale -> 1 inhale) from its own input, and the slider thumbs follow it.
//   'single' -- slide one finger up/down anywhere on the screen
//   'touch'  -- any finger down = inhale, none = exhale
//   'tilt'   -- tip the phone's top edge toward you (inhale) / away (exhale)

// Single Slider
const SINGLE_TRAVEL_FRAC = 1 / 3  // finger travel (of screen height) for full Exhale -> Inhale
const STILL_PX = 2                // moves smaller than this count as still (jitter)
const STILL_MS = 120              // still this long = stopped: glide on to the end
const MIN_GLIDE_PER_S = 1 / 3     // glide never slower than a full trip in 3 s
const SPEED_SMOOTH_S = 0.08       // smoothing of the finger's speed
// Touch the Screen
const TOUCH_RATE_PER_S = 1 / 3    // full trip in 3 s, from wherever v is
// Tilt Your Phone (deviceorientation beta: 0 flat, 90 upright)
const TILT_EXHALE_DEG = 25
const TILT_INHALE_DEG = 65        // 25 degrees back from vertical
const TILT_SMOOTH_S = 0.15
const TILT_NO_READING_MS = 1000   // no reading this long after starting = no sensor

// Must be called inside a tap (iOS asks for motion access). Resolves true
// when tilt readings are allowed.
export function requestTiltPermission() {
  const DOE = typeof window !== 'undefined' ? window.DeviceOrientationEvent : undefined
  if (!DOE) return Promise.resolve(false)
  if (typeof DOE.requestPermission !== 'function') return Promise.resolve(true)
  return DOE.requestPermission().then((r) => r === 'granted').catch(() => false)
}

const onButton = (e) => !!(e.target && e.target.closest && e.target.closest('button'))

// control: 'single' | 'touch' | 'tilt' | null (off). onValue(v) is called
// whenever v changes. Returns v for the thumbs (null when off).
export function useBreathControl({ control, disabledRef, resetKey, onValue, onTiltFail }) {
  const [shown, setShown] = useState(null)
  const onValueRef = useRef(onValue)
  onValueRef.current = onValue
  const onTiltFailRef = useRef(onTiltFail)
  onTiltFailRef.current = onTiltFail
  const vRef = useRef(0)

  useEffect(() => { vRef.current = 0 }, [resetKey])

  useEffect(() => {
    if (!control) { setShown(null); return }
    vRef.current = 0
    let lastSent = -1
    const disabled = () => !!disabledRef?.current

    // Pointers held down (not on buttons).
    const down = new Map()   // pointerId -> { y, t, lastMoveT }
    let single = null        // the Single Slider finger { id, y, t, moveT }
    let speed = 0            // Single Slider: smoothed finger speed in v units/s (+ = up)
    let glideDir = 0         // +1 / -1 while gliding to an end
    let tiltTarget = null
    let gotTilt = false

    const onDown = (e) => {
      if (onButton(e)) return
      const now = performance.now()
      down.set(e.pointerId, true)
      if (control === 'single' && !single) {
        single = { id: e.pointerId, y: e.clientY, t: now, moveT: now }
        speed = 0
        glideDir = 0
      }
    }
    const onMove = (e) => {
      if (control !== 'single' || !single || e.pointerId !== single.id) return
      const now = performance.now()
      const dyPx = single.y - e.clientY            // up = positive
      if (Math.abs(dyPx) < STILL_PX) return
      const dt = Math.max(0.001, (now - single.t) / 1000)
      const dv = dyPx / (window.innerHeight * SINGLE_TRAVEL_FRAC)
      if (!disabled()) {
        vRef.current = Math.min(1, Math.max(0, vRef.current + dv))
        const k = 1 - Math.exp(-dt / SPEED_SMOOTH_S)
        // A turnaround takes over at once instead of easing through zero.
        speed = Math.sign(dv) !== Math.sign(speed) ? dv / dt : speed + (dv / dt - speed) * k
        glideDir = 0
      }
      single.y = e.clientY
      single.t = now
      single.moveT = now
    }
    const onUp = (e) => {
      down.delete(e.pointerId)
      if (single && e.pointerId === single.id) {
        if (Math.abs(speed) > 0) glideDir = Math.sign(speed)
        single = null
      }
    }
    const onTilt = (e) => {
      if (e.beta === null || e.beta === undefined) return
      gotTilt = true
      tiltTarget = Math.min(1, Math.max(0, (e.beta - TILT_EXHALE_DEG) / (TILT_INHALE_DEG - TILT_EXHALE_DEG)))
    }

    const opts = { passive: true }
    window.addEventListener('pointerdown', onDown, opts)
    window.addEventListener('pointermove', onMove, opts)
    window.addEventListener('pointerup', onUp, opts)
    window.addEventListener('pointercancel', onUp, opts)
    let tiltTimer = null
    if (control === 'tilt') {
      window.addEventListener('deviceorientation', onTilt)
      tiltTimer = setTimeout(() => { if (!gotTilt) onTiltFailRef.current?.() }, TILT_NO_READING_MS)
    }

    let raf = 0
    let prev = performance.now()
    const tick = (now) => {
      const dt = Math.min(0.1, (now - prev) / 1000)
      prev = now
      let v = vRef.current
      if (disabled()) {
        glideDir = 0
      } else if (control === 'single') {
        // Finger held still partway: glide on in its last direction.
        if (single && glideDir === 0 && now - single.moveT > STILL_MS && speed !== 0) glideDir = Math.sign(speed)
        if (glideDir !== 0) {
          const rate = Math.max(Math.abs(speed), MIN_GLIDE_PER_S)
          v = Math.min(1, Math.max(0, v + glideDir * rate * dt))
          if (v === 0 || v === 1) { glideDir = 0; speed = 0 }
        }
      } else if (control === 'touch') {
        const target = down.size > 0 ? 1 : 0
        const step = TOUCH_RATE_PER_S * dt
        v = v < target ? Math.min(target, v + step) : Math.max(target, v - step)
      } else if (control === 'tilt' && tiltTarget !== null) {
        v += (tiltTarget - v) * (1 - Math.exp(-dt / TILT_SMOOTH_S))
        if (Math.abs(tiltTarget - v) < 0.0005) v = tiltTarget
      }
      vRef.current = v
      if (Math.abs(v - lastSent) > 0.0001) {
        lastSent = v
        onValueRef.current?.(v)
        setShown(v)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(tiltTimer)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('deviceorientation', onTilt)
    }
  }, [control, disabledRef])

  return shown
}
