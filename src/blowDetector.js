// Blow on the Mic: is the mic hearing an exhale? Pure per-frame analysis of
// the mic's spectrum (no React or DOM), so it can be tested offline with
// synthetic spectra. useBreathControl reads the analyser, calls
// analyzeBlowFrame every frame and runs the mic check (buildProfile).
//
// What sets a blow apart from other sounds:
// - It lasts. Taps, knocks, bumps, clicks and coughs are over in a few frames,
//   so a blow must hold over the last BLOW_START_S, judged on each frame's
//   own (unsmoothed) level -- smoothing would stretch a tap into a blow.
// - It's steady. Its level moves smoothly frame to frame; speech jumps at
//   every syllable and rustling is jagged (jitter).
// - It has no pitch. Voices, the bells and the app's music have peaks at
//   their harmonics, a breath is smooth (tone).
// - It has the user's shape. Once the mic check has recorded their blows, the
//   rise across the bands (low wind-rumble, high hiss) must correlate with
//   it, loudness aside (Pearson match).
// Each bin has its own noise floor, so steady room noise (a fan, white
// noise) cancels out.

export const FFT_SIZE = 2048             // ~23 Hz bins: fine enough to see a voice's harmonics
export const BLOW_LOW_HZ = 50
export const BLOW_HIGH_HZ = 8000         // breath hiss reaches up here
// Roughly half-octave bands: the low ones resolve wind-rumble, the high ones hiss.
const BAND_EDGES_HZ = [50, 120, 200, 300, 450, 650, 900, 1250, 1750, 2500, 3500, 5000, 8000]
const TONE_HIGH_HZ = 3000                // tone is measured where harmonics are
const TONE_SPAN = 3                      // tone compares each bin with its neighbours this far each side
const TONE_SMOOTH_S = 0.15
export const BLOW_MAX_TONE = 0.75        // no mic check: above this the rise is pitched (0 smooth -> ~1+ tones)
const BLOW_START_S = 0.3                 // a blow must hold over this window to start...
const BLOW_SUSTAIN_FRAC = 0.8            // ...with this share of its frames above the start level
const BLOW_MAX_JITTER_DB = 5             // no mic check: mean frame-to-frame level change allowed in the window
const BLOW_RELEASE_S = 0.15              // a blow must be gone this long to end
const BLOW_MATCHED_COVERAGE = 0.2        // with a mic check, the shape match replaces most of the coverage rule
const BAND_SMOOTH_S = 0.1                // each bin's level is smoothed over this
const BAND_ON_DB = 3                     // a band this far above its floor has risen
const BLOW_ON_COVERAGE = 0.35            // share of bands risen to start blowing...
export const BLOW_ON_DB = 3              // ...with the bands' average this far above the floor
const BLOW_OFF_COVERAGE = 0.2            // blowing stops below either of these (hysteresis)
const BLOW_OFF_DB = 1.5
const BLOW_RANGE_DB = 12                 // OFF + this average = full strength
const SHAPE_MIN_SPREAD_DB = 0.5          // a rise flatter than this (rms across bands) has no shape: match 0
const TEMPLATE_MIN_SPREAD_DB = 1         // the user's blows flatter than this: no shape rule
// Noise floor: each bin's lowest level over the last FLOOR_WINDOW_S (kept as
// FLOOR_SLOTS sub-windows), so it follows a quieter or louder room within
// about 2 s. Held while blowing, up to FLOOR_FREEZE_MAX_S.
const FLOOR_WINDOW_S = 2
const FLOOR_SLOTS = 8
const FLOOR_SMOOTH_S = 0.2
const FLOOR_BIAS_DB = 1.5                // the minimum sits below the average level; lift it back
const FLOOR_FREEZE_MAX_S = 8
const FLOOR_HANGOVER_S = 2               // the loose detector holds the floor this long after a real blow
export const BLOW_CALIBRATE_S = 0.5      // first stretch of real audio sets the floor
const HIST_LEN = 64                      // frames kept for the start window

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
export const percentile = (arr, p) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]
}

