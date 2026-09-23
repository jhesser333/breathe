import { useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import MorphA from './MorphA'
import MorphB from './MorphB'
import MorphC from './MorphC'
import MorphE from './MorphE'
import GatesA from './GatesA'
import GatesB from './GatesB'
import GatesC from './GatesC'
import GatesHeadless from './GatesHeadless'
import GatesHeadlessE from './GatesHeadlessE'
import GatesBoxBreathingA from './GatesBoxBreathingA'
import GatesBoxBreathingB from './GatesBoxBreathingB'
import GatesBoxBreathingC from './GatesBoxBreathingC'
import GatesBoxBreathingD from './GatesBoxBreathingD'
import GatesBoxBreathingHeadlessE from './GatesBoxBreathingHeadlessE'
import Sliders from './Sliders'
import SlidersDiagonal from './SlidersDiagonal'
import SelectModeScreen from './SelectModeScreen'
import SliderLayoutsScreen from './SliderLayoutsScreen'
import PersonalizeScreen from './PersonalizeScreen'
import BreathPaceOptionsScreen from './BreathPaceOptionsScreen'
import BackgroundB from './BackgroundB'
import BackgroundRingsD, { computePhaseDurations } from './BackgroundRingsD'
import RingParticlesD from './RingParticlesD'
import SlowingDownPaceRingsD from './SlowingDownPaceRingsD'
import CameraVerticalShift from './CameraVerticalShift'
import StarFieldE from './StarFieldE'
import TutorialText from './TutorialText'
import SlowingDownController from './SlowingDownController'
import BreathLengthControl from './BreathLengthControl'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { PALETTES } from './palettes'
import { BREATH_CYCLE_PALETTES } from './breathCyclePalettes'
import { TEXT_A, TEXT_B, TEXTS, TEXT_A1_DIAGONAL, TEXT_A2_DIAGONAL, TEXT_B1_DIAGONAL, TEXT_B2_DIAGONAL, MODE_LABELS } from './copy'
import { TARGET_PACES, DEFAULT_TARGET_PACE } from './breathPace'

const navPillStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8, color: 'var(--live-text-color, rgba(255,255,255,0.7))',
  padding: '8px 14px', fontSize: 13,
  cursor: 'pointer', fontFamily: 'sans-serif',
  letterSpacing: '0.03em', whiteSpace: 'nowrap',
  pointerEvents: 'auto',
}

const STILLNESS_MS = 10000
const MOVEMENT_FADE_DELAY_MS = 2000
const TEXT_C_DISPLAY_MS = 5000
const FADE_TRANSITION_MS = 2000
const RIGHT_DEADBAND = 0.08
const TARGET_STROKES_A = 4  // 2 full up+down oscillations
const TARGET_STROKES_B = 6  // 3 full up+down oscillations

// Diagonal-layout-only Text A1/A2/B1/B2 tutorial sequence
const DIAG_EDGE_THRESHOLD = 0.02  // lv within this of 0/1 counts as "at the end"
const DIAG_DEADBAND = 0.08
const DIAG_CYCLE_STROKES = 2      // 2 strokes = 1 full up+down breath cycle
const DIAG_FADE_IN_MS = 1000
const DIAG_FADE_OUT_MS = 2000

// Per-shape camera placement. Each art option is framed independently -- omitting
// `rotation` lets R3F apply its default look-at-origin, which gives the ~35deg
// downward tilt Options A/B/C were designed around; an explicit rotation opts out
// of that for a level view. Option D additionally gets CameraVerticalShift.
const CAMERA_BY_SHAPE = {
  a: { position: [0, 3.5, 5], fov: 50 },
  b: { position: [0, 3.5, 5], fov: 50 },
  c: { position: [0, 3.5, 5], fov: 50 },
  d: { position: [0, 0, 12], rotation: [0, 0, 0], fov: 50 },
  e: { position: [0, 0, 5], rotation: [0, 0, 0], fov: 50 },
}
const DEFAULT_CAMERA = CAMERA_BY_SHAPE.a

// Breath-count palette cycle (see MorphC.jsx / breathCyclePalettes.js):
// MorphC decides WHEN to cycle (breath 1's inhale of a new group) and calls
// back up here; this drives the actual color lerp so it reaches every
// palette-consuming piece of the live scene, not just MorphC's own colors.
const PALETTE_LERP_DURATION = 1.0

function PaletteLerpDriver({ livePaletteRef, paletteLerpRef, paletteCycleIndexRef, wrapperRef }) {
  useFrame((state) => {
    if (paletteLerpRef.current) {
      const { fromTertiary, fromPrimary, fromSecondary, fromBackground, fromText, toIndex, startTime } = paletteLerpRef.current
      const now = state.clock.elapsedTime
      const t = THREE.MathUtils.clamp((now - startTime) / PALETTE_LERP_DURATION, 0, 1)
      const to = BREATH_CYCLE_PALETTES[toIndex]
      const live = livePaletteRef.current
      live.tertiary.copy(fromTertiary).lerp(new THREE.Color(to.tertiaryColor), t)
      live.primary.copy(fromPrimary).lerp(new THREE.Color(to.primaryColor), t)
      live.secondary.copy(fromSecondary).lerp(new THREE.Color(to.secondaryColor), t)
      live.background.copy(fromBackground).lerp(new THREE.Color(to.background), t)
      live.text.copy(fromText).lerp(new THREE.Color(to.textColor), t)
      if (t >= 1) {
        paletteCycleIndexRef.current = toIndex
        paletteLerpRef.current = null
      }
    }
    const live = livePaletteRef.current
    if (state.scene.background) state.scene.background.copy(live.background)
    // Reaches the DOM overlay's text (nav buttons, mode caption, tutorial
    // captions) via CSS custom-property inheritance -- no prop drilling.
    if (wrapperRef?.current) wrapperRef.current.style.setProperty('--live-text-color', '#' + live.text.getHexString())
    if (wrapperRef?.current) wrapperRef.current.style.setProperty('--live-bg-color', '#' + live.background.getHexString())
  })
  return null
}

// Slowing Down: fires onStart once, on the first paced Inhale crossing after
// the paced gates/art enable (i.e. after recording) -- requires seeing a
// non-inhale phase first so a stale 'inhale' can't start it early. Re-arms
// whenever the gates are disabled again (mode restart).
function PacedBreathCountStarter({ gatesEnabledRef, breathPhaseRef, onStart }) {
  const startedRef = useRef(false)
  const armedRef = useRef(false)   // saw a non-inhale phase while enabled, so the next 'inhale' is a real crossing, not a stale value
  useFrame(() => {
    if (!gatesEnabledRef.current) { startedRef.current = false; armedRef.current = false; return }
    if (startedRef.current) return
    if (breathPhaseRef.current !== 'inhale') armedRef.current = true
    else if (armedRef.current) {
      startedRef.current = true
      onStart()
    }
  })
  return null
}

