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
// On top of that: a breath must last (BLOW_HOLD_S, so taps and bumps don't
// count), must not be pitched (tone: voices and the app's bells/music have
// peaks at their harmonics, a breath is smooth), and, once the session's mic
// check has recorded the user's blow, must match its shape across the bands.
const FFT_SIZE = 2048             // ~23 Hz bins: fine enough to see a voice's harmonics
const BLOW_LOW_HZ = 50            // band the blow is measured in
const BLOW_HIGH_HZ = 3000
const BINS_PER_BAND = 8           // FFT bins summed into each band (~190 Hz)
const TONE_SPAN = 3               // tone compares each bin with its neighbours this far each side
const TONE_SMOOTH_S = 0.15
const BLOW_MAX_TONE = 0.75        // no mic check: above this the rise is pitched (0 smooth -> ~1+ tones)
const BLOW_HOLD_S = 0.15          // a blow must hold this long to start...
const BLOW_RELEASE_S = 0.15       // ...and stop this long to end
const BLOW_MATCHED_COVERAGE = 0.2 // with a mic check, the shape match replaces most of the coverage rule
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
// Mic check (every session that uses the mic): quiet, then CAL_BLOWS paced
// breaths: an inhale (CAL_INHALE_S, MicCheck rings the Inhale bell and fills
// its columns), then an exhale that waits for and records one blow (MicCheck
// rings the Exhale bell, and cuts it once the blow starts).
// The blows' average shape across the bands becomes the template, and the
// thresholds (level, match, tone, strength range) are set from them.
const CAL_QUIET_S = 2
const CAL_BLOWS = 3
const CAL_INHALE_S = 4
const CAL_MIN_BLOW_S = 0.6        // shorter sounds aren't counted as a blow
const CAL_SKIP_S = 0.15           // each blow's onset isn't recorded
const CAL_MAX_BLOW_S = 6          // and nothing past this
const CAL_HINT_S = 10             // no blow this long: suggest closer / harder
const CAL_DONE_MS = 1200          // "Got it" shows this long

// The last mic check's result, kept across sessions (Skip keeps it).
let blowProfile = null   // { template, matchOn, matchOff, levelOn, levelOff, range, toneMax }

const percentile = (arr, p) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]
}
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
// Cosine similarity of the rise (dB per band) with a unit template.
function shapeMatch(rise, template) {
  let dot = 0, nn = 0
  for (let b = 0; b < rise.length; b++) { dot += rise[b] * template[b]; nn += rise[b] * rise[b] }
  return nn > 1e-9 ? dot / Math.sqrt(nn) : 0
}

