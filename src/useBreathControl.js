import { useEffect, useRef, useState } from 'react'
import {
  FFT_SIZE, BLOW_LOW_HZ, BLOW_HIGH_HZ, BLOW_MAX_TONE, BLOW_CALIBRATE_S,
  createBlowState, resetBlowState, analyzeBlowFrame, buildProfile,
} from './blowDetector'

// Control Options other than the sliders: each one drives the breath value
// v (0 exhale -> 1 inhale) from its own input, and the slider thumbs follow it.
//   'single' -- slide one finger up/down anywhere on the screen
//   'touch'  -- any finger down = inhale, none = exhale
//   'tilt'   -- tip the phone's top edge toward you (inhale) / away (exhale)
//   'blow'   -- blow on the microphone = exhale, quiet = inhale,
//               quiet with a finger on the screen = hold

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
// Blow on the Mic: the detection itself (what counts as a blow, the noise
// floor, the mic check's profile) is in blowDetector.js.
const BLOW_NO_DATA_DB = -110      // below this the analyser has no audio
const MIC_SILENT_MS = 1000        // no audio this long = mic stale, next tap rebuilds it
const BLOW_MIN_RATE_PER_S = 1 / 6 // exhale speed, gentle -> hard blow
const BLOW_MAX_RATE_PER_S = 1 / 2
const BLOW_RELEASE_MS = 300       // pause this long before the inhale starts
const BLOW_INHALE_RATE_PER_S = 1 / 4  // quiet: full inhale in 4 s
// Mic check (every session that uses the mic): quiet, then CAL_BLOWS paced
// breaths: an inhale (CAL_INHALE_S, MicCheck rings the Inhale bell and fills
// its columns), then an exhale that waits for and records one blow (MicCheck
// rings the Exhale bell, and cuts it once the blow starts; the columns drain
// over CAL_EXHALE_S from the bell, suggesting a 5 s exhale, but the player
// may blow on past it and the whole exhale is recorded, quiet end included).
// The blows' average shape across the bands becomes the template, and the
// thresholds (level, match, tone, steadiness, strength range) are set from
// them; the off thresholds also from each blow's last third (buildProfile).
const CAL_QUIET_S = 2
const CAL_BLOWS = 3
const CAL_INHALE_S = 5
const CAL_EXHALE_S = 5          // the columns drain over this, from the Exhale bell
const CAL_MIN_BLOW_S = 0.6        // shorter sounds aren't counted as a blow
const CAL_SKIP_S = 0.15           // each blow's onset isn't recorded
const CAL_END_GRACE_S = 0.5       // a blow ends once the loose detector has been off this long
const CAL_MAX_BLOW_S = 20         // safety cap: nothing past this is recorded
const CAL_HINT_S = 10             // no blow this long: suggest closer / harder
const CAL_DONE_MS = 1200          // "Got it" shows this long

// The last mic check's result, kept across sessions (Skip keeps it).
let blowProfile = null   // { bands, template, matchOn, matchOff, levelOn, levelOff, range, toneMax, jitterMax }

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))

// Must be called inside a tap (iOS asks for motion access). Resolves true
// when tilt readings are allowed.
export function requestTiltPermission() {
  const DOE = typeof window !== 'undefined' ? window.DeviceOrientationEvent : undefined
  if (!DOE) return Promise.resolve(false)
  if (typeof DOE.requestPermission !== 'function') return Promise.resolve(true)
  return DOE.requestPermission().then((r) => r === 'granted').catch(() => false)
}

// The mic, shared by the Control Options card (access only) and the 'blow'
// control. Analysed in its own audio context, separate from breathAudio's.
const MIC_CONSTRAINTS = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }
let mic = null          // { stream, source, analyser, bins }
let micCtx = null
let micPending = null
let micWanted = false   // false once released, so a late grant is dropped
let micStale = false    // live but silent (iOS can do this): rebuild on the next tap
let micGen = 0          // bumped per new stream, so the detector recalibrates

function micLive() {
  return !!(mic && mic.stream.getAudioTracks().some((t) => t.readyState === 'live'))
}

export function releaseMic() {
  micWanted = false
  if (!mic) return
  mic.stream.getTracks().forEach((t) => t.stop())
  mic.source.disconnect()
  mic.analyser.disconnect()
  mic = null
}

