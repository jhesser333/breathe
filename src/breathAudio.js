// Breath audio: two looping crossfade pairs, played with the Web Audio API.
//
// Files live in public/audio and are named <pair>_<group><a|b>.wav:
//   pair  = 'slider' (driven by the left slider) or 'pace' (driven by the
//           app's paced breath)
//   group = 1, 2, 3... -- the audio moves to the next group with each
//           5-breath cycle, like the palettes and landscapes
//   a     = exhale / default, b = inhale
// The list of files is found at build time (vite.config.js, __AUDIO_FILES__).
//
// Each file loops sample-accurately (AudioBufferSourceNode.loop), and each
// pair crossfades a <-> b with an equal-power curve so the middle doesn't dip.

/* global __AUDIO_FILES__ */
const AUDIO_FILES = typeof __AUDIO_FILES__ !== 'undefined' ? __AUDIO_FILES__ : []
const AUDIO_DIR = '/audio/'

const SMOOTHING_S = 0.03          // time constant for per-frame gain changes (no zipper noise)
const GROUP_FADE_S = 2            // crossfade between groups
const PACE_FADE_S = 2             // paced pair fades in/out when the pace starts/stops
const STOP_FADE_S = 0.5
const RESUME_CHECK_MS = 300       // still not running this long after resume() -> rebuild the context

// { slider: [1, 2, ...], pace: [1, ...] } -- only groups with both a and b.
function findGroups() {
  const found = { slider: {}, pace: {} }
  for (const f of AUDIO_FILES) {
    const m = /^(slider|pace)_(\d+)([ab])\.wav$/i.exec(f)
    if (!m) continue
    const pair = m[1].toLowerCase()
    const g = Number(m[2])
    found[pair][g] = found[pair][g] || {}
    found[pair][g][m[3].toLowerCase()] = f
  }
  const out = {}
  for (const pair of ['slider', 'pace']) {
    out[pair] = Object.keys(found[pair])
      .map(Number)
      .filter((g) => found[pair][g].a && found[pair][g].b)
      .sort((x, y) => x - y)
      .map((g) => ({ group: g, a: found[pair][g].a, b: found[pair][g].b }))
  }
  return out
}

const smoothstep = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t) }