function buildProfile(frames, excesses, tones, quietExcesses) {
  const bands = frames[0].length
  const template = new Float32Array(bands)
  for (const f of frames) for (let b = 0; b < bands; b++) template[b] += f[b]
  let norm = 0
  for (let b = 0; b < bands; b++) norm += template[b] * template[b]
  norm = Math.sqrt(norm) || 1
  for (let b = 0; b < bands; b++) template[b] /= norm
  const matches = frames.map((f) => shapeMatch(f, template))
  const matchOn = clamp(percentile(matches, 0.2) - 0.05, 0.5, 0.92)
  const quietTop = percentile(quietExcesses, 0.95)
  const levelOn = clamp(Math.max(quietTop + 1.5, 0.35 * percentile(excesses, 0.5)), BLOW_ON_DB, 12)
  const levelOff = Math.max(BLOW_OFF_DB, levelOn * 0.5)
  return {
    template,
    matchOn,
    matchOff: matchOn - 0.1,
    levelOn,
    levelOff,
    range: Math.max(4, percentile(excesses, 0.9) - levelOff),
    toneMax: clamp(percentile(tones, 0.8) * 1.25 + 0.05, 0.35, 1.2),
  }
}

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
// quiet: null = no pace (BLOW_INHALE_RATE_PER_S), else v/s. allSensors (Input Test) reads tilt and
// mic whatever the control; readoutRef gets { tilt, mic, blowing } each frame
// (tilt 0 flat/exhale -> 1 upright/inhale, mic = blow strength 0 -> 1; null =
// no reading). Returns v for the thumbs (null when off).
// Mic check: a new non-zero calibrateKey starts one (0 = none); calStatusRef
// gets { step, blows, needed, hint, level } each frame for the overlay, and
// onCalibrated() is called when it's done.
export function useBreathControl({ control, disabledRef, resetKey, onValue, onTiltFail, onMicFail, getQuietRate, blowRef, allSensors = false, readoutRef, calibrateKey = 0, calStatusRef, onCalibrated }) {
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
    // Blow on the Mic: per-bin smoothed power and noise floor, per-band rise,
    // blowing state. raw = the loose detector (loud and broad, nothing else),
    // used by the mic check to find the user's blows.
    const blow = {
      gen: -1, n: 0, bands: 0, power: null, floor: null, slots: null, slotMin: null, slotT: 0, slotI: 0,
      rise: null, extra: null,
      calS: 0, onS: 0, silentMs: 0, holdS: 0, releaseS: 0,
      on: false, raw: false, lastOnT: -Infinity, strength: 0, excess: 0, coverage: 0, flatness: 0, tone: 0, match: null,
    }
    const resetBlow = (n) => {
      const bands = n / BINS_PER_BAND
      blow.gen = micGen
      blow.n = n
      blow.bands = bands
      blow.power = new Float32Array(n)
      blow.floor = new Float32Array(n)
      blow.slots = Array.from({ length: FLOOR_SLOTS }, () => new Float32Array(n).fill(Infinity))
      blow.slotMin = new Float32Array(n).fill(Infinity)
      blow.rise = new Float32Array(bands)
      blow.extra = new Float32Array(n)
      blow.slotT = 0
      blow.slotI = 0
      blow.calS = 0
      blow.onS = blow.holdS = blow.releaseS = 0
      blow.on = blow.raw = false
      blow.strength = 0
      blow.excess = blow.coverage = blow.flatness = blow.tone = 0
      blow.match = null
    }
    // Mic check state (see CAL_*).
    const cal = { key: 0, step: 'idle', t: 0, quiet: [], frames: [], excesses: [], tones: [], cur: null, blows: 0, noBlowT: 0 }
    // ?micdebug in the URL shows the detector's numbers, for tuning on a phone.
    let debugEl = null
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

    // Reads the mic into blow.on / blow.strength (0-1).
    const readBlow = (dt) => {
      if (!micLive()) { blow.on = blow.raw = false; blow.silentMs = 0; return }
      const { analyser, bins } = mic
      analyser.getFloatFrequencyData(bins)
      const hz = micCtx.sampleRate / FFT_SIZE
      const lo = Math.max(1, Math.round(BLOW_LOW_HZ / hz))
      const hi = Math.min(bins.length - 1, Math.round(BLOW_HIGH_HZ / hz))
      const n = Math.max(1, Math.floor((hi - lo + 1) / BINS_PER_BAND)) * BINS_PER_BAND
      if (blow.gen !== micGen || blow.n !== n) resetBlow(n)
      const bands = blow.bands

      // No audio (context not running, or a silent stream): after a while, mark
      // the mic stale so the next tap rebuilds it.
      let total = 0
      for (let i = 0; i < n; i++) total += Math.pow(10, bins[lo + i] / 10)
      const level = 10 * Math.log10(total / n + 1e-30)
      if (level < BLOW_NO_DATA_DB || micCtx.state !== 'running') {
        blow.silentMs += dt * 1000
        if (blow.silentMs > MIC_SILENT_MS) micStale = true
        blow.on = blow.raw = false
        return
      }
      blow.silentMs = 0

      // Each bin's power, smoothed.
      const kp = 1 - Math.exp(-dt / BAND_SMOOTH_S)
      const first = blow.calS === 0
      for (let i = 0; i < n; i++) {
        const p = Math.pow(10, bins[lo + i] / 10)
        blow.power[i] = first ? p : blow.power[i] + (p - blow.power[i]) * kp
      }

      // Floor = each bin's lowest level over the window. Held while blowing, so
      // a blow never becomes the floor (but not forever, so it can't stick on).
      const calibrating = blow.calS < BLOW_CALIBRATE_S
      const holding = blow.on || (cal.step === 'exhale' && blow.raw)
      blow.onS = holding ? blow.onS + dt : 0
      if (calibrating || !holding || blow.onS > FLOOR_FREEZE_MAX_S) {
        for (let i = 0; i < n; i++) blow.slotMin[i] = Math.min(blow.slotMin[i], blow.power[i])
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
      for (let i = 0; i < n; i++) {
        let m = blow.slotMin[i]
        for (let s = 0; s < FLOOR_SLOTS; s++) m = Math.min(m, blow.slots[s][i])
        m *= bias
        blow.floor[i] = calibrating ? m : blow.floor[i] + (m - blow.floor[i]) * kf
      }
      if (calibrating) { blow.calS += dt; blow.on = blow.raw = false; return }

      // Rise over the floor per band: average dB, share of bands risen, and how
      // evenly the rise is spread (a tone lifts a few bands, a breath lifts them all).
      let dbSum = 0, risen = 0, ratioSum = 0, logRatioSum = 0
      for (let b = 0; b < bands; b++) {
        let p = 0, f = 0
        for (let j = 0; j < BINS_PER_BAND; j++) { p += blow.power[b * BINS_PER_BAND + j]; f += blow.floor[b * BINS_PER_BAND + j] }
        const ratio = Math.max(1, p / Math.max(f, 1e-30))
        const db = 10 * Math.log10(ratio)
        blow.rise[b] = db
        dbSum += db
        if (db > BAND_ON_DB) risen++
        ratioSum += ratio
        logRatioSum += Math.log(ratio)
      }
      blow.excess = dbSum / bands
      blow.coverage = risen / bands
      blow.flatness = Math.exp(logRatioSum / bands) / (ratioSum / bands)

      // Tone: how peaky the added sound is from bin to bin. Each bin's extra
      // power over its floor vs the average of its neighbours: a breath's
      // extra is smooth, harmonics stand out from the bins between them.
      let extraSum = 0, devSum = 0
      for (let i = 0; i < n; i++) blow.extra[i] = Math.max(0, blow.power[i] - blow.floor[i])
      for (let i = 0; i < n; i++) {
        const a = Math.max(0, i - TONE_SPAN), z = Math.min(n - 1, i + TONE_SPAN)
        let s = 0
        for (let j = a; j <= z; j++) s += blow.extra[j]
        const mean = s / (z - a + 1)
        devSum += Math.abs(blow.extra[i] - mean)
        extraSum += mean
      }
      const toneNow = extraSum > 0 ? devSum / extraSum : 0
      blow.tone += (toneNow - blow.tone) * (1 - Math.exp(-dt / TONE_SMOOTH_S))

      // Loose detector: loud and broad (the mic check uses it to find blows).
      if (!blow.raw && blow.coverage > BLOW_ON_COVERAGE && blow.excess > BLOW_ON_DB) blow.raw = true
      else if (blow.raw && (blow.coverage < BLOW_OFF_COVERAGE || blow.excess < BLOW_OFF_DB)) blow.raw = false

      // Strict detector. With a mic check: the user's level, tone and shape.
      // Without: the old coverage/flatness rules plus a fixed tone limit.
      const prof = blowProfile && blowProfile.template.length === bands
        && cal.step !== 'wait' && cal.step !== 'quiet' && cal.step !== 'inhale' && cal.step !== 'exhale' ? blowProfile : null
      blow.match = prof ? shapeMatch(blow.rise, prof.template) : null
      const levelOff = prof ? prof.levelOff : BLOW_OFF_DB
      const toneMax = prof ? prof.toneMax : BLOW_MAX_TONE
      const wantOn = blow.excess > (prof ? prof.levelOn : BLOW_ON_DB)
        && blow.tone < toneMax
        && (prof
          ? blow.coverage > BLOW_MATCHED_COVERAGE && blow.match > prof.matchOn
          : blow.coverage > BLOW_ON_COVERAGE && blow.flatness > BLOW_MIN_FLATNESS)
      const wantOff = blow.excess < levelOff
        || blow.tone > toneMax * 1.2
        || (prof ? blow.match < prof.matchOff : blow.coverage < BLOW_OFF_COVERAGE)
      if (!blow.on) {
        blow.holdS = wantOn ? blow.holdS + dt : 0
        if (blow.holdS >= BLOW_HOLD_S) { blow.on = true; blow.releaseS = 0 }
      } else {
        blow.releaseS = wantOff ? blow.releaseS + dt : 0
        if (blow.releaseS >= BLOW_RELEASE_S) { blow.on = false; blow.holdS = 0 }
      }
      blow.strength = clamp((blow.excess - levelOff) / (prof ? prof.range : BLOW_RANGE_DB), 0, 1)
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
        cal.cur = null
        cal.blows = 0
        cal.noBlowT = 0
      }
      if (cal.step === 'idle') return
      const ready = micLive() && blow.calS >= BLOW_CALIBRATE_S && blow.silentMs === 0
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
        if (blow.raw && (cal.cur || blow.tone < BLOW_MAX_TONE)) {
          if (!cal.cur) cal.cur = { t: 0, frames: [], excesses: [], tones: [] }
          cal.cur.t += dt
          if (cal.cur.t > CAL_SKIP_S && cal.cur.t < CAL_MAX_BLOW_S) {
            cal.cur.frames.push(Float32Array.from(blow.rise))
            cal.cur.excesses.push(blow.excess)
            cal.cur.tones.push(blow.tone)
          }
        } else if (cal.cur) {
          if (cal.cur.t >= CAL_MIN_BLOW_S && cal.cur.frames.length) {
            cal.frames.push(...cal.cur.frames)
            cal.excesses.push(...cal.cur.excesses)
            cal.tones.push(...cal.cur.tones)
            cal.blows++
            cal.noBlowT = 0
            if (cal.blows < CAL_BLOWS) { cal.step = 'inhale'; cal.t = 0 }
          }
          cal.cur = null
        }
        if (!cal.cur) cal.noBlowT += dt
        if (cal.blows >= CAL_BLOWS) {
          blowProfile = buildProfile(cal.frames, cal.excesses, cal.tones, cal.quiet)
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
          inhaleP: cal.step === 'inhale' ? clamp(cal.t / CAL_INHALE_S, 0, 1) : cal.step === 'exhale' ? 1 : 0,
          level: clamp(blow.excess / 15, 0, 1),
        }
      }
      if (blowRef) blowRef.current = control === 'blow' && blow.on ? 1 : 0
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
          : blow.silentMs > 0 ? (micStale ? 'no audio - tap to restart mic' : 'no audio')
          : blow.calS < BLOW_CALIBRATE_S ? 'calibrating' : blow.on ? 'BLOWING' : 'quiet'
        debugEl.textContent = `mic ${micLive() ? 'live' : 'off'}  ctx ${micCtx ? micCtx.state : '--'}  silent ${Math.round(blow.silentMs)}ms\n`
          + `rise ${blow.excess.toFixed(1)}dB  bands ${Math.round(blow.coverage * 100)}%  flat ${blow.flatness.toFixed(2)}\n`
          + `tone ${blow.tone.toFixed(2)}  match ${blow.match === null ? '--' : blow.match.toFixed(2)}  raw ${blow.raw ? 'on' : 'off'}  check ${cal.step}\n`
          + (blowProfile ? `profile: level ${blowProfile.levelOn.toFixed(1)}dB  match ${blowProfile.matchOn.toFixed(2)}  tone ${blowProfile.toneMax.toFixed(2)}\n` : 'profile: none\n')
          + `${status}  tilt ${tiltTarget === null ? '--' : tiltTarget.toFixed(2)}  v ${v.toFixed(2)}`
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
      if (useMic) releaseMic()
      if (blowRef) blowRef.current = 0
      if (readoutRef) readoutRef.current = null
      if (calStatusRef) calStatusRef.current = null
      debugEl?.remove()
    }
  }, [control, disabledRef, allSensors])

  return shown
}