// Must be called inside a tap (iOS asks for the mic, and the analysis
// context has to start in a tap). keep = false only asks for access and lets
// go (Control Options card). Resolves true when the mic is allowed.
export function requestMicAccess(keep = true) {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : undefined
  if (!md || !md.getUserMedia || !AC) return Promise.resolve(false)
  if (keep) {
    micWanted = true
    if (micStale && !micPending) {
      // Silent mic: start over with a new stream and context.
      releaseMic()
      micWanted = true
      micCtx?.close().catch(() => {})
      micCtx = null
      micStale = false
    }
    if (!micCtx || micCtx.state === 'closed') micCtx = new AC()
    if (micCtx.state !== 'running') micCtx.resume().catch(() => {})
    if (micLive()) return Promise.resolve(true)
  }
  if (micPending) return micPending
  micPending = md.getUserMedia(MIC_CONSTRAINTS).then((stream) => {
    if (!micWanted) { stream.getTracks().forEach((t) => t.stop()); return true }
    releaseMic()
    micWanted = true
    const source = micCtx.createMediaStreamSource(stream)
    const analyser = micCtx.createAnalyser()
    analyser.fftSize = FFT_SIZE
    analyser.smoothingTimeConstant = 0
    // Safari only runs an analyser that reaches the output: through a muted gain.
    const sink = micCtx.createGain()
    sink.gain.value = 0
    source.connect(analyser)
    analyser.connect(sink)
    sink.connect(micCtx.destination)
    mic = { stream, source, analyser, bins: new Float32Array(analyser.frequencyBinCount) }
    micStale = false
    micGen++
    return true
  }).catch(() => false).finally(() => { micPending = null })
  return micPending
}

const onButton = (e) => !!(e.target && e.target.closest && e.target.closest('button'))