export function createAudioEngine() {
  const groups = findGroups()
  let ctx = null
  let master = null
  const buffers = {}        // file name -> Promise<AudioBuffer>
  let running = false
  let sliderV = 0           // 0 exhale -> 1 inhale (eased)
  let paceV = 0
  let paceOn = false
  // Per pair: the currently audible voice set { group, level GainNode, a/b { src, gain } }.
  const current = { slider: null, pace: null }
  let lastCycleIndex = 0
  let resumeCheck = null

  function load(file) {
    if (!buffers[file]) {
      buffers[file] = fetch(AUDIO_DIR + file)
        .then((r) => r.arrayBuffer())
        // Decoded AudioBuffers aren't tied to a context, so they survive a rebuild.
        .then((data) => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
        .catch((e) => { console.warn('Audio load failed:', file, e); delete buffers[file]; return null })
    }
    return buffers[file]
  }

  // Build one pair's voices for a group, starting silent and fading in.
  function makeVoices(pair, cycleIndex, fadeS, levelTarget) {
    const list = groups[pair]
    if (!list.length) return null
    const entry = list[cycleIndex % list.length]
    const level = ctx.createGain()
    level.gain.value = 0
    level.connect(master)
    const voices = { group: entry.group, level, a: null, b: null, dead: false }
    const t = ctx.currentTime
    level.gain.setValueAtTime(0, t)
    level.gain.linearRampToValueAtTime(levelTarget, t + fadeS)
    for (const side of ['a', 'b']) {
      load(entry[side]).then((buf) => {
        if (!buf || voices.dead) return
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.loop = true
        const gain = ctx.createGain()
        gain.gain.value = side === 'a' ? crossA(pair) : crossB(pair)
        src.connect(gain).connect(level)
        src.start()
        voices[side] = { src, gain }
      })
    }
    return voices
  }

  function retire(voices, fadeS) {
    if (!voices) return
    voices.dead = true
    const t = ctx.currentTime
    voices.level.gain.cancelScheduledValues(t)
    voices.level.gain.setValueAtTime(voices.level.gain.value, t)
    voices.level.gain.linearRampToValueAtTime(0, t + fadeS)
    setTimeout(() => {
      for (const side of ['a', 'b']) {
        const v = voices[side]
        if (v) { try { v.src.stop() } catch { /* already stopped */ } v.src.disconnect() }
      }
      voices.level.disconnect()
    }, (fadeS + 0.1) * 1000)
  }

  const valueFor = (pair) => (pair === 'slider' ? sliderV : paceV)
  const crossA = (pair) => Math.cos(valueFor(pair) * Math.PI / 2)
  const crossB = (pair) => Math.sin(valueFor(pair) * Math.PI / 2)

  function applyCross(pair) {
    const voices = current[pair]
    if (!ctx || !voices) return
    const t = ctx.currentTime
    if (voices.a) voices.a.gain.gain.setTargetAtTime(crossA(pair), t, SMOOTHING_S)
    if (voices.b) voices.b.gain.gain.setTargetAtTime(crossB(pair), t, SMOOTHING_S)
  }

  function setPaceLevel(on) {
    const voices = current.pace
    if (!voices) return
    const t = ctx.currentTime
    const g = voices.level.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(on ? 1 : 0, t + PACE_FADE_S)
  }

  function createContext() {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return false
    ctx = new AC()
    master = ctx.createGain()
    master.connect(ctx.destination)
    return true
  }

  // iOS puts the context in 'interrupted' (others: 'suspended') when the phone
  // locks or the tab is backgrounded; a long interruption can leave it unable
  // to resume, or 'closed'. Resume it, and if that doesn't take, start over
  // with a fresh context and restart whatever was playing.
  function ensureRunning() {
    if (!ctx || ctx.state === 'closed') {
      if (!createContext()) return
      if (running) restartVoices()
      return
    }
    if (ctx.state === 'running') return
    ctx.resume().catch(() => {})
    clearTimeout(resumeCheck)
    resumeCheck = setTimeout(() => {
      if (!ctx || ctx.state === 'running') return
      try { ctx.close() } catch { /* ignore */ }
      if (!createContext()) return
      if (running) restartVoices()
    }, RESUME_CHECK_MS)
  }

  // Old voices belong to the dead context; just drop them and rebuild.
  function restartVoices() {
    current.slider = null
    current.pace = null
    paceOn = false
    current.slider = makeVoices('slider', lastCycleIndex, 0.5, 1)
    current.pace = makeVoices('pace', lastCycleIndex, 0.5, 0)
  }

  // Any tap (a user gesture) while playing brings a stalled context back, so
  // touching a slider after returning to the phone restores the sound.
  if (typeof document !== 'undefined') {
    const onGesture = () => { if (running && (!ctx || ctx.state !== 'running')) ensureRunning() }
    for (const type of ['touchend', 'pointerup', 'keydown']) document.addEventListener(type, onGesture, { passive: true })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && running && ctx && ctx.state !== 'running') ctx.resume().catch(() => {})
    })
  }

  return {
    // Must run inside a tap handler (browser autoplay rules).
    unlock() {
      ensureRunning()
    },

    start(cycleIndex = 0) {
      ensureRunning()
      if (!ctx) return
      this.stop(0.05)
      lastCycleIndex = cycleIndex
      running = true
      paceOn = false
      paceV = 0
      current.slider = makeVoices('slider', cycleIndex, 0.5, 1)
      current.pace = makeVoices('pace', cycleIndex, 0.5, 0)
    },

    stop(fadeS = STOP_FADE_S) {
      if (!ctx) return
      running = false
      retire(current.slider, fadeS)
      retire(current.pace, fadeS)
      current.slider = null
      current.pace = null
    },

    // v: raw left slider, 0 exhale -> 1 inhale.
    setSlider(v) {
      sliderV = smoothstep(v)
      applyCross('slider')
    },

    // v: paced breath 0 exhale -> 1 inhale (already eased), or null = silent.
    setPace(v) {
      if (!running) return
      const on = v !== null && v !== undefined
      if (on) { paceV = Math.min(1, Math.max(0, v)); applyCross('pace') }
      if (on !== paceOn) { paceOn = on; setPaceLevel(on) }
    },

    // Next 5-breath cycle: move each pair to its group for this cycle.
    setCycle(cycleIndex) {
      if (!running) return
      lastCycleIndex = cycleIndex
      for (const pair of ['slider', 'pace']) {
        const list = groups[pair]
        if (!list.length || !current[pair]) continue
        const entry = list[cycleIndex % list.length]
        if (entry.group === current[pair].group) continue
        retire(current[pair], GROUP_FADE_S)
        current[pair] = makeVoices(pair, cycleIndex, GROUP_FADE_S, pair === 'pace' && !paceOn ? 0 : 1)
      }
    },
  }
}