// Pearson correlation of the rise (dB per band) with a centred, unit-length
// template: the shape only, whatever the loudness.
export function shapeMatch(rise, template) {
  const n = rise.length
  let mean = 0
  for (let b = 0; b < n; b++) mean += rise[b]
  mean /= n
  let dot = 0, nn = 0
  for (let b = 0; b < n; b++) { const d = rise[b] - mean; dot += d * template[b]; nn += d * d }
  if (Math.sqrt(nn / n) < SHAPE_MIN_SPREAD_DB) return 0
  return dot / Math.sqrt(nn)
}

export function createBlowState() {
  return {
    lo: -1, n: 0, hz: 0, bands: 0, edges: null, nTone: 0,
    power: null, frame: null, floor: null, slots: null, slotMin: null, slotT: 0, slotI: 0,
    rise: null, extra: null,
    histT: new Float64Array(HIST_LEN), histX: new Float32Array(HIST_LEN), histI: 0, histN: 0, histStart: 0,
    clock: 0, lastOnClock: -Infinity, calS: 0, onS: 0, releaseS: 0,
    on: false, raw: false, candidate: false, why: 'calibrating', offWhy: '', offRise: 0, offClock: -Infinity,
    strength: 0, excess: 0, frameExcess: 0, coverage: 0, tone: 0, match: null, sustain: 0, jitter: 0,
  }
}

// lo = the first analyser bin used, n = how many, hz = Hz per bin.
export function resetBlowState(blow, lo, n, hz) {
  const edges = [0]
  for (let k = 1; k < BAND_EDGES_HZ.length; k++) {
    const e = Math.min(n, Math.round(BAND_EDGES_HZ[k] / hz) - lo)
    if (e > edges[edges.length - 1]) edges.push(e)
  }
  if (edges.length < 2) edges.push(n)
  edges[edges.length - 1] = n
  const bands = edges.length - 1
  Object.assign(blow, {
    lo, n, hz, bands, edges,
    nTone: clamp(Math.round(TONE_HIGH_HZ / hz) - lo + 1, 1, n),
    power: new Float32Array(n),
    frame: new Float32Array(n),
    floor: new Float32Array(n),
    slots: Array.from({ length: FLOOR_SLOTS }, () => new Float32Array(n).fill(Infinity)),
    slotMin: new Float32Array(n).fill(Infinity),
    slotT: 0, slotI: 0,
    rise: new Float32Array(bands),
    extra: new Float32Array(n),
    histI: 0, histN: 0, histStart: 0,
    clock: 0, lastOnClock: -Infinity, calS: 0, onS: 0, releaseS: 0,
    on: false, raw: false, candidate: false, why: 'calibrating', offWhy: '', offRise: 0, offClock: -Infinity,
    strength: 0, excess: 0, frameExcess: 0, coverage: 0, tone: 0, match: null, sustain: 0, jitter: 0,
  })
}