// control: 'single' | 'touch' | 'tilt' | 'blow' | null (off). onValue(v) is
// called whenever v changes. blowRef (blow only) is set to 1 while the mic
// hears a blow, else 0. blowDetailRef (blow only, optional) gets
// { candidate, strict, tone, why } each frame: candidate = a blow that lasts,
// is steady and has the user's shape but may still be under a ringing bell
// (looser tone limit), strict = blowRef's detector, why = the first strict
// rule failing; the Space Ship flies on either. getQuietRate() (blow only) gives the rise while
// quiet: null = no pace (BLOW_INHALE_RATE_PER_S), else v/s. allSensors (Input Test) reads tilt and
// mic whatever the control; readoutRef gets { tilt, mic, blowing } each frame
// (tilt 0 flat/exhale -> 1 upright/inhale, mic = blow strength 0 -> 1; null =
// no reading). Returns v for the thumbs (null when off).
// Mic check: a new non-zero calibrateKey starts one (0 = none); calStatusRef
// gets { step, blows, needed, hint, level } each frame for the overlay, and
// onCalibrated() is called when it's done.
export function useBreathControl({ control, disabledRef, resetKey, onValue, onTiltFail, onMicFail, getQuietRate, blowRef, blowDetailRef, allSensors = false, readoutRef, calibrateKey = 0, calStatusRef, onCalibrated }) {
  const [shown, setShown] = useState(null)
  const onValueRef = useRef(onValue)
  onValueRef.current = onValue
  const onTiltFailRef = useRef(onTiltFail)
  onTiltFailRef.current = onTiltFail
  const onMicFailRef = useRef(onMicFail)
  onMicFailRef.current = onMicFail
  const getQuietRateRef = useRef(getQuietRate)
  getQuietRateRef.current = getQuietRate
  const onCalibratedRef = useRef(onCalibrated)
  onCalibratedRef.current = onCalibrated
  const calibrateKeyRef = useRef(calibrateKey)
  calibrateKeyRef.current = calibrateKey
  const vRef = useRef(0)

  useEffect(() => { vRef.current = 0 }, [resetKey])

  useEffect(() => {
    if (!control) { setShown(null); return }
    vRef.current = 0
    let lastSent = -1
    const disabled = () => !!disabledRef?.current
    const useMic = control === 'blow' || allSensors
    const useTilt = control === 'tilt' || allSensors

    // Pointers held down (not on buttons).
    const down = new Map()   // pointerId -> { y, t, lastMoveT }
    let single = null        // the Single Slider finger { id, y, t, moveT }
    let speed = 0            // Single Slider: smoothed finger speed in v units/s (+ = up)
    let glideDir = 0         // +1 / -1 while gliding to an end
    let tiltTarget = null
    let gotTilt = false
    // Blow on the Mic: the detector's state (blowDetector.js). raw = the
    // loose detector (loud and broad, nothing else), used by the mic check to
    // find the user's blows; candidate / on = see analyzeBlowFrame.
    const blow = createBlowState()
    let blowGen = -1
    let silentMs = 0
    let lastOnT = -Infinity
    // Mic check state (see CAL_*).
    const cal = { key: 0, step: 'idle', t: 0, quiet: [], frames: [], excesses: [], tones: [], jitters: [], cur: null, blows: 0, noBlowT: 0 }
    // ?micdebug in the URL shows the detector's numbers, for tuning on a phone.
    let debugEl = null
    let lastBlock = null
    if (useMic && /[?&]micdebug/.test(window.location.search)) {
      debugEl = document.createElement('div')
      Object.assign(debugEl.style, {
        position: 'fixed', top: '40px', left: '8px', zIndex: 1000, pointerEvents: 'none',
        font: '12px monospace', color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '4px 6px', whiteSpace: 'pre',
      })
      document.body.appendChild(debugEl)
    }

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
      // The phone drops the mic when locked or backgrounded: any tap gets it back.
      if (useMic) requestMicAccess().then((ok) => { if (!ok) onMicFailRef.current?.() })
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
    if (useTilt) window.addEventListener('deviceorientation', onTilt)
    if (control === 'tilt') {
      tiltTimer = setTimeout(() => { if (!gotTilt) onTiltFailRef.current?.() }, TILT_NO_READING_MS)
    }

    const blowOff = () => { blow.on = blow.raw = blow.candidate = false }
    // Reads the mic into blow.on / blow.candidate / blow.strength (0-1).
    const readBlow = (dt) => {
      if (!micLive()) { blowOff(); silentMs = 0; return }
      const { analyser, bins } = mic
      analyser.getFloatFrequencyData(bins)
      const hz = micCtx.sampleRate / FFT_SIZE
      const lo = Math.max(1, Math.round(BLOW_LOW_HZ / hz))
      const hi = Math.min(bins.length - 1, Math.round(BLOW_HIGH_HZ / hz))
      const n = Math.max(1, hi - lo + 1)
      if (blowGen !== micGen) { blowGen = micGen; resetBlowState(blow, lo, n, hz) }

      // No audio (context not running, or a silent stream): after a while, mark
      // the mic stale so the next tap rebuilds it.
      let total = 0
      for (let i = 0; i < n; i++) total += Math.pow(10, bins[lo + i] / 10)
      const level = 10 * Math.log10(total / n + 1e-30)
      if (level < BLOW_NO_DATA_DB || micCtx.state !== 'running') {
        silentMs += dt * 1000
        if (silentMs > MIC_SILENT_MS) micStale = true
        blowOff()
        return
      }
      silentMs = 0

      // The mic check's profile applies once it's done (not while it records).
      const prof = blowProfile && blowProfile.bands === blow.bands
        && cal.step !== 'wait' && cal.step !== 'quiet' && cal.step !== 'inhale' && cal.step !== 'exhale' ? blowProfile : null
      analyzeBlowFrame(blow, bins, lo, n, hz, dt, { prof, calExhale: cal.step === 'exhale' })
    }

    // Mic check, run each frame after readBlow while a calibrateKey is set.
    const stepCal = (dt) => {
      const key = calibrateKeyRef.current
      if (key !== cal.key) {
        cal.key = key
        cal.step = key ? 'wait' : 'idle'
        cal.t = 0
        cal.quiet = []
        cal.frames = []
        cal.excesses = []
        cal.tones = []
        cal.jitters = []
        cal.tailExcesses = []
        cal.tailFrames = []
        cal.cur = null
        cal.blows = 0
        cal.noBlowT = 0
      }
      if (cal.step === 'idle') return
      const ready = micLive() && blow.calS >= BLOW_CALIBRATE_S && silentMs === 0
      cal.t += dt
      if (cal.step === 'wait') {
        if (ready) { cal.step = 'quiet'; cal.t = 0 }
      } else if (cal.step === 'quiet') {
        if (ready) cal.quiet.push(blow.excess)
        if (cal.t >= CAL_QUIET_S) { cal.step = 'inhale'; cal.t = 0 }
      } else if (cal.step === 'inhale') {
        if (cal.t >= CAL_INHALE_S) { cal.step = 'exhale'; cal.t = 0; cal.noBlowT = 0 }
      } else if (cal.step === 'exhale') {
        // A blow starts only when it isn't tonal, so the Exhale bell doesn't count.
        // It ends only once the loose detector has been off CAL_END_GRACE_S, so
        // the quiet, flickering end of a long exhale stays part of it; frames
        // are recorded only while the loose detector hears it.
        const on = blow.raw && (!!cal.cur || blow.tone < BLOW_MAX_TONE)
        if (on && !cal.cur) cal.cur = { t: 0, offT: 0, frames: [], excesses: [], tones: [], jitters: [] }
        if (cal.cur) {
          const c = cal.cur
          c.t += dt
          c.offT = on ? 0 : c.offT + dt
          if (on && c.t > CAL_SKIP_S && c.t < CAL_MAX_BLOW_S) {
            c.frames.push(Float32Array.from(blow.rise))
            c.excesses.push(blow.excess)
            c.tones.push(blow.tone)
            c.jitters.push(blow.jitter)
          }
          if (c.offT >= CAL_END_GRACE_S) {
            if (c.t - c.offT >= CAL_MIN_BLOW_S && c.frames.length) {
              cal.frames.push(...c.frames)
              cal.excesses.push(...c.excesses)
              cal.tones.push(...c.tones)
              cal.jitters.push(...c.jitters)
              // The last third: how quiet (and what shape) this user's exhale gets as it ends.
              const tail = Math.floor((c.frames.length * 2) / 3)
              cal.tailFrames.push(...c.frames.slice(tail))
              cal.tailExcesses.push(...c.excesses.slice(tail))
              cal.blows++
              cal.noBlowT = 0
              if (cal.blows < CAL_BLOWS) { cal.step = 'inhale'; cal.t = 0 }
            }
            cal.cur = null
          }
        }
        if (!cal.cur) cal.noBlowT += dt
        if (cal.blows >= CAL_BLOWS) {
          blowProfile = buildProfile(cal.frames, cal.excesses, cal.tones, cal.jitters, cal.quiet, cal.tailExcesses, cal.tailFrames)
          cal.step = 'done'
          cal.t = 0
        }
      } else if (cal.step === 'done' && cal.t * 1000 >= CAL_DONE_MS) {
        cal.step = 'finished'
        onCalibratedRef.current?.()
      }
    }

    let raf = 0
    let prev = performance.now()
    const tick = (now) => {
      const dt = Math.min(0.1, (now - prev) / 1000)
      prev = now
      let v = vRef.current
      if (useMic) { readBlow(dt); stepCal(dt) }   // keeps the noise floor current even while disabled
      if (calStatusRef) {
        calStatusRef.current = cal.step === 'idle' ? null : {
          step: cal.step,
          blows: cal.blows,
          needed: CAL_BLOWS,
          blowing: !!cal.cur,
          hint: cal.step === 'exhale' && cal.noBlowT > CAL_HINT_S,
          // Like a ball thrown up: the fill slows to a stop at the top (ease-out),
          // then the drain starts slowly and speeds up (ease-in), so there's no bounce.
          inhaleP: cal.step === 'inhale' ? Math.sin(clamp(cal.t / CAL_INHALE_S, 0, 1) * Math.PI / 2)
            : cal.step === 'exhale' ? Math.cos(clamp(cal.t / CAL_EXHALE_S, 0, 1) * Math.PI / 2) : 0,
          level: clamp(blow.excess / 15, 0, 1),
        }
      }
      if (blowRef) blowRef.current = control === 'blow' && blow.on ? 1 : 0
      if (blowDetailRef && blowDetailRef.current) {
        const d = blowDetailRef.current
        const isBlow = control === 'blow'
        d.candidate = isBlow && blow.candidate
        d.strict = isBlow && blow.on
        d.tone = isBlow ? blow.tone : 0
        d.why = isBlow ? blow.why : ''
        d.rise = isBlow ? blow.excess : 0
        d.offWhy = isBlow ? blow.offWhy : ''
        d.offRise = isBlow ? blow.offRise : 0
      }
      if (readoutRef) {
        readoutRef.current = {
          tilt: tiltTarget,
          mic: useMic && micLive() && blow.calS >= BLOW_CALIBRATE_S ? blow.strength : null,
          blowing: blow.on,
          match: useMic ? blow.match : null,
          tone: useMic && micLive() && blow.calS >= BLOW_CALIBRATE_S ? blow.tone : null,
          v,
        }
      }
      if (debugEl) {
        const status = !micLive() ? 'mic off'
          : silentMs > 0 ? (micStale ? 'no audio - tap to restart mic' : 'no audio')
          : blow.calS < BLOW_CALIBRATE_S ? 'calibrating' : blow.on ? 'BLOWING'
          : blow.why === 'level' ? 'quiet' : `blocked by ${blow.why}`
        // The last block and the last stop stay on screen (they only flash by live).
        if (status.startsWith('blocked')) lastBlock = { why: blow.why, rise: blow.excess, clock: blow.clock }
        const ago = (c) => `${Math.max(0, blow.clock - c).toFixed(1)}s ago`
        const levelOffNow = blowProfile ? blowProfile.levelOff : null
        debugEl.textContent =`mic ${micLive() ? 'live' : 'off'}  ctx ${micCtx ? micCtx.state : '--'}  silent ${Math.round(silentMs)}ms\n`
          + `rise ${blow.excess.toFixed(1)}dB (frame ${blow.frameExcess.toFixed(1)})  bands ${Math.round(blow.coverage * 100)}%\n`
          + `sustain ${Math.round(blow.sustain * 100)}%  jitter ${blow.jitter.toFixed(1)}dB  tone ${blow.tone.toFixed(2)}  match ${blow.match === null ? '--' : blow.match.toFixed(2)}\n`
          + `raw ${blow.raw ? 'on' : 'off'}  cand ${blow.candidate ? 'on' : 'off'}  check ${cal.step}\n`
          + (blowProfile
            ? `profile: level ${blowProfile.levelOn.toFixed(1)}/${blowProfile.levelOff.toFixed(1)}dB  match ${blowProfile.template ? `${blowProfile.matchOn.toFixed(2)}/${blowProfile.matchOff.toFixed(2)}` : 'off'}  tone ${blowProfile.toneMax.toFixed(2)}  jitter ${blowProfile.jitterMax.toFixed(1)}\n`
            : 'profile: none\n')
          + `${status}  tilt ${tiltTarget === null ? '--' : tiltTarget.toFixed(2)}  v ${v.toFixed(2)}\n`
          + `last block: ${lastBlock ? `${lastBlock.why} (rise ${lastBlock.rise.toFixed(1)}dB) ${ago(lastBlock.clock)}` : '--'}\n`
          + `last stop: ${blow.offWhy ? `${blow.offWhy} (rise ${blow.offRise.toFixed(1)}dB${levelOffNow === null ? '' : `, stop level ${levelOffNow.toFixed(1)}`}) ${ago(blow.offClock)}` : '--'}`
      }
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
      } else if (control === 'blow') {
        if (blow.on) {
          lastOnT = now
          const rate = BLOW_MIN_RATE_PER_S + (BLOW_MAX_RATE_PER_S - BLOW_MIN_RATE_PER_S) * blow.strength
          v = Math.max(0, v - rate * dt)
        } else if (down.size === 0 && now - lastOnT > BLOW_RELEASE_MS) {
          // A finger on the screen (not on a button) holds; blowing still exhales.
          const rate = getQuietRateRef.current?.() ?? BLOW_INHALE_RATE_PER_S
          v = Math.min(1, v + rate * dt)
        }
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
      if (useMic) releaseMic()
      if (blowRef) blowRef.current = 0
      if (blowDetailRef && blowDetailRef.current) Object.assign(blowDetailRef.current, { candidate: false, strict: false, tone: 0, why: '', rise: 0, offWhy: '', offRise: 0 })
      if (readoutRef) readoutRef.current = null
      if (calStatusRef) calStatusRef.current = null
      debugEl?.remove()
    }
  }, [control, disabledRef, allSensors])

  return shown
}
