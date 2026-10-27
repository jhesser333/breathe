import { useEffect, useRef, useState } from 'react'

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
// Blow on the Mic. Blowing on a mic is loud, noise-like and mostly low
// frequency; a breath from arm's length is a quieter, higher hiss. Speech
// and the app's own sounds are tonal. The band is split into narrow bands,
// each with its own noise floor, so steady room noise (a fan, white noise)
// cancels out and a blow shows as many bands rising at once.
const FFT_SIZE = 1024
const BLOW_LOW_HZ = 50            // band the blow is measured in
const BLOW_HIGH_HZ = 3000
const BINS_PER_BAND = 4           // FFT bins averaged into each band (~190 Hz)
const BAND_SMOOTH_S = 0.1         // each band's level is smoothed over this
const BAND_ON_DB = 3              // a band this far above its floor has risen
const BLOW_ON_COVERAGE = 0.35     // share of bands risen to start blowing...
const BLOW_ON_DB = 3              // ...with the bands' average this far above the floor
const BLOW_OFF_COVERAGE = 0.2     // blowing stops below either of these (hysteresis)
const BLOW_OFF_DB = 1.5
const BLOW_RANGE_DB = 12          // OFF + this average = full strength
const BLOW_MIN_FLATNESS = 0.3     // flatness of the rise across bands needed to start (0 tone -> 1 even)
// Noise floor: each band's lowest level over the last FLOOR_WINDOW_S (kept as
// FLOOR_SLOTS sub-windows), so it follows a quieter or louder room within
// about 2 s. Frozen while blowing, up to FLOOR_FREEZE_MAX_S.
const FLOOR_WINDOW_S = 2
const FLOOR_SLOTS = 8
const FLOOR_SMOOTH_S = 0.2
const FLOOR_BIAS_DB = 1.5         // the minimum sits below the average level; lift it back
const FLOOR_FREEZE_MAX_S = 8
const BLOW_CALIBRATE_S = 0.5      // first stretch of real audio sets the floor
const BLOW_NO_DATA_DB = -110      // below this the analyser has no audio
const MIC_SILENT_MS = 1000        // no audio this long = mic stale, next tap rebuilds it
const BLOW_MIN_RATE_PER_S = 1 / 6 // exhale speed, gentle -> hard blow
const BLOW_MAX_RATE_PER_S = 1 / 2
const BLOW_RELEASE_MS = 300       // pause this long before the inhale starts
const BLOW_INHALE_RATE_PER_S = 1 / 4  // quiet: full inhale in 4 s

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
// hears a blow, else 0. getQuietRate() (blow only) gives the rise while
// quiet: null = no pace (BLOW_INHALE_RATE_PER_S), else v/s.
// Returns v for the thumbs (null when off).
export function useBreathControl({ control, disabledRef, resetKey, onValue, onTiltFail, onMicFail, getQuietRate, blowRef }) {
  const [shown, setShown] = useState(null)
  const onValueRef = useRef(onValue)
  onValueRef.current = onValue
  const onTiltFailRef = useRef(onTiltFail)
  onTiltFailRef.current = onTiltFail
  const onMicFailRef = useRef(onMicFail)
  onMicFailRef.current = onMicFail
  const getQuietRateRef = useRef(getQuietRate)
  getQuietRateRef.current = getQuietRate
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
    // Blow on the Mic: per-band smoothed power and noise floor, blowing state.
    const blow = {
      gen: -1, bands: 0, power: null, floor: null, slots: null, slotMin: null, slotT: 0, slotI: 0,
      calS: 0, onS: 0, silentMs: 0,
      on: false, strength: 0, lastOnT: -Infinity, excess: 0, coverage: 0, flatness: 0,
    }
    const resetBlow = (bands) => {
      blow.gen = micGen
      blow.bands = bands
      blow.power = new Float32Array(bands)
      blow.floor = new Float32Array(bands)
      blow.slots = Array.from({ length: FLOOR_SLOTS }, () => new Float32Array(bands).fill(Infinity))
      blow.slotMin = new Float32Array(bands).fill(Infinity)
      blow.slotT = 0
      blow.slotI = 0
      blow.calS = 0
      blow.onS = 0
      blow.on = false
      blow.strength = 0
      blow.excess = blow.coverage = blow.flatness = 0
    }
    // ?micdebug in the URL shows the detector's numbers, for tuning on a phone.
    let debugEl = null
    if (control === 'blow' && /[?&]micdebug/.test(window.location.search)) {
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
      if (control === 'blow') requestMicAccess().then((ok) => { if (!ok) onMicFailRef.current?.() })
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

    // Reads the mic into blow.on / blow.strength (0-1).
    const readBlow = (dt) => {
      if (!micLive()) { blow.on = false; blow.silentMs = 0; return }
      const { analyser, bins } = mic
      analyser.getFloatFrequencyData(bins)
      const hz = micCtx.sampleRate / FFT_SIZE
      const lo = Math.max(1, Math.round(BLOW_LOW_HZ / hz))
      const hi = Math.min(bins.length - 1, Math.round(BLOW_HIGH_HZ / hz))
      const bands = Math.max(1, Math.floor((hi - lo + 1) / BINS_PER_BAND))
      if (blow.gen !== micGen || blow.bands !== bands) resetBlow(bands)

      // No audio (context not running, or a silent stream): after a while, mark
      // the mic stale so the next tap rebuilds it.
      let total = 0
      for (let i = lo; i <= hi; i++) total += Math.pow(10, bins[i] / 10)
      const level = 10 * Math.log10(total / (hi - lo + 1) + 1e-30)
      if (level < BLOW_NO_DATA_DB || micCtx.state !== 'running') {
        blow.silentMs += dt * 1000
        if (blow.silentMs > MIC_SILENT_MS) micStale = true
        blow.on = false
        return
      }
      blow.silentMs = 0

      // Each band's power, smoothed.
      const kp = 1 - Math.exp(-dt / BAND_SMOOTH_S)
      const first = blow.calS === 0
      for (let b = 0; b < bands; b++) {
        let p = 0
        for (let j = 0; j < BINS_PER_BAND; j++) p += Math.pow(10, bins[lo + b * BINS_PER_BAND + j] / 10)
        p /= BINS_PER_BAND
        blow.power[b] = first ? p : blow.power[b] + (p - blow.power[b]) * kp
      }

      // Floor = each band's lowest level over the window. Held while blowing, so
      // a blow never becomes the floor (but not forever, so it can't stick on).
      const calibrating = blow.calS < BLOW_CALIBRATE_S
      blow.onS = blow.on ? blow.onS + dt : 0
      if (calibrating || !blow.on || blow.onS > FLOOR_FREEZE_MAX_S) {
        for (let b = 0; b < bands; b++) blow.slotMin[b] = Math.min(blow.slotMin[b], blow.power[b])
        blow.slotT += dt
        if (blow.slotT >= FLOOR_WINDOW_S / FLOOR_SLOTS) {
          blow.slots[blow.slotI].set(blow.slotMin)
          blow.slotI = (blow.slotI + 1) % FLOOR_SLOTS
          blow.slotMin.fill(Infinity)
          blow.slotT = 0
        }
      }
      const kf = 1 - Math.exp(-dt / FLOOR_SMOOTH_S)
      const bias = Math.pow(10, FLOOR_BIAS_DB / 10)
      for (let b = 0; b < bands; b++) {
        let m = blow.slotMin[b]
        for (let s = 0; s < FLOOR_SLOTS; s++) m = Math.min(m, blow.slots[s][b])
        m *= bias
        blow.floor[b] = calibrating ? m : blow.floor[b] + (m - blow.floor[b]) * kf
      }
      if (calibrating) { blow.calS += dt; blow.on = false; return }

      // Rise over the floor: average dB, share of bands risen, and how evenly the
      // rise is spread (a tone lifts a few bands, a breath lifts them all).
      let dbSum = 0, risen = 0, ratioSum = 0, logRatioSum = 0
      for (let b = 0; b < bands; b++) {
        const ratio = Math.max(1, blow.power[b] / Math.max(blow.floor[b], 1e-30))
        const db = 10 * Math.log10(ratio)
        dbSum += db
        if (db > BAND_ON_DB) risen++
        ratioSum += ratio
        logRatioSum += Math.log(ratio)
      }
      blow.excess = dbSum / bands
      blow.coverage = risen / bands
      blow.flatness = Math.exp(logRatioSum / bands) / (ratioSum / bands)
      if (!blow.on && blow.coverage > BLOW_ON_COVERAGE && blow.excess > BLOW_ON_DB && blow.flatness > BLOW_MIN_FLATNESS) blow.on = true
      else if (blow.on && (blow.coverage < BLOW_OFF_COVERAGE || blow.excess < BLOW_OFF_DB)) blow.on = false
      blow.strength = Math.min(1, Math.max(0, (blow.excess - BLOW_OFF_DB) / BLOW_RANGE_DB))
    }

    let raf = 0
    let prev = performance.now()
    const tick = (now) => {
      const dt = Math.min(0.1, (now - prev) / 1000)
      prev = now
      let v = vRef.current
      if (control === 'blow') {
        readBlow(dt)   // keeps the noise floor current even while disabled
        if (blowRef) blowRef.current = blow.on ? 1 : 0
      }
      if (debugEl) {
        const status = !micLive() ? 'mic off'
          : blow.silentMs > 0 ? (micStale ? 'no audio - tap to restart mic' : 'no audio')
          : blow.calS < BLOW_CALIBRATE_S ? 'calibrating' : blow.on ? 'BLOWING' : 'quiet'
        debugEl.textContent = `mic ${micLive() ? 'live' : 'off'}  ctx ${micCtx ? micCtx.state : '--'}  silent ${Math.round(blow.silentMs)}ms\n`
          + `rise ${blow.excess.toFixed(1)}dB  bands ${Math.round(blow.coverage * 100)}%  flat ${blow.flatness.toFixed(2)}\n`
          + `${status}  v ${v.toFixed(2)}`
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
          blow.lastOnT = now
          const rate = BLOW_MIN_RATE_PER_S + (BLOW_MAX_RATE_PER_S - BLOW_MIN_RATE_PER_S) * blow.strength
          v = Math.max(0, v - rate * dt)
        } else if (down.size === 0 && now - blow.lastOnT > BLOW_RELEASE_MS) {
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
      if (control === 'blow') releaseMic()
      if (blowRef) blowRef.current = 0
      debugEl?.remove()
    }
  }, [control, disabledRef])

  return shown
}