// One frame. bins = the analyser's dB spectrum; prof = the mic check's
// profile (null = none); calExhale = the mic check is waiting for or
// recording a blow (the loose detector holds the floor then).
// Sets: raw (loose: loud and broad), candidate (lasts, steady, the user's
// shape, not clearly pitched -- the bell can still be ringing), on (strict:
// candidate + the user's tone limit, then off by hysteresis), why (the first
// strict rule failing, '' when on), strength 0-1.
export function analyzeBlowFrame(blow, bins, lo, n, hz, dt, { prof = null, calExhale = false } = {}) {
  if (blow.lo !== lo || blow.n !== n || blow.hz !== hz) resetBlowState(blow, lo, n, hz)
  if (prof && prof.bands !== blow.bands) prof = null
  blow.clock += dt

  // Each bin's power: this frame's, and smoothed.
  const kp = 1 - Math.exp(-dt / BAND_SMOOTH_S)
  const first = blow.calS === 0
  for (let i = 0; i < n; i++) {
    const p = Math.pow(10, bins[lo + i] / 10)
    blow.frame[i] = p
    blow.power[i] = first ? p : blow.power[i] + (p - blow.power[i]) * kp
  }

  // Floor = each bin's lowest level over the window. Held while blowing, so a
  // blow never becomes the floor; the loose detector also holds it shortly
  // after a real blow (so a flickering blow can't seep into it) and during
  // the mic check's blows, but a stray noise alone doesn't. Not held
  // forever, so it can't stick on.
  const calibrating = blow.calS < BLOW_CALIBRATE_S
  const holding = blow.on || blow.candidate
    || (blow.raw && (calExhale || blow.clock - blow.lastOnClock < FLOOR_HANGOVER_S))
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
  if (calibrating) {
    blow.calS += dt
    blow.on = blow.raw = blow.candidate = false
    blow.why = 'calibrating'
    blow.histStart = blow.clock
    return
  }

  // Rise over the floor per band (smoothed), its average and the share of
  // bands risen; and the same average for this frame alone.
  const { bands, edges } = blow
  let dbSum = 0, frameDbSum = 0, risen = 0
  for (let b = 0; b < bands; b++) {
    let p = 0, p0 = 0, f = 0
    for (let i = edges[b]; i < edges[b + 1]; i++) { p += blow.power[i]; p0 += blow.frame[i]; f += blow.floor[i] }
    f = Math.max(f, 1e-30)
    const db = 10 * Math.log10(Math.max(1, p / f))
    blow.rise[b] = db
    dbSum += db
    if (db > BAND_ON_DB) risen++
    frameDbSum += 10 * Math.log10(Math.max(1, p0 / f))
  }
  blow.excess = dbSum / bands
  blow.frameExcess = frameDbSum / bands
  blow.coverage = risen / bands

  // Tone: how peaky the added sound is from bin to bin. Each bin's extra
  // power over its floor vs the average of its neighbours: a breath's extra
  // is smooth, harmonics stand out from the bins between them.
  const nt = blow.nTone
  let extraSum = 0, devSum = 0
  for (let i = 0; i < nt; i++) blow.extra[i] = Math.max(0, blow.power[i] - blow.floor[i])
  for (let i = 0; i < nt; i++) {
    const a = Math.max(0, i - TONE_SPAN), z = Math.min(nt - 1, i + TONE_SPAN)
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

  // The start window: share of frames above the start level, and jitter.
  const levelOn = prof ? prof.levelOn : BLOW_ON_DB
  blow.histT[blow.histI] = blow.clock
  blow.histX[blow.histI] = blow.frameExcess
  blow.histI = (blow.histI + 1) % HIST_LEN
  blow.histN = Math.min(HIST_LEN, blow.histN + 1)
  let count = 0, above = 0, jSum = 0, prev = 0
  for (let k = 0; k < blow.histN; k++) {
    const idx = (blow.histI - 1 - k + HIST_LEN) % HIST_LEN
    if (blow.histT[idx] <= blow.clock - BLOW_START_S) break
    const x = blow.histX[idx]
    count++
    if (x > levelOn) above++
    if (k > 0) jSum += Math.abs(prev - x)
    prev = x
  }
  const full = blow.clock - blow.histStart >= BLOW_START_S
  blow.sustain = count ? above / count : 0
  blow.jitter = count > 1 ? jSum / (count - 1) : 0

  // Candidate and strict detectors.
  const shape = !!(prof && prof.template)
  blow.match = shape ? shapeMatch(blow.rise, prof.template) : null
  const levelOff = prof ? prof.levelOff : BLOW_OFF_DB
  const toneMax = prof ? prof.toneMax : BLOW_MAX_TONE
  const jitterMax = prof ? prof.jitterMax : BLOW_MAX_JITTER_DB
  let why = ''
  if (blow.excess <= levelOn) why = 'level'
  else if (!full || blow.sustain < BLOW_SUSTAIN_FRAC) why = 'sustain'
  else if (blow.jitter > jitterMax) why = 'steady'
  else if (blow.coverage <= (prof ? BLOW_MATCHED_COVERAGE : BLOW_ON_COVERAGE)) why = 'coverage'
  else if (shape && blow.match <= prof.matchOn) why = 'shape'
  else if (blow.tone >= Math.max(toneMax, BLOW_MAX_TONE)) why = 'tone'
  blow.candidate = !why
  if (!why && blow.tone >= toneMax) why = 'tone'
  const wantOff = blow.excess < levelOff
    || blow.tone > toneMax * 1.2
    || (shape ? blow.match < prof.matchOff : blow.coverage < BLOW_OFF_COVERAGE)
  if (!blow.on) {
    if (!why) { blow.on = true; blow.releaseS = 0 }
  } else {
    blow.releaseS = wantOff ? blow.releaseS + dt : 0
    if (blow.releaseS >= BLOW_RELEASE_S) {
      blow.on = false
      // Which off rule ended it, and the rise then (kept for the debug readouts).
      blow.offWhy = blow.excess < levelOff ? 'level' : blow.tone > toneMax * 1.2 ? 'tone' : shape ? 'shape' : 'coverage'
      blow.offRise = blow.excess
      blow.offClock = blow.clock
    }
  }
  if (blow.on) { blow.lastOnClock = blow.clock; why = '' }
  blow.why = why
  blow.strength = clamp((blow.excess - levelOff) / (prof ? prof.range : BLOW_RANGE_DB), 0, 1)
}

// The mic check's result from its recorded blow frames (rise per band,
// smoothed rise, tone, jitter) and the quiet step's rises.
// tailExcesses / tailFrames: the last third of each blow, so the off
// thresholds reach down to how quiet (and what shape) the user's exhale gets
// as it ends, and a real exhale isn't cut off before it's over.
export function buildProfile(frames, excesses, tones, jitters, quietExcesses, tailExcesses = [], tailFrames = []) {
  const bands = frames[0].length
  const mean = new Float32Array(bands)
  for (const f of frames) for (let b = 0; b < bands; b++) mean[b] += f[b] / frames.length
  let avg = 0
  for (let b = 0; b < bands; b++) avg += mean[b] / bands
  const template = new Float32Array(bands)
  let norm = 0
  for (let b = 0; b < bands; b++) { template[b] = mean[b] - avg; norm += template[b] * template[b] }
  const hasShape = Math.sqrt(norm / bands) >= TEMPLATE_MIN_SPREAD_DB
  if (hasShape) { norm = Math.sqrt(norm); for (let b = 0; b < bands; b++) template[b] /= norm }
  const matchOn = hasShape
    ? clamp(percentile(frames.map((f) => shapeMatch(f, template)), 0.2) - 0.1, 0.2, 0.75)
    : 0
  const quietTop = percentile(quietExcesses, 0.95)
  const levelOn = clamp(Math.max(quietTop + 1.5, 0.35 * percentile(excesses, 0.5)), BLOW_ON_DB, 12)
  let levelOff = levelOn * 0.5
  if (tailExcesses.length) levelOff = Math.min(levelOff, 0.8 * percentile(tailExcesses, 0.2))
  levelOff = Math.min(levelOn - 0.5, Math.max(levelOff, BLOW_OFF_DB, quietTop + 0.5))
  let matchOff = matchOn - 0.15
  if (hasShape && tailFrames.length) {
    matchOff = Math.max(0, Math.min(matchOff, percentile(tailFrames.map((f) => shapeMatch(f, template)), 0.2) - 0.1))
  }
  return {
    bands,
    template: hasShape ? template : null,
    matchOn,
    matchOff,
    levelOn,
    levelOff,
    range: Math.max(4, percentile(excesses, 0.9) - levelOff),
    toneMax: clamp(percentile(tones, 0.8) * 1.25 + 0.05, 0.35, 1.2),
    jitterMax: clamp(percentile(jitters, 0.9) * 1.5, 3, 8),
  }
}