// Slowing Down (Shapes D/E): reports every paced breath-phase change while
// the paced art is running, driving the Inhale/Exhale captions and Text E.
function PacedPhaseWatcher({ gatesEnabledRef, breathPhaseRef, onPhaseChange }) {
  const prevRef = useRef(null)
  useFrame(() => {
    if (!gatesEnabledRef.current) { prevRef.current = null; return }
    const phase = breathPhaseRef.current
    if (phase !== prevRef.current) {
      prevRef.current = phase
      onPhaseChange(phase)
    }
  })
  return null
}

const PACED_CAPTION_BREATHS = 5
const PACED_CAPTION_ALPHA = [1, 1, 1, 0.5, 0.15]   // per breath: last two fade out, like Box Breathing's ROUND_ALPHA
const PACED_TEXT_E_FALLBACK_MS = 15000   // Text E hold if Text D's on-screen time wasn't measured

export default function App() {
  const leftVal = useRef(0)
  const rightVal = useRef(1)
  // Attached to the experience screen's outer wrapper div -- PaletteLerpDriver
  // writes a CSS custom property here so the DOM overlay's text can track the
  // live palette (see navPillStyle/mode-caption below and TutorialText.jsx).
  const wrapperRef = useRef(null)

  const [screen, setScreen] = useState('selectMode')
  const [mode, setMode] = useState(null)
  const [modeKey, setModeKey] = useState(0)
  const [tutorialText, setTutorialText] = useState('')
  const [tutorialVisible, setTutorialVisible] = useState(false)
  const [tutorialOpacity, setTutorialOpacity] = useState(null)
  const [tutorialFadeMs, setTutorialFadeMs] = useState(2000)
  const [shapeOption, setShapeOptionState] = useState(() => {
    const saved = localStorage.getItem('shapeOption') || 'd'
    return ['a', 'b', 'c', 'd', 'e'].includes(saved) ? saved : 'a'
  })
  const [sliderLayout, setSliderLayoutState] = useState(() => {
    const saved = localStorage.getItem('sliderLayout') || 'vertical'
    return ['vertical', 'diagonal'].includes(saved) ? saved : 'vertical'
  })
  const [targetPace, setTargetPaceState] = useState(() => {
    const saved = localStorage.getItem('targetPace') || DEFAULT_TARGET_PACE
    return Object.keys(TARGET_PACES).includes(saved) ? saved : DEFAULT_TARGET_PACE
  })
  const [selectedMode, setSelectedModeState] = useState(() => {
    const saved = localStorage.getItem('selectedMode') || 'basic'
    return ['basic', 'timed', 'slowing', 'box'].includes(saved) ? saved : 'basic'
  })

  const setShapeOption = useCallback((v) => {
    localStorage.setItem('shapeOption', v)
    setShapeOptionState(v)
  }, [])

  const setSliderLayout = useCallback((v) => {
    localStorage.setItem('sliderLayout', v)
    setSliderLayoutState(v)
  }, [])

  const setTargetPace = useCallback((v) => {
    localStorage.setItem('targetPace', v)
    setTargetPaceState(v)
  }, [])

  const setSelectedMode = useCallback((v) => {
    localStorage.setItem('selectedMode', v)
    setSelectedModeState(v)
  }, [])

  // Background is fully derived from the shape choice: Options D and E have
  // no visible Gates/rails, so they're the only ones that need an ambient
  // background as a pacing cue. A/B/C stay background-free.
  const backgroundOption = shapeOption === 'e' ? 'b' : shapeOption === 'd' ? 'rings' : 'none'

  const palette = PALETTES.teal
  const shapeRef = useRef(shapeOption)
  shapeRef.current = shapeOption

  const lastMoveTime = useRef(0)
  const tutorialVisibleRef = useRef(false)
  const tutorialTimerRef = useRef(null)
  const awaitingMovementRef = useRef(false)
  const stageRef = useRef('done')
  const pendingGatesFnRef = useRef(null) // null = not pending; thunk = fn to call when Text B finishes
  const currentMainTextRef = useRef('')
  const gatesEnabledRef = useRef(false)
  const spawnIntervalRef = useRef(12)
  const [breathLength, setBreathLength] = useState(12)
  const [breathControlVisible, setBreathControlVisible] = useState(false)
  const breathControlTimerRef = useRef(null)

  // Right-slider stroke counting for Text A trigger
  const rightStrokeCountRef = useRef(0)
  const rightDirectionRef = useRef(0)   // 0=unset, 1=up, -1=down
  const rightExtremeRef = useRef(null)
  const textAFadeStartedRef = useRef(false)
  const textBFadeStartedRef = useRef(false)

  // Diagonal-layout-only Text A1/A2/B1/B2 tutorial sequence state
  const diagStageRef = useRef('done')
  const diagDirectionRef = useRef(0)   // 0=unset, 1=up, -1=down
  const diagExtremeRef = useRef(null)
  const diagReversalCountRef = useRef(0)

  // Raw (unclamped) left-slider position, tracks thumb movement past the
  // slider's visual bounds. Used by SlowingDownController for breath timing.
  const leftRawRef = useRef(0)

  // Morphing Sphere breath-count rings (MorphC only): true once the universal
  // intro tutorial hands off to mode-specific text (see the two 'done' sites
  // below) -- counting is purely slider-driven (leftRawRef), identical across
  // every mode, not tied to any mode's own phase clock.
  const breathCountingEnabledRef = useRef(false)
  // Where the breath-count rings start counting, per mode: Basic/Paced start
  // at the intro hand-off (slider-driven, as before); Box Breathing starts at
  // the first box Inhale and Slowing Down at the first paced Inhale after
  // recording, both driven by the paced breath instead of the slider.
  // breathCountSourceRef.current: null = left slider, else a ref holding a
  // 0 (exhale) -> 1 (inhale) paced progress value for MorphC to count from.
  const introStartsCountingRef = useRef(true)
  const breathCountSourceRef = useRef(null)

  // App-wide breath-count palette cycle -- see PaletteLerpDriver above.
  // livePaletteRef holds the live (possibly mid-lerp) THREE.Color for every
  // palette field, read imperatively by MorphC/RingParticlesD/BackgroundRingsD
  // and by the Canvas background (via PaletteLerpDriver) every frame.
  const paletteCycleIndexRef = useRef(0)
  const paletteLerpRef = useRef(null)
  const livePaletteRef = useRef({
    tertiary: new THREE.Color(PALETTES.teal.tertiaryColor),
    primary: new THREE.Color(PALETTES.teal.primaryColor),
    secondary: new THREE.Color(PALETTES.teal.secondaryColor),
    background: new THREE.Color(PALETTES.teal.background),
    text: new THREE.Color(PALETTES.teal.textColor),
  })
  const handleBreathPaletteCycle = useCallback((now) => {
    const toIndex = (paletteCycleIndexRef.current + 1) % BREATH_CYCLE_PALETTES.length
    const live = livePaletteRef.current
    paletteLerpRef.current = {
      fromTertiary: live.tertiary.clone(),
      fromPrimary: live.primary.clone(),
      fromSecondary: live.secondary.clone(),
      fromBackground: live.background.clone(),
      fromText: live.text.clone(),
      toIndex,
      startTime: now,
    }
  }, [])

  // Slowing Down breath-tracking state, lifted here so it survives
  // SlowingDownController unmounting/remounting (e.g. when visiting Personalize)
  const prevRawRef = useRef(null)
  const directionRef = useRef(0)
  const extremeValueRef = useRef(0)
  const extremeTimeRef = useRef(0)
  const lastMinTimeRef = useRef(null)
  const hadMaxRef = useRef(false)
  const breathsRef = useRef([])
  const phaseRef = useRef('idle')
  const avgBreathRef = useRef(0)
  const phase2StartRef = useRef(0)
  const inhaleSecondsRef = useRef(null)
  const exhaleSecondsRef = useRef(null)
  const recordingEnabledRef = useRef(false)
  const lastMaxTimeRef = useRef(0)
  const gateEnableTimerRef = useRef(null)
  const bbCycleRef = useRef(0)
  const bbTutorialActiveRef = useRef(false)
  const breathPhaseRef = useRef('exhale')
  const holdFlareRef = useRef(0)
  const ringPaceProgressRef = useRef(0)
  // Box Breathing (Shape D) only: a clean, ground-truth phase/progress pair
  // written every frame by GatesBoxBreathingD from its own independent
  // 4-phase clock, read by RingParticlesD instead of breathPhaseRef/
  // ringPaceProgressRef (whose Box-mode meaning is inverted for BackgroundA
  // and has a startup artifact) so Sparkle stays correctly synced to real
  // Inhale/Hold-in/Exhale/Hold-out boundaries.
  const boxPhaseRef = useRef('exhale')
  const boxProgressRef = useRef(0)
  // Shape D paced-art startup fade (0-1): written by GatesBoxBreathingD /
  // SlowingDownPaceRingsD over the first Inhale, read by RingParticlesD.
  const paceArtFadeRef = useRef(1)
  // Timestamp (performance.now()) of the start of the whole Box Breathing
  // session -- stamped once (never reset per-caption/per-phase), shape-
  // agnostic. Both the caption poll below and TutorialText's per-second
  // pulse derive phaseIndex/phaseElapsed from this same clock, so which
  // caption shows and how it pulses can never disagree.
  const boxClockStartRef = useRef(0)
  const boxCaptionIndexRef = useRef(-1)
  // True only once the Inhale/Hold/Exhale/Hold captions have actually begun
  // (after the shared Text A/B or Diagonal A1/A2/B1/B2 intro finishes) --
  // distinct from bbTutorialActiveRef, which is also false *before* the
  // intro, so the caption poll can tell "hasn't started" from "already done"
  // and not stomp on the intro sequence's own visibility management.
  const boxCaptionsStartedRef = useRef(false)

  // Slowing Down hand-off (Shapes D/E): after Text D fades, wait for the
  // sliders to reach the bottom, then start the paced art on an Inhale with
  // Inhale/Exhale captions for the first 5 breaths, then Text E.
  const pacedWaitForBottomRef = useRef(false)
  const pacedCueStageRef = useRef('off')   // 'off' | 'captions' | 'textE' | 'done'
  const pacedBreathNumRef = useRef(0)
  const pacedCaptionRef = useRef(null)     // { start, mult, getDuration } read by TutorialText
  const textDShownAtRef = useRef(0)        // Text D (D/E) on-screen time is measured so Text E can match it
  const textDDurationMsRef = useRef(0)
  const [pacedCaptionsOn, setPacedCaptionsOn] = useState(false)

  const resetSlowingState = useCallback(() => {
    prevRawRef.current = null
    directionRef.current = 0
    extremeValueRef.current = 0
    extremeTimeRef.current = 0
    lastMinTimeRef.current = null
    hadMaxRef.current = false
    breathsRef.current = []
    phaseRef.current = 'idle'
    avgBreathRef.current = 0
    phase2StartRef.current = 0
    inhaleSecondsRef.current = null
    exhaleSecondsRef.current = null
    recordingEnabledRef.current = false
    lastMaxTimeRef.current = 0
  }, [])

  const handleBBFirstGate = useCallback((type) => {
    // Inverted vs. GatesC's direct 'inhale'/'exhale' writes: this fires at
    // Hold-onset and holds until the opposite Hold begins, so writing the
    // opposite of type is what lines up with BackgroundA's exhale-means-
    // visible convention (visible during Hold-in, invisible during Hold-out).
    breathPhaseRef.current = type === 'inhale' ? 'exhale' : 'inhale'
  }, [])

  const handleBBLastGate = useCallback((type) => {
    if (!bbTutorialActiveRef.current) return
    if (type === 'exhale') {
      bbCycleRef.current++
      if (bbCycleRef.current >= 4) {
        bbTutorialActiveRef.current = false
      }
    }
  }, [])

  const showTimedText = useCallback((text, duration = TEXT_C_DISPLAY_MS) => {
    if (!text) return
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = text
    setTutorialText(text)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
    tutorialTimerRef.current = setTimeout(() => {
      setTutorialVisible(false)
      tutorialVisibleRef.current = false
    }, duration)
  }, [])

  const showGatesText = useCallback(() => {
    gatesEnabledRef.current = true
    const breathMs = spawnIntervalRef.current * 1000
    const isAmbient = shapeRef.current === 'd' || shapeRef.current === 'e'
    const textC = isAmbient ? TEXTS.gatesTimedAmbient : TEXTS.gatesTimed
    const textD = isAmbient ? TEXTS.gatesTimedDAmbient : TEXTS.gatesTimedD

    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = textC
    setTutorialText(textC)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false

    tutorialTimerRef.current = setTimeout(() => {
      setTutorialVisible(false)
      tutorialVisibleRef.current = false
      tutorialTimerRef.current = setTimeout(() => {
        currentMainTextRef.current = textD
        setTutorialText(textD)
        setTutorialVisible(true)
        tutorialVisibleRef.current = true
        awaitingMovementRef.current = false
        clearTimeout(breathControlTimerRef.current)
        breathControlTimerRef.current = setTimeout(() => setBreathControlVisible(true), 2000)
        tutorialTimerRef.current = setTimeout(() => {
          setTutorialVisible(false)
          tutorialVisibleRef.current = false
        }, breathMs * 3)
      }, FADE_TRANSITION_MS)
    }, breathMs * 2)
  }, [])

  const showSlowingTextC = useCallback(() => {
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = TEXTS.gatesSlowing
    setTutorialText(TEXTS.gatesSlowing)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
    recordingEnabledRef.current = true
  }, [])

  const showSlowingTextD = useCallback(() => {
    const text = (shapeRef.current === 'd' || shapeRef.current === 'e') ? TEXTS.slowingTextDAmbient : TEXTS.slowingTextD
    textDShownAtRef.current = Date.now()
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = text
    setTutorialText(text)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
  }, [])

  const showSlowingTextE = useCallback(() => {
    const text = (shapeRef.current === 'd' || shapeRef.current === 'e') ? TEXTS.slowingTextEAmbient : TEXTS.slowingTextE
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = text
    setTutorialText(text)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
  }, [])

  const handleSlowingRecordingDone = useCallback(() => {
    if (shapeRef.current === 'd' || shapeRef.current === 'e') {
      // Art waits until Text D has been read and the sliders reach the
      // bottom (see startPacedArt); hold the ramp at the recorded pace.
      phase2StartRef.current = Infinity
      clearTimeout(tutorialTimerRef.current)
      setTutorialVisible(false)
      tutorialVisibleRef.current = false
      tutorialTimerRef.current = setTimeout(() => {
        showSlowingTextD()
      }, FADE_TRANSITION_MS)
      return
    }
    const t_done = Date.now() / 1000
    const P = avgBreathRef.current
    let d = 0
    if (lastMaxTimeRef.current > 0) {
      // Ratio is still 1.5 (symmetric) at t=0 of SlowingDownController's ramp —
      // inhaleSecondsRef/exhaleSecondsRef both start at avgBreathRef/2 — so this
      // fixed 1.5x travel-time assumption holds regardless of the selected target pace.
      const T_travel = ['a', 'b'].includes(shapeRef.current) ? 1.5 * P : P
      const elapsed = t_done - lastMaxTimeRef.current
      const k = Math.ceil((elapsed + T_travel) / P)
      d = Math.max(0, k * P - T_travel - elapsed)
    }
    phase2StartRef.current = t_done + d

    clearTimeout(tutorialTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    tutorialTimerRef.current = setTimeout(() => {
      showSlowingTextD()
    }, FADE_TRANSITION_MS)

    clearTimeout(gateEnableTimerRef.current)
    gateEnableTimerRef.current = setTimeout(() => {
      gatesEnabledRef.current = true
    }, d * 1000)
  }, [showSlowingTextD])

  const handleSlowingTextDDone = useCallback(() => {
    clearTimeout(tutorialTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    const headless = shapeRef.current === 'd' || shapeRef.current === 'e'
    if (textDShownAtRef.current) textDDurationMsRef.current = Date.now() - textDShownAtRef.current
    tutorialTimerRef.current = setTimeout(() => {
      if (headless) pacedWaitForBottomRef.current = true
      else showSlowingTextE()
    }, FADE_TRANSITION_MS)
  }, [showSlowingTextE])

  // Slowing Down (D/E): sliders reached the bottom after Text D -- start the
  // paced art on an Inhale (GatesHeadless*'s startOnInhale) and the ramp.
  const startPacedArt = useCallback(() => {
    pacedWaitForBottomRef.current = false
    breathPhaseRef.current = 'exhale'
    phase2StartRef.current = Date.now() / 1000
    pacedCueStageRef.current = 'captions'
    pacedBreathNumRef.current = 0
    breathCountSourceRef.current = shapeRef.current === 'd' ? ringPaceProgressRef : null
    breathCountingEnabledRef.current = true
    gatesEnabledRef.current = true
  }, [])

  const handlePacedPhase = useCallback((phase) => {
    const stage = pacedCueStageRef.current
    if (phase === 'inhale') pacedBreathNumRef.current++
    const n = pacedBreathNumRef.current
    if (stage === 'captions') {
      if (n === 0) return
      if (n > PACED_CAPTION_BREATHS) {
        // Captions end: let the (already faded) caption settle hidden, then
        // fade Text E in after the usual gap and hold it for as long as
        // Text D was on screen.
        pacedCueStageRef.current = 'textE'
        pacedCaptionRef.current = null
        setPacedCaptionsOn(false)
        clearTimeout(tutorialTimerRef.current)
        setTutorialVisible(false)
        tutorialVisibleRef.current = false
        tutorialTimerRef.current = setTimeout(() => {
          showSlowingTextE()
          tutorialTimerRef.current = setTimeout(() => {
            pacedCueStageRef.current = 'done'
            setTutorialVisible(false)
            tutorialVisibleRef.current = false
          }, textDDurationMsRef.current || PACED_TEXT_E_FALLBACK_MS)
        }, FADE_TRANSITION_MS)
        return
      }
      pacedCaptionRef.current = {
        start: performance.now(),
        mult: PACED_CAPTION_ALPHA[n - 1],
        getDuration: () => {
          const d = computePhaseDurations(spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef)
          return phase === 'inhale' ? d.inhaleDuration : d.exhaleDuration
        },
      }
      const text = phase === 'inhale' ? TEXTS.boxInhale : TEXTS.boxExhale
      clearTimeout(tutorialTimerRef.current)
      awaitingMovementRef.current = false
      currentMainTextRef.current = text
      setTutorialText(text)
      setTutorialVisible(true)
      tutorialVisibleRef.current = true
      setPacedCaptionsOn(true)
    }
  }, [showSlowingTextE])

  const handleSlowingTextEDone = useCallback(() => {
    clearTimeout(tutorialTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
  }, [])

  const advanceSequence = useCallback(() => {
    if (stageRef.current !== 'A') return
    stageRef.current = 'B'
    currentMainTextRef.current = TEXT_B
    setTutorialText(TEXT_B)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
    rightStrokeCountRef.current = 0
    rightDirectionRef.current = 0
    rightExtremeRef.current = null
    textBFadeStartedRef.current = false
  }, [])

  const triggerTextAFade = useCallback(() => {
    if (stageRef.current !== 'A') return
    clearTimeout(tutorialTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    tutorialTimerRef.current = setTimeout(() => {
      advanceSequence()
    }, FADE_TRANSITION_MS)
  }, [advanceSequence])

  const triggerTextBFade = useCallback(() => {
    if (stageRef.current !== 'B') return
    clearTimeout(tutorialTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    tutorialTimerRef.current = setTimeout(() => {
      stageRef.current = 'done'
      if (introStartsCountingRef.current) breathCountingEnabledRef.current = true
      if (pendingGatesFnRef.current !== null) {
        const fn = pendingGatesFnRef.current
        pendingGatesFnRef.current = null
        fn()
      }
    }, FADE_TRANSITION_MS)
  }, [])

  const handleMovement = useCallback(() => {
    if (!awaitingMovementRef.current) return
    awaitingMovementRef.current = false
    clearTimeout(tutorialTimerRef.current)
    tutorialTimerRef.current = setTimeout(() => {
      setTutorialVisible(false)
      tutorialVisibleRef.current = false
      tutorialTimerRef.current = setTimeout(() => {
        advanceSequence()
      }, FADE_TRANSITION_MS)
    }, MOVEMENT_FADE_DELAY_MS)
  }, [advanceSequence])

  const beginDiagonalHold = useCallback((seedV) => {
    diagReversalCountRef.current = 0
    diagDirectionRef.current = 0
    diagExtremeRef.current = seedV
  }, [])

  const finishDiagonalSequence = useCallback(() => {
    diagStageRef.current = 'B2-fadeout'
    clearTimeout(tutorialTimerRef.current)
    setTutorialFadeMs(DIAG_FADE_OUT_MS)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    tutorialTimerRef.current = setTimeout(() => {
      diagStageRef.current = 'done'
      if (introStartsCountingRef.current) breathCountingEnabledRef.current = true
      if (pendingGatesFnRef.current !== null) {
        const fn = pendingGatesFnRef.current
        pendingGatesFnRef.current = null
        fn()
      }
    }, DIAG_FADE_OUT_MS)
  }, [])

  const showDiagonalB2 = useCallback(() => {
    diagStageRef.current = 'B2-hold-pending'
    currentMainTextRef.current = TEXT_B2_DIAGONAL
    setTutorialText(TEXT_B2_DIAGONAL)
    setTutorialFadeMs(DIAG_FADE_IN_MS)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    clearTimeout(tutorialTimerRef.current)
    tutorialTimerRef.current = setTimeout(() => {
      diagStageRef.current = 'B2-hold'
      beginDiagonalHold(leftVal.current)
    }, DIAG_FADE_IN_MS)
  }, [beginDiagonalHold])

  // Diagonal-slider-layout-only tutorial sequence: continuous, left-slider-
  // position-driven fades for A1/A2, then timed fade-in + 1-breath-cycle-hold
  // + timed fade-out for B1/B2. Runs entirely off setLeft (no useFrame needed,
  // consistent with the rest of App.jsx's event-driven tutorial state).
  const updateDiagonalSequence = useCallback((v) => {
    const stage = diagStageRef.current
    if (stage === 'A1') {
      setTutorialOpacity(1 - v)
      if (v >= 1 - DIAG_EDGE_THRESHOLD) {
        diagStageRef.current = 'A2-appear'
        setTutorialOpacity(null)
        currentMainTextRef.current = TEXT_A2_DIAGONAL
        setTutorialText(TEXT_A2_DIAGONAL)
        setTutorialFadeMs(DIAG_FADE_IN_MS)
        setTutorialVisible(true)
        tutorialVisibleRef.current = true
        clearTimeout(tutorialTimerRef.current)
        tutorialTimerRef.current = setTimeout(() => {
          diagStageRef.current = 'A2-track'
        }, DIAG_FADE_IN_MS)
      }
    } else if (stage === 'A2-track') {
      setTutorialOpacity(v)
      if (v <= DIAG_EDGE_THRESHOLD) {
        diagStageRef.current = 'B1-appear'
        setTutorialOpacity(null)
        currentMainTextRef.current = TEXT_B1_DIAGONAL
        setTutorialText(TEXT_B1_DIAGONAL)
        setTutorialFadeMs(DIAG_FADE_IN_MS)
        setTutorialVisible(true)
        tutorialVisibleRef.current = true
        clearTimeout(tutorialTimerRef.current)
        tutorialTimerRef.current = setTimeout(() => {
          diagStageRef.current = 'B1-hold'
          beginDiagonalHold(leftVal.current)
        }, DIAG_FADE_IN_MS)
      }
    } else if (stage === 'B1-hold' || stage === 'B2-hold') {
      if (diagExtremeRef.current === null) {
        diagExtremeRef.current = v
        return
      }
      const delta = v - diagExtremeRef.current
      if (diagDirectionRef.current === 0) {
        if (delta < -DIAG_DEADBAND) {
          diagDirectionRef.current = -1; diagExtremeRef.current = v; diagReversalCountRef.current = 1
        } else if (delta > DIAG_DEADBAND) {
          diagDirectionRef.current = 1; diagExtremeRef.current = v; diagReversalCountRef.current = 1
        }
      } else {
        if (diagDirectionRef.current === 1 && delta < -DIAG_DEADBAND) {
          diagDirectionRef.current = -1; diagExtremeRef.current = v; diagReversalCountRef.current++
        } else if (diagDirectionRef.current === -1 && delta > DIAG_DEADBAND) {
          diagDirectionRef.current = 1; diagExtremeRef.current = v; diagReversalCountRef.current++
        } else if (diagDirectionRef.current === 1 && v > diagExtremeRef.current) {
          diagExtremeRef.current = v
        } else if (diagDirectionRef.current === -1 && v < diagExtremeRef.current) {
          diagExtremeRef.current = v
        }

        if (diagReversalCountRef.current >= DIAG_CYCLE_STROKES) {
          if (stage === 'B1-hold') {
            diagStageRef.current = 'B1-fadeout'
            clearTimeout(tutorialTimerRef.current)
            setTutorialFadeMs(DIAG_FADE_OUT_MS)
            setTutorialVisible(false)
            tutorialVisibleRef.current = false
            tutorialTimerRef.current = setTimeout(showDiagonalB2, DIAG_FADE_OUT_MS)
          } else {
            finishDiagonalSequence()
          }
        }
      }
    }
  }, [beginDiagonalHold, showDiagonalB2, finishDiagonalSequence])

  useEffect(() => {
    if (screen !== 'experience') return
    const id = setInterval(() => {
      // Box Breathing's captions are driven by their own clock-based poll
      // below, not by user interaction -- "stillness" is meaningless here.
      if (mode === 'box') return
      if (mode === 'slowing' && pacedCueStageRef.current === 'captions') return
      if (sliderLayout === 'diagonal' && diagStageRef.current !== 'done') return
      if (!tutorialVisibleRef.current && Date.now() - lastMoveTime.current >= STILLNESS_MS) {
        awaitingMovementRef.current = true
        setTutorialText(currentMainTextRef.current)
        setTutorialVisible(true)
        tutorialVisibleRef.current = true
      }
    }, 500)
    return () => clearInterval(id)
  }, [screen, sliderLayout, mode])

  // Box Breathing's captions: which of Inhale/Hold/Exhale/Hold shows, and
  // when, is derived purely from boxClockStartRef + spawnIntervalRef -- the
  // same clock TutorialText's pulse effect reads -- instead of the old
  // gate-crossing-triggered show/hide sequence, so the two can never
  // disagree about where in the cycle they are. Text stays continuously
  // visible while the tutorial is active; content just swaps in place.
  useEffect(() => {
    if (mode !== 'box') return
    const id = setInterval(() => {
      // Don't touch tutorialVisible/tutorialText until the shared intro
      // (Text A/B or the Diagonal A1/A2/B1/B2 sequence) has actually handed
      // off -- bbTutorialActiveRef is also false during that intro, so
      // checking only that would hide the intro text within one tick.
      if (!boxCaptionsStartedRef.current) return
      if (!bbTutorialActiveRef.current) {
        if (tutorialVisibleRef.current) {
          setTutorialVisible(false)
          tutorialVisibleRef.current = false
        }
        return
      }
      const interval = Math.max(0.05, spawnIntervalRef.current)
      const totalElapsed = Math.max(0, (performance.now() - boxClockStartRef.current) / 1000)
      const phaseIndex = Math.floor((totalElapsed % (4 * interval)) / interval)
      if (phaseIndex !== boxCaptionIndexRef.current) {
        boxCaptionIndexRef.current = phaseIndex
        const nextText = [TEXTS.boxInhale, TEXTS.boxHold, TEXTS.boxExhale, TEXTS.boxHold][phaseIndex]
        currentMainTextRef.current = nextText
        setTutorialText(nextText)
        if (!tutorialVisibleRef.current) {
          setTutorialVisible(true)
          tutorialVisibleRef.current = true
        }
      }
    }, 100)
    return () => clearInterval(id)
  }, [mode])

  useEffect(() => () => clearTimeout(tutorialTimerRef.current), [])

  useEffect(() => {
    spawnIntervalRef.current = breathLength
  }, [breathLength])

  const handleBreathChange = useCallback((v) => {
    setBreathLength(v)
  }, [])

  const setLeft = useCallback((v) => {
    leftVal.current = v
    lastMoveTime.current = Date.now()
    if (sliderLayout === 'diagonal') updateDiagonalSequence(v)
    if (pacedWaitForBottomRef.current && v <= DIAG_EDGE_THRESHOLD) startPacedArt()
    handleMovement()
  }, [handleMovement, sliderLayout, updateDiagonalSequence, startPacedArt])

  const setRight = useCallback((v) => {
    rightVal.current = v
    lastMoveTime.current = Date.now()

    const stage = stageRef.current
    if ((stage === 'A' && !textAFadeStartedRef.current) || (stage === 'B' && !textBFadeStartedRef.current)) {
      if (rightExtremeRef.current === null) {
        rightExtremeRef.current = v
      } else {
        const delta = v - rightExtremeRef.current
        if (rightDirectionRef.current === 0) {
          if (delta < -RIGHT_DEADBAND) {
            rightDirectionRef.current = -1; rightExtremeRef.current = v; rightStrokeCountRef.current = 1
          } else if (delta > RIGHT_DEADBAND) {
            rightDirectionRef.current = 1; rightExtremeRef.current = v; rightStrokeCountRef.current = 1
          }
        } else {
          if (rightDirectionRef.current === 1 && delta < -RIGHT_DEADBAND) {
            rightDirectionRef.current = -1; rightExtremeRef.current = v; rightStrokeCountRef.current++
          } else if (rightDirectionRef.current === -1 && delta > RIGHT_DEADBAND) {
            rightDirectionRef.current = 1; rightExtremeRef.current = v; rightStrokeCountRef.current++
          } else if (rightDirectionRef.current === 1 && v > rightExtremeRef.current) {
            rightExtremeRef.current = v
          } else if (rightDirectionRef.current === -1 && v < rightExtremeRef.current) {
            rightExtremeRef.current = v
          }
          if (stage === 'A' && rightStrokeCountRef.current >= TARGET_STROKES_A) {
            textAFadeStartedRef.current = true
            triggerTextAFade()
          } else if (stage === 'B' && rightStrokeCountRef.current >= TARGET_STROKES_B) {
            textBFadeStartedRef.current = true
            triggerTextBFade()
          }
        }
      }
    }

    handleMovement()
  }, [handleMovement, triggerTextAFade, triggerTextBFade])

  const handleSelectMode = useCallback((m) => {
    gatesEnabledRef.current = false
    clearTimeout(gateEnableTimerRef.current)
    spawnIntervalRef.current = m === 'timed' ? 12 : m === 'box' ? 4 : 8
    inhaleSecondsRef.current = null
    exhaleSecondsRef.current = null
    if (m === 'timed' || m === 'slowing' || m === 'box') { clearTimeout(breathControlTimerRef.current); setBreathControlVisible(false) }
    if (m === 'timed') setBreathLength(12)
    lastMoveTime.current = Date.now() - STILLNESS_MS - 1
    if (m === 'slowing') resetSlowingState()
    bbCycleRef.current = 0
    bbTutorialActiveRef.current = false
    boxCaptionsStartedRef.current = false
    pacedWaitForBottomRef.current = false
    pacedCueStageRef.current = 'off'
    pacedBreathNumRef.current = 0
    pacedCaptionRef.current = null
    setPacedCaptionsOn(false)
    textDShownAtRef.current = 0
    textDDurationMsRef.current = 0

    clearTimeout(tutorialTimerRef.current)
    pendingGatesFnRef.current = null
    awaitingMovementRef.current = false
    breathCountingEnabledRef.current = false
    introStartsCountingRef.current = m !== 'box' && m !== 'slowing'
    breathCountSourceRef.current = null
    breathPhaseRef.current = 'exhale'
    paceArtFadeRef.current = 1
    paletteCycleIndexRef.current = 0
    paletteLerpRef.current = null
    livePaletteRef.current.tertiary.set(PALETTES.teal.tertiaryColor)
    livePaletteRef.current.primary.set(PALETTES.teal.primaryColor)
    livePaletteRef.current.secondary.set(PALETTES.teal.secondaryColor)
    livePaletteRef.current.background.set(PALETTES.teal.background)
    livePaletteRef.current.text.set(PALETTES.teal.textColor)

    if (sliderLayout === 'diagonal') {
      stageRef.current = 'done'
      diagStageRef.current = 'A1'
      diagDirectionRef.current = 0
      diagExtremeRef.current = null
      diagReversalCountRef.current = 0
      currentMainTextRef.current = TEXT_A1_DIAGONAL
      setTutorialText(TEXT_A1_DIAGONAL)
      setTutorialFadeMs(2000)
      setTutorialOpacity(1 - leftVal.current)
      setTutorialVisible(true)
      tutorialVisibleRef.current = true
    } else {
      diagStageRef.current = 'done'
      setTutorialOpacity(null)
      setTutorialFadeMs(2000)
      stageRef.current = 'A'
      rightStrokeCountRef.current = 0
      rightDirectionRef.current = 0
      rightExtremeRef.current = null
      textAFadeStartedRef.current = false
      textBFadeStartedRef.current = false
      currentMainTextRef.current = TEXT_B
      setTutorialText(TEXT_A)
      setTutorialVisible(true)
      tutorialVisibleRef.current = true
    }
    if (m === 'timed') pendingGatesFnRef.current = showGatesText
    if (m === 'slowing') pendingGatesFnRef.current = showSlowingTextC
    if (m === 'box') pendingGatesFnRef.current = () => {
      bbCycleRef.current = 0
      bbTutorialActiveRef.current = true
      boxCaptionsStartedRef.current = true
      gatesEnabledRef.current = true
      boxClockStartRef.current = performance.now()
      boxCaptionIndexRef.current = 0
      // First Inhale of the first box: start counting, one ring per box cycle
      // (Shape D's paced progress; other shapes fall back to the slider).
      breathCountSourceRef.current = shapeRef.current === 'd' ? boxProgressRef : null
      breathCountingEnabledRef.current = true
      currentMainTextRef.current = TEXTS.boxInhale
      setTutorialText(TEXTS.boxInhale)
      setTutorialVisible(true)
      tutorialVisibleRef.current = true
    }

    setMode(m)
    setModeKey(k => k + 1)
    setScreen('experience')
  }, [resetSlowingState, showGatesText, showSlowingTextC, sliderLayout])

  // Slowing Down: first paced Inhale after recording (see PacedBreathCountStarter).
  const handlePacedCountStart = useCallback(() => {
    breathCountSourceRef.current = shapeRef.current === 'd' ? ringPaceProgressRef : null
    breathCountingEnabledRef.current = true
  }, [])

  const handleRestart = useCallback(() => {
    handleSelectMode(mode)
  }, [mode, handleSelectMode])

  const handleBackFromExperience = useCallback(() => {
    gatesEnabledRef.current = false
    pacedWaitForBottomRef.current = false
    pacedCueStageRef.current = 'off'
    pacedBreathNumRef.current = 0
    pacedCaptionRef.current = null
    setPacedCaptionsOn(false)
    textDShownAtRef.current = 0
    textDDurationMsRef.current = 0
    clearTimeout(tutorialTimerRef.current)
    clearTimeout(gateEnableTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    setMode(null)
    setScreen('selectMode')
  }, [])

  // Measures the Home/Restart button (group)'s own rendered height so the
  // sliders can be shifted up to sit flush against its top edge -- avoids
  // hardcoding a guessed pixel height for the nav buttons.
  const navButtonsRef = useRef(null)
  const [sliderShiftUp, setSliderShiftUp] = useState(50)
  useLayoutEffect(() => {
    if (navButtonsRef.current) setSliderShiftUp(navButtonsRef.current.offsetHeight)
  }, [sliderLayout])

  if (screen === 'selectMode') {
    return (
      <SelectModeScreen
        onStart={handleSelectMode}
        onPersonalize={() => setScreen('personalize')}
        onSliderLayouts={() => setScreen('sliderLayouts')}
        palette={palette}
        selectedMode={selectedMode}
        onSelectModeChange={setSelectedMode}
      />
    )
  }
  if (screen === 'sliderLayouts') {
    return (
      <SliderLayoutsScreen
        selected={sliderLayout}
        onSelect={setSliderLayout}
        onHome={() => setScreen('selectMode')}
        palette={palette}
      />
    )
  }
  if (screen === 'personalize') {
    return (
      <PersonalizeScreen
        shapeOption={shapeOption}
        onSelectShape={setShapeOption}
        onSelectMode={() => setScreen('selectMode')}
        palette={palette}
      />
    )
  }
  if (screen === 'breathPaceOptions') {
    return (
      <BreathPaceOptionsScreen
        selected={targetPace}
        onSelect={setTargetPace}
        onHome={() => setScreen('experience')}
        palette={palette}
      />
    )
  }
  const hasGates = mode === 'timed' || mode === 'slowing' || mode === 'box'
  const MorphComponent = shapeOption === 'b' ? MorphB : shapeOption === 'c' || shapeOption === 'd' ? MorphC : shapeOption === 'e' ? MorphE : MorphA
  const GatesComponent = shapeOption === 'b' ? GatesB : shapeOption === 'c' ? GatesC : shapeOption === 'd' ? GatesHeadless : shapeOption === 'e' ? GatesHeadlessE : GatesA
  const BoxGatesComponent = shapeOption === 'b' ? GatesBoxBreathingB : shapeOption === 'c' ? GatesBoxBreathingC : shapeOption === 'd' ? GatesBoxBreathingD : shapeOption === 'e' ? GatesBoxBreathingHeadlessE : GatesBoxBreathingA
  const targetPaceInfo = TARGET_PACES[targetPace] || TARGET_PACES[DEFAULT_TARGET_PACE]

  return (
    <div key={modeKey} ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={CAMERA_BY_SHAPE[shapeOption] || DEFAULT_CAMERA}
        style={{ position: 'absolute', inset: 0 }}
      >
        <color attach="background" args={[palette.background]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <PaletteLerpDriver livePaletteRef={livePaletteRef} paletteLerpRef={paletteLerpRef} paletteCycleIndexRef={paletteCycleIndexRef} wrapperRef={wrapperRef} />
        {shapeOption === 'd' && <CameraVerticalShift />}
        <MorphComponent leftVal={leftVal} rightVal={rightVal} palette={palette} shapeOption={shapeOption} leftRawRef={leftRawRef} breathCountingEnabledRef={breathCountingEnabledRef} breathCountSourceRef={breathCountSourceRef} livePaletteRef={livePaletteRef} onBreathPaletteCycle={handleBreathPaletteCycle} />
        {backgroundOption === 'rings' && <BackgroundRingsD baseColor={palette.background} emissiveColor={palette.secondaryColor} breathPhaseRef={breathPhaseRef} gatesEnabledRef={gatesEnabledRef} spawnIntervalRef={spawnIntervalRef} inhaleSecondsRef={inhaleSecondsRef} exhaleSecondsRef={exhaleSecondsRef} paceProgressRef={ringPaceProgressRef} livePaletteRef={livePaletteRef} />}
        {backgroundOption === 'rings' && <RingParticlesD textColor={palette.textColor} secondaryColor={palette.secondaryColor} tertiaryColor={palette.tertiaryColor} primaryColor={palette.primaryColor} paceProgressRef={ringPaceProgressRef} breathPhaseRef={breathPhaseRef} gatesEnabledRef={gatesEnabledRef} isBoxBreathing={mode === 'box'} boxPhaseRef={boxPhaseRef} boxProgressRef={boxProgressRef} livePaletteRef={livePaletteRef} paceArtFadeRef={paceArtFadeRef} />}
        {mode === 'slowing' && shapeOption !== 'd' && shapeOption !== 'e' && <PacedBreathCountStarter gatesEnabledRef={gatesEnabledRef} breathPhaseRef={breathPhaseRef} onStart={handlePacedCountStart} />}
        {mode === 'slowing' && (shapeOption === 'd' || shapeOption === 'e') && <PacedPhaseWatcher gatesEnabledRef={gatesEnabledRef} breathPhaseRef={breathPhaseRef} onPhaseChange={handlePacedPhase} />}
        {mode === 'slowing' && shapeOption === 'd' && <SlowingDownPaceRingsD gatesEnabledRef={gatesEnabledRef} breathPhaseRef={breathPhaseRef} spawnIntervalRef={spawnIntervalRef} inhaleSecondsRef={inhaleSecondsRef} exhaleSecondsRef={exhaleSecondsRef} gateColor={palette.secondaryColor} emissiveColor={palette.primaryColor} livePaletteRef={livePaletteRef} paceArtFadeRef={paceArtFadeRef} />}
        {backgroundOption === 'b' && <BackgroundB gateColor={palette.secondaryColor} breathPhaseRef={breathPhaseRef} gatesEnabledRef={gatesEnabledRef} spawnIntervalRef={spawnIntervalRef} inhaleSecondsRef={inhaleSecondsRef} exhaleSecondsRef={exhaleSecondsRef} />}
        <EffectComposer>
          <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.5} />
        </EffectComposer>
        {hasGates && mode !== 'box' && (
          <GatesComponent
            gatesEnabledRef={gatesEnabledRef}
            spawnIntervalRef={spawnIntervalRef}
            gateColor={palette.secondaryColor}
            emissiveColor={palette.primaryColor}
            breathPhaseRef={breathPhaseRef}
            inhaleSecondsRef={inhaleSecondsRef}
            exhaleSecondsRef={exhaleSecondsRef}
            livePaletteRef={livePaletteRef}
            startOnInhale={mode === 'slowing'}
          />
        )}
        {mode === 'box' && hasGates && (
          <BoxGatesComponent
            gatesEnabledRef={gatesEnabledRef}
            spawnIntervalRef={spawnIntervalRef}
            gateColor={palette.secondaryColor}
            emissiveColor={palette.primaryColor}
            onFirstGate={handleBBFirstGate}
            onLastGate={handleBBLastGate}
            holdFlareRef={holdFlareRef}
            livePaletteRef={livePaletteRef}
            boxPhaseRef={boxPhaseRef}
            boxProgressRef={boxProgressRef}
            paceArtFadeRef={paceArtFadeRef}
          />
        )}
        {shapeOption === 'e' && mode === 'box' && (
          <StarFieldE gateColor={palette.secondaryColor} emissiveColor={palette.primaryColor} holdFlareRef={holdFlareRef} />
        )}
        {mode === 'slowing' && (
          <SlowingDownController
            leftRawRef={leftRawRef}
            spawnIntervalRef={spawnIntervalRef}
            recordingEnabledRef={recordingEnabledRef}
            lastMaxTimeRef={lastMaxTimeRef}
            onGatesReady={handleSlowingRecordingDone}
            onTextDone={handleSlowingTextDDone}
            onTextEDone={shapeOption === 'd' || shapeOption === 'e' ? () => {} : handleSlowingTextEDone}
            inhaleSecondsRef={inhaleSecondsRef}
            exhaleSecondsRef={exhaleSecondsRef}
            targetInhaleSeconds={targetPaceInfo.inhale}
            targetExhaleSeconds={targetPaceInfo.exhale}
            prevRawRef={prevRawRef}
            directionRef={directionRef}
            extremeValueRef={extremeValueRef}
            extremeTimeRef={extremeTimeRef}
            lastMinTimeRef={lastMinTimeRef}
            hadMaxRef={hadMaxRef}
            breathsRef={breathsRef}
            phaseRef={phaseRef}
            avgBreathRef={avgBreathRef}
            phase2StartRef={phase2StartRef}
          />
        )}
      </Canvas>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
          {sliderLayout === 'diagonal'
            ? <SlidersDiagonal onLeft={setLeft} onRight={setRight} leftRawRef={leftRawRef} shiftUp={sliderShiftUp} />
            : <Sliders onLeft={setLeft} onRight={setRight} leftRawRef={leftRawRef} shiftUp={sliderShiftUp} />}
        </div>
        <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)' }}>
          <span style={{
            color: 'var(--live-text-color, rgba(255,255,255,0.7))', fontSize: 13, fontFamily: 'sans-serif',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            display: 'block', textAlign: 'center', whiteSpace: 'pre',
          }}>
            {/* Break "Guided Breathing: X" after the colon; others stay on one line */}
            {MODE_LABELS[mode]?.replace(': ', ':\n')}
          </span>
        </div>
        {mode === 'slowing' && (
          // Unlabeled dev-option button (Change Target Pace), styled to match
          // SelectModeScreen's Slider Layouts square.
          <button onClick={() => setScreen('breathPaceOptions')}
                  aria-label="Change Target Pace"
                  style={{
                    position: 'absolute', top: 16, left: 16,
                    width: 28, height: 28, padding: 0,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6,
                    cursor: 'pointer', pointerEvents: 'auto',
                  }} />
        )}
        <TutorialText text={tutorialText} visible={tutorialVisible} opacity={tutorialOpacity} fadeMs={tutorialFadeMs}
          pulseActive={(mode === 'box' && tutorialVisible && (tutorialText === TEXTS.boxInhale || tutorialText === TEXTS.boxHold || tutorialText === TEXTS.boxExhale))
            || (mode === 'slowing' && pacedCaptionsOn && tutorialVisible)}
          pulseMode={mode === 'slowing' ? 'paced' : tutorialText === TEXTS.boxHold ? 'pulse' : 'fade'}
          pulseCycleStartRef={boxClockStartRef} pulseIntervalRef={spawnIntervalRef} pacedCaptionRef={pacedCaptionRef} />
        {mode === 'timed' && (
          <BreathLengthControl
            breathLength={breathLength}
            onChange={handleBreathChange}
            visible={breathControlVisible}
          />
        )}
        {sliderLayout === 'diagonal' ? (
          <>
            <button ref={navButtonsRef} onClick={handleBackFromExperience} style={{ ...navPillStyle, position: 'absolute', bottom: 16, left: 16 }}>
              Home
            </button>
            <button onClick={handleRestart} style={{ ...navPillStyle, position: 'absolute', bottom: 16, right: 16 }}>
              Restart
            </button>
          </>
        ) : (
          <div ref={navButtonsRef} style={{
            position: 'absolute', bottom: 16, left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column',
            gap: 20, alignItems: 'center',
            pointerEvents: 'auto',
          }}>
            {[
              { label: 'Home', onClick: handleBackFromExperience },
              { label: 'Restart', onClick: handleRestart },
            ].map(({ label, onClick }) => (
              <button key={label} onClick={onClick} style={navPillStyle}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
