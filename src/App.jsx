import { useRef, useCallback, useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import MorphA from './MorphA'
import LandscapeB from './LandscapeB'
import SideCloudsF from './SideCloudsF'
import MorphB from './MorphB'
import MorphC from './MorphC'
import MorphE from './MorphE'
import MorphF from './MorphF'
import MorphG from './MorphG'
import MorphH from './MorphH'
import BalloonCourseH from './BalloonCourseH'
import MorphJ from './MorphJ'
import SpaceshipBayJ from './SpaceshipBayJ'
import GatesF from './GatesF'
import GatesBoxBreathingF from './GatesBoxBreathingF'
import GatesG from './GatesG'
import GatesBoxBreathingG from './GatesBoxBreathingG'
import GroundTiesG from './GroundTiesG'
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
import InputTestReadout from './InputTestReadout'
import PasscodeScreen from './PasscodeScreen'
import { RESET_ON_UNLOCK, TESTING_DEFAULTS } from './passcode'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { PALETTES } from './palettes'
import { BREATH_CYCLE_PALETTES } from './breathCyclePalettes'
import { MODE_INTRO, TEXT_A, TEXT_B, TEXTS, TEXT_A1_DIAGONAL, TEXT_A2_DIAGONAL, TEXT_B1_DIAGONAL, TEXT_B2_DIAGONAL, TEXT_B3, MODE_LABELS, TUTORIAL, MODE_SCREENS, TEST_BELL_LABEL } from './copy'
import { TARGET_PACES, DEFAULT_TARGET_PACE, BOX_STEP_SECONDS } from './breathPace'
import { createAudioEngine, BELL_INHALE_EXHALE, BELL_HOLD, BELL_INHALE_GAIN } from './breathAudio'
import { UI_EDGE, UI_INTERIOR } from './uiColors'
import { useBreathControl, requestTiltPermission, requestMicAccess } from './useBreathControl'
import { useWakeLock } from './useWakeLock'
import MicCheck from './MicCheck'

const navPillStyle = {
  background: UI_INTERIOR,
  border: `1px solid ${UI_EDGE}`,
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
// Mode-name caption at top-center; the mode explanation starts two blank
// caption line below it (the label breaks after its colon: 2 lines, else 1).
const MODE_CAPTION_TOP = 16
const MODE_CAPTION_LINE_PX = 16
// TEMP (testing): drive the paced audio pair from the right slider in every
// mode instead of the app's pace. Set false to restore the paced behavior.
const PACE_AUDIO_FROM_RIGHT_SLIDER = false
const MODE_INTRO_MS = 10000  // mode explanation shown before each tutorial, then fades out (MODE_INTRO_FADE_OUT_MS)
const MODE_INTRO_FADE_OUT_MS = 4000
const A1_FADE_IN_MS = 2000   // Diagonal Text A1's fade-in after the mode explanation
const RIGHT_DEADBAND = 0.08
const TARGET_STROKES_A = 4  // 2 full up+down oscillations
const TARGET_STROKES_B = 6  // 3 full up+down oscillations

// Diagonal-layout-only Text A1/A2/B1/B2 tutorial sequence
const DIAG_EDGE_THRESHOLD = 0.02  // lv within this of 0/1 counts as "at the end"
const DIAG_DEADBAND = 0.08
const DIAG_CYCLE_STROKES = 2      // 2 strokes = 1 full up+down breath cycle
const DIAG_FADE_IN_MS = 1000
const DIAG_FADE_OUT_MS = 2000
const DIAG_ROUNDS = 3             // A1/A2 (up/down) rounds before B1

// Blank-background start: the scene and sliders stay covered (background
// color) through the mode explanation and Text A1's fade-in, then fade in
// over SCENE_REVEAL_MS; the sliders become touchable when it finishes.
const SCENE_REVEAL_MS = 3000
const COUNT_FADE_MS = 1000   // count-tutorial texts: fade out, swap, fade in (each this long)

// Guided Breathing: Tutorial mode (tutorialRef).
const TUTORIAL_SCREEN_FADE_MS = 2000   // Part screens + Continue button fade in/out
const TUTORIAL_REVEAL_LAG_MS = 1000    // Part 1: sliders + Morph start fading in this long after "Inhale and..."
const TUTORIAL_REMIND_MS = 5000       // sliders still this long -> "Remember to move the sliders..."
const TUTORIAL_PREPARE_MS = 3000       // "Relax and prepare to inhale." shows this long before the countdown
const COUNTDOWN_STEP_MS = 1000         // each of 3, 2, 1
const COUNTDOWN_FADE_MS = 300          // each number fades in and out over this
const COUNTDOWN_START_MS = 2000        // "Start" (with the first paced Inhale) shows this long, then fades
const TUTORIAL_DONE_AFTER_MS = 24000   // closing text: 2 paced 6-6 breaths after "Inhale" = the 3rd Inhale
const TUTORIAL_DONE_SHOW_MS = 10000    // closing text shows this long, then fades
const TUTORIAL_SUB_GAP_PX = 15         // extra space above the countdown line
const PRACTICE_FREE_BREATHS = 1        // breaths with no text between "You got it!" and "Notice how..."
const TUTORIAL_TEXT_LIFT_PX = 72       // 30 px tutorial text sits 2 lines (2 x 30 x 1.2) above the default spot
const PRACTICE_AFTER_BREATHS = 2       // breaths after "Notice how..." before Part 2

// Tutorial font sizes: mode explanation, paced captions (Inhale/Hold/Exhale), everything else.
const TEXT_SIZE_INTRO = 24
const INTRO_EXTRA_LINES = 2   // blank intro-size lines added above the mode explanation (line height 1.2)
const TEXT_SIZE_CAPTION = 60
const TEXT_SIZE_TUTORIAL = 30

// Modes that open with Tutorial-style screens (text at the top + Continue).
const usesScreens = (m) => m === 'tutorial' || m === 'box' || m === 'slowing'

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
  f: { position: [0, 0, 12], rotation: [0, 0, 0], fov: 135 },  // Sphere Morph's (d) placement, wider fov
  g: { position: [0, 7, 10], fov: 50 },   // the cube's (b) look-at-origin angle, twice as far back
  h: { position: [0, 7, 10], fov: 50 },   // the Paper Airplane's camera
  j: { position: [0, 3.5, 5], fov: 50 },  // the Morphing Cube's camera
}
const DEFAULT_CAMERA = CAMERA_BY_SHAPE.a

// Space Ship (j): its coaching texts (handleShipText).
const SHIP_TEXTS = [TEXTS.shipInhaleA, TEXTS.shipInhaleB, TEXTS.shipBlow]

// Shapes that use the Morphing Cube's count/tutorial flow (the Hot Air
// Balloon reuses the cube's 5-breath count and target timing).
const usesCubeFlow = (shape) => shape === 'b' || shape === 'f'
// Shapes on the D/E paced hand-off (gates with startOnInhale, no count
// counted from the pace) and their ambient copy. The Paper Airplane (g) has
// cloud obstacles but no count, so it follows this flow.
// Input Test (i) has no art at all, so it takes the no-targets paths too.
const isAmbientArt = (shape) => shape === 'd' || shape === 'e' || shape === 'g' || shape === 'h' || shape === 'i' || shape === 'j'

// Breath-count palette cycle (see MorphC.jsx / breathCyclePalettes.js):
// MorphC decides WHEN to cycle (breath 1's inhale of a new group) and calls
// back up here; this drives the actual color lerp so it reaches every
// palette-consuming piece of the live scene, not just MorphC's own colors.
const PALETTE_LERP_DURATION = 1.0

const LABEL_LERP_S = 1   // slider label tertiary <-> text color lerp (paced Box / Slowing Down)
const LABEL_DIM_OPACITY = 0.5   // label opacity in its tertiary state (1 when lit)
const LABEL_GLOW_MULT = 10      // lit label's primary-color glow strength (text-shadow blur px per layer)
const _labelColor = new THREE.Color()

function PaletteLerpDriver({ livePaletteRef, paletteLerpRef, paletteCycleIndexRef, wrapperRef, getLabelPhase, getHoldPhase }) {
  // Slider inhale/exhale labels: 0 = tertiary, 1 = text color (the phase to breathe now).
  const labelPRef = useRef({ inhale: 0, exhale: 0 })
  // Box Breathing's "hold" labels: 0 hidden -> 1 shown (lit), same timing as the labels.
  const holdPRef = useRef({ in: 0, out: 0 })
  useFrame((state, delta) => {
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
    // Buttons/sliders: primary color as an "r, g, b" triple so each element can
    // pick its own alpha via rgba(var(--live-primary-rgb), a).
    if (wrapperRef?.current) {
      const hex = live.primary.getHexString()
      wrapperRef.current.style.setProperty('--live-primary-rgb', `${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}`)
    }
    // Slider labels: tertiary, except the phase to breathe now in the paced
    // part of Box Breathing / Slowing Down, which eases to the text color
    // over LABEL_LERP_S (and back when the other phase begins).
    if (wrapperRef?.current) {
      const phase = getLabelPhase ? getLabelPhase() : null
      const lp = labelPRef.current
      const step = Math.min(delta, 0.1) / LABEL_LERP_S
      for (const key of ['inhale', 'exhale']) {
        const target = phase === key ? 1 : 0
        lp[key] = target > lp[key] ? Math.min(target, lp[key] + step) : Math.max(target, lp[key] - step)
        const k = THREE.MathUtils.smoothstep(lp[key], 0, 1)
        _labelColor.copy(live.tertiary).lerp(live.text, k)
        wrapperRef.current.style.setProperty(`--${key}-label-color`, '#' + _labelColor.getHexString())
        wrapperRef.current.style.setProperty(`--${key}-label-opacity`, String(THREE.MathUtils.lerp(LABEL_DIM_OPACITY, 1, k)))
        // "Emissive" for DOM text: a stacked primary-color glow that eases in with k.
        const g = LABEL_GLOW_MULT
        const rgb = `${Math.round(live.primary.r * 255)}, ${Math.round(live.primary.g * 255)}, ${Math.round(live.primary.b * 255)}`
        wrapperRef.current.style.setProperty(`--${key}-label-glow`, k < 0.001 ? 'none'
          : `0 0 ${g}px rgba(${rgb}, ${k.toFixed(3)}), 0 0 ${2 * g}px rgba(${rgb}, ${k.toFixed(3)}), 0 0 ${4 * g}px rgba(${rgb}, ${(0.75 * k).toFixed(3)})`)
      }
      wrapperRef.current.style.setProperty('--live-tertiary-color', '#' + live.tertiary.getHexString())
      // "hold" labels: fade in as their Hold starts, out with the partner label
      // as the next phase begins; shown in the lit label's look.
      const hold = getHoldPhase ? getHoldPhase() : null
      const hp = holdPRef.current
      for (const key of ['in', 'out']) {
        const target = hold === key ? 1 : 0
        hp[key] = target > hp[key] ? Math.min(target, hp[key] + step) : Math.max(target, hp[key] - step)
        wrapperRef.current.style.setProperty(`--hold-${key}-label-opacity`, String(THREE.MathUtils.smoothstep(hp[key], 0, 1)))
      }
      const g = LABEL_GLOW_MULT
      const rgb = `${Math.round(live.primary.r * 255)}, ${Math.round(live.primary.g * 255)}, ${Math.round(live.primary.b * 255)}`
      wrapperRef.current.style.setProperty('--hold-label-glow', `0 0 ${g}px rgba(${rgb}, 1), 0 0 ${2 * g}px rgba(${rgb}, 1), 0 0 ${4 * g}px rgba(${rgb}, 0.75)`)
    }
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

// Feeds the paced audio pair its 0 (exhale) -> 1 (inhale) value every frame,
// or null (silent) outside the app-paced part of Box Breathing / Slowing Down.
// Also rings a bell as each paced phase begins: the 3 s bell for Inhale/Exhale,
// the 4 s bell for Box Breathing's Holds (cut off as the next phase's bell rings).
function PaceAudioDriver({ audioRef, getPaceProgress, getBellPhase }) {
  const prevBellRef = useRef(null)
  useFrame(() => {
    audioRef.current.setPace(getPaceProgress())
    const phase = getBellPhase()
    if (phase === prevBellRef.current) return
    prevBellRef.current = phase
    if (phase === null) audioRef.current.stopBell()
    else {
      const kind = phase.split(':')[0]   // 'exhale:3' = the Balloon's 3rd Exhale bell
      audioRef.current.playBell(kind === 'inhale' || kind === 'exhale' ? BELL_INHALE_EXHALE : BELL_HOLD,
        kind === 'inhale' ? BELL_INHALE_GAIN : 1)
    }
  })
  return null
}

const PACED_CAPTION_BREATHS = 5
// Balloon (h) Box Breathing captions: shown for this many box cycles.
const BALLOON_CAPTION_CYCLES = 4
const BALLOON_CAPTION_FADE_MS = 300
const PACED_CAPTION_ALPHA = [1, 1, 1, 0.5, 0.15]   // per breath: last two fade out, like Box Breathing's ROUND_ALPHA

export default function App() {
  const leftVal = useRef(0)
  const audioRef = useRef(null)
  if (audioRef.current === null) audioRef.current = createAudioEngine()
  const audioGroupIndexRef = useRef(0)   // 5-breath cycles since Start, picks the audio group
  const rightVal = useRef(1)
  // Everything (visuals, tutorial text, breath recording) is driven by the
  // right slider for now; the left slider stays on screen and works but
  // drives nothing (reserved for audio later). breathRef/breathRawRef read the
  // right slider in the left slider's old convention (0 exhale -> 1 inhale),
  // so code written for the left slider can use them unchanged.
  const rightRawRef = useRef(1)
  const breathRef = useMemo(() => ({ get current() { return 1 - rightVal.current } }), [])
  const breathRawRef = useMemo(() => ({ get current() { return 1 - rightRawRef.current } }), [])
  // Attached to the experience screen's outer wrapper div -- PaletteLerpDriver
  // writes a CSS custom property here so the DOM overlay's text can track the
  // live palette (see navPillStyle/mode-caption below and TutorialText.jsx).
  const wrapperRef = useRef(null)

  const [screen, setScreen] = useState('selectMode')
  const [mode, setMode] = useState(null)
  const [modeKey, setModeKey] = useState(0)
  const [sliderResetKey, setSliderResetKey] = useState(0)   // bump to remount the sliders at full Exhale
  const [tutorialText, setTutorialText] = useState('')
  const [tutorialVisible, setTutorialVisible] = useState(false)
  const [tutorialOpacity, setTutorialOpacity] = useState(null)
  const [tutorialFadeMs, setTutorialFadeMs] = useState(2000)
  // Blank-background start: false = scene covered, sliders hidden (SCENE_REVEAL_MS fade when it turns true).
  const [sceneRevealed, setSceneRevealed] = useState(false)
  const [coverFading, setCoverFading] = useState(false)   // Tutorial: sliders stay live while the cover fades in
  const textFadeOutEndRef = useRef(0)   // performance.now() when the current fade-out finishes
  const [tutorialAtTop, setTutorialAtTop] = useState(false)   // mode explanation: shown up under the mode name
  const [shapeOption, setShapeOptionState] = useState(() => {
    let saved = localStorage.getItem('shapeOption') || 'd'
    // Rotating Rings (e) is hidden from Art Options; move anyone who last
    // picked it to the default so they aren't stuck on a shape with no card.
    if (saved === 'e') saved = 'd'
    // Space Ship (j) only works with Blow on the Mic.
    if (saved === 'j' && localStorage.getItem('sliderLayout') !== 'blow') saved = 'd'
    return ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].includes(saved) ? saved : 'a'
  })
  // Control Options (sliderLayout key kept): 'diagonal' = Double Sliders,
  // 'single' / 'touch' / 'tilt' / 'blow' drive the Diagonal sliders' thumbs
  // (useBreathControl). 'vertical' is hidden: move anyone on it to 'diagonal'.
  const [sliderLayout, setSliderLayoutState] = useState(() => {
    let saved = localStorage.getItem('sliderLayout') || 'diagonal'
    if (saved === 'vertical') saved = 'diagonal'
    return ['vertical', 'diagonal', 'single', 'touch', 'tilt', 'blow'].includes(saved) ? saved : 'diagonal'
  })
  const isDiagonal = sliderLayout !== 'vertical'
  // Tilt denied or no sensor: fall back to Double Sliders.
  const [tiltFailed, setTiltFailed] = useState(false)
  // Mic denied or missing (Blow on the Mic): same fallback.
  const [micFailed, setMicFailed] = useState(false)
  const breathControl = ['single', 'touch', 'tilt', 'blow'].includes(sliderLayout)
    && !(sliderLayout === 'tilt' && tiltFailed) && !(sliderLayout === 'blow' && micFailed) ? sliderLayout : null
  const [targetPace, setTargetPaceState] = useState(() => {
    const saved = localStorage.getItem('targetPace') || DEFAULT_TARGET_PACE
    return Object.keys(TARGET_PACES).includes(saved) ? saved : DEFAULT_TARGET_PACE
  })
  const [selectedMode, setSelectedModeState] = useState(() => {
    // Own Pace ('basic') is hidden from the picker: move anyone on it to Tutorial.
    const saved = localStorage.getItem('selectedMode') || 'tutorial'
    // Space Ship (j) runs only in the Tutorial for now.
    if (localStorage.getItem('shapeOption') === 'j' && localStorage.getItem('sliderLayout') === 'blow') return 'tutorial'
    return ['tutorial', 'timed', 'slowing', 'box'].includes(saved) ? saved : 'tutorial'
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

  // Passcode gate (see passcode.js). Entering the code resets everyone to the
  // testing defaults while RESET_ON_UNLOCK is on.
  const [unlocked, setUnlocked] = useState(false)
  const handleUnlock = useCallback(() => {
    if (RESET_ON_UNLOCK) {
      setSelectedMode(TESTING_DEFAULTS.selectedMode)
      setShapeOption(TESTING_DEFAULTS.shapeOption)
      setSliderLayout(TESTING_DEFAULTS.sliderLayout)
      setTargetPace(TESTING_DEFAULTS.targetPace)
    }
    // Typing the code is a user gesture: unlock audio and start the home loop.
    audioRef.current.unlock()
    audioRef.current.startHome()
    setUnlocked(true)
  }, [setSelectedMode, setShapeOption, setSliderLayout, setTargetPace])

  // Background is fully derived from the shape choice: Options D and E have
  // no visible Gates/rails, so they're the only ones that need an ambient
  // background as a pacing cue. A/B/C stay background-free.
  const backgroundOption = shapeOption === 'e' ? 'b' : shapeOption === 'd' ? 'rings' : 'none'

  const palette = PALETTES.teal
  const shapeRef = useRef(shapeOption)
  // Paper Airplane: the plane's rendered position (world x/y at z = 0),
  // written by MorphG, read by its cloud gates for collision.
  const planePosRef = useRef({ x: 0, y: 0 })
  // Blow on the Mic: 1 while the mic hears a blow (useBreathControl), read by
  // the Paper Airplane to glow brighter.
  const blowRef = useRef(0)
  // Input Test: { tilt, mic, blowing, v }, written by useBreathControl.
  const inputReadoutRef = useRef(null)
  // Mic check at the start of sessions that use the mic (see MicCheck.jsx).
  const [micCheckKey, setMicCheckKey] = useState(0)   // 0 = none
  const micCheckSeqRef = useRef(0)
  const micCheckStatusRef = useRef(null)
  const afterMicCheckRef = useRef(null)   // the mode's opening, run when the check ends
  // Balloon (h): BalloonCourseH's overrides for MorphH (mode 'follow' /
  // 'travel' / 'deflate', trip progress, bounce time; MorphH writes bottom)
  // and its user-gated pace (phase, bellSeq, inhaleDur, paced) for the bells,
  // labels and captions.
  const balloonStateRef = useRef({ mode: 'follow', travelP: 0, bounceStart: -Infinity, bottom: 0 })
  const balloonPaceRef = useRef({ paced: false, phase: null, bellSeq: 0, inhaleDur: 1 })
  // Space Ship (j): the ship's frame (written by SpaceshipBayJ, drawn by
  // MorphJ) and its pace phase, which the bells/labels follow.
  const shipStateRef = useRef({ y: 0, z: 0, alpha: 0, rev: 0, rock: 0, emit: 0, steer: false, seq: 0 })
  const shipPaceRef = useRef({ paced: false, phase: 'idle', inhaleDur: 1 })
  const balloonCaptionRef = useRef({ phase: null, cycles: 0 })
  shapeRef.current = shapeOption

  const lastMoveTime = useRef(0)
  const tutorialVisibleRef = useRef(false)
  const tutorialTimerRef = useRef(null)
  const introTimerRef = useRef(null)
  const introActiveRef = useRef(false)   // mode explanation showing / fading (tutorial not started yet)
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
  const diagRoundRef = useRef(1)   // current A1/A2 round (1..DIAG_ROUNDS)
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
  // Morphing Cube landscape (LandscapeB): which landscape new shapes use,
  // advanced by MorphB's 5-breath count at each palette change.
  const landscapeIndexRef = useRef(0)
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
    // Audio moves to its next group with the palette (breathAudio.js).
    audioGroupIndexRef.current += 1
    audioRef.current.setCycle(audioGroupIndexRef.current)
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
  const pacedCueStageRef = useRef('off')   // 'off' | 'captions' | 'done'
  const pacedBreathNumRef = useRef(0)
  const pacedCaptionRef = useRef(null)     // { start, mult, getDuration } read by TutorialText
  // Text D/E (D/E shapes) are timed like the Diagonal intro's Text B2: fade
  // in, hold for one left-slider breath cycle, fade out.
  const pacedTextStageRef = useRef('off')  // 'off' | 'D-pending' | 'D-hold' | 'E-pending' | 'E-hold'
  const pacedTextDirRef = useRef(0)
  const pacedTextExtremeRef = useRef(null)
  const pacedTextStrokesRef = useRef(0)
  const [pacedCaptionsOn, setPacedCaptionsOn] = useState(false)

  // 5-breath count tutorial: runs for the first two (slider-driven) count
  // cycles after the intro hand-off, driven by the Morph's breath events
  // (onBreathCountEvent). Box/Slowing then wait for the sliders at the
  // bottom and call pacedStartFnRef to start the paced art on cycle 3.
  const countTutorialRef = useRef({ active: false, mode: null })
  const pacedStartFnRef = useRef(null)

  // Guided Breathing: Tutorial mode. part: 'off' | 'screen' (a Part text +
  // Continue) | 'rounds' (Inhale/Exhale x3) | 'practice' | 'count' (Part 2's
  // 10 breaths) | 'paced'. screen: which Part text is up. step/inhales:
  // practice progress. stepText: the text the current step shows (restored
  // after the reminder). dir/extreme: inhale/exhale-start detection.
  const modeRef = useRef(null)
  modeRef.current = mode
  const newTutorialState = () => ({ part: 'off', screen: null, step: null, inhales: 0, stepText: null, reminding: false, dir: 0, extreme: null })
  const tutorialRef = useRef(newTutorialState())
  // Tutorial: sliders ignore touches while the scene is covered (Part screens).
  const slidersDisabledRef = useRef(false)
  const slidersLive = sceneRevealed || coverFading
  slidersDisabledRef.current = usesScreens(mode) && !slidersLive
  const tutorialTimersRef = useRef([])
  const [continueVisible, setContinueVisible] = useState(false)
  const [continuePressed, setContinuePressed] = useState(false)
  const [tutorialArt, setTutorialArt] = useState('morph')   // 'morph' = Morph only, 'background' = plus the art option's landscape/background
  const [tutorialPaced, setTutorialPaced] = useState(false)  // paced gates/art mounted (Part 3 end)
  const [tutorialSub, setTutorialSub] = useState(null)       // countdown line under the text
  const [tutorialSubVisible, setTutorialSubVisible] = useState(false)
  const [tutorialSubFadeMs, setTutorialSubFadeMs] = useState(COUNTDOWN_FADE_MS)
  const continueRef = useRef(null)
  const [continueHeight, setContinueHeight] = useState(67)
  const [tutorialScreenId, setTutorialScreenId] = useState(null)   // the screen showing (or last shown) with Continue
  const [skipPressed, setSkipPressed] = useState(false)
  const skipRef = useRef(null)
  const [skipHeight, setSkipHeight] = useState(55)

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
    const isAmbient = isAmbientArt(shapeRef.current)
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

  const showSlowingTextD = useCallback(() => {
    const text = isAmbientArt(shapeRef.current) ? TEXTS.slowingTextDAmbient : TEXTS.slowingTextD
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = text
    setTutorialText(text)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
  }, [])

  const showSlowingTextE = useCallback(() => {
    const text = isAmbientArt(shapeRef.current) ? TEXTS.slowingTextEAmbient : TEXTS.slowingTextE
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = text
    setTutorialText(text)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
  }, [])

  // Slowing Down (D/E): show Text D or E the way the Diagonal intro shows
  // Text B2 -- 1s fade-in, then hold for one left-slider breath cycle.
  const showPacedText = useCallback((which) => {
    const isCube = usesCubeFlow(shapeRef.current)
    const text = which === 'D'
      ? (isCube ? TEXTS.slowingTextDCube : TEXTS.slowingTextDAmbient)
      : (isCube ? TEXTS.slowingTextECube : TEXTS.slowingTextEAmbient)
    pacedTextStageRef.current = which + '-pending'
    clearTimeout(tutorialTimerRef.current)
    awaitingMovementRef.current = false
    currentMainTextRef.current = text
    setTutorialText(text)
    setTutorialFadeMs(DIAG_FADE_IN_MS)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    tutorialTimerRef.current = setTimeout(() => {
      pacedTextStageRef.current = which + '-hold'
      pacedTextStrokesRef.current = 0
      pacedTextDirRef.current = 0
      pacedTextExtremeRef.current = breathRef.current
    }, DIAG_FADE_IN_MS)
  }, [])

  // Called from setLeft: counts left-slider strokes during a D/E hold (same
  // deadband reversal counting as the Diagonal B1/B2 hold); after one breath
  // cycle, fades the text out over 2s and moves on (D -> E -> wait for the
  // sliders at the bottom, see startPacedArt).
  const updatePacedText = useCallback((v) => {
    const stage = pacedTextStageRef.current
    if (stage !== 'D-hold' && stage !== 'E-hold') return
    const delta = v - pacedTextExtremeRef.current
    if (pacedTextDirRef.current === 0) {
      if (delta < -DIAG_DEADBAND) { pacedTextDirRef.current = -1; pacedTextExtremeRef.current = v; pacedTextStrokesRef.current = 1 }
      else if (delta > DIAG_DEADBAND) { pacedTextDirRef.current = 1; pacedTextExtremeRef.current = v; pacedTextStrokesRef.current = 1 }
      return
    }
    if (pacedTextDirRef.current === 1 && delta < -DIAG_DEADBAND) {
      pacedTextDirRef.current = -1; pacedTextExtremeRef.current = v; pacedTextStrokesRef.current++
    } else if (pacedTextDirRef.current === -1 && delta > DIAG_DEADBAND) {
      pacedTextDirRef.current = 1; pacedTextExtremeRef.current = v; pacedTextStrokesRef.current++
    } else if (pacedTextDirRef.current === 1 && v > pacedTextExtremeRef.current) {
      pacedTextExtremeRef.current = v
    } else if (pacedTextDirRef.current === -1 && v < pacedTextExtremeRef.current) {
      pacedTextExtremeRef.current = v
    }
    if (pacedTextStrokesRef.current < DIAG_CYCLE_STROKES) return

    const wasD = stage === 'D-hold'
    pacedTextStageRef.current = wasD ? 'D-fadeout' : 'E-fadeout'
    clearTimeout(tutorialTimerRef.current)
    setTutorialFadeMs(DIAG_FADE_OUT_MS)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    tutorialTimerRef.current = setTimeout(() => {
      if (wasD) {
        showPacedText('E')
      } else {
        pacedTextStageRef.current = 'off'
        setTutorialFadeMs(FADE_TRANSITION_MS)
        pacedWaitForBottomRef.current = true
      }
    }, DIAG_FADE_OUT_MS)
  }, [showPacedText])

  const handleSlowingRecordingDone = useCallback(() => {
    // Shape B (Morphing Cube) follows the same tutorial as D/E.
    if (isAmbientArt(shapeRef.current) || usesCubeFlow(shapeRef.current)) {
      // Art waits for the count tutorial's third cycle (see startPacedArt);
      // hold the ramp at the recorded pace. Texts C/D/E are breath-driven
      // (handleBreathCountEvent).
      phase2StartRef.current = Infinity
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
    tutorialTimerRef.current = setTimeout(() => {
      showSlowingTextE()
    }, FADE_TRANSITION_MS)
  }, [showSlowingTextE])

  // Slowing Down (D/E): sliders reached the bottom after Text D -- start the
  // paced art on an Inhale (GatesHeadless*'s startOnInhale) and the ramp.
  const startPacedArt = useCallback(() => {
    // Wait (for the next time the sliders reach the bottom) until recording
    // has produced a starting pace.
    if (phaseRef.current !== 'gates') return
    pacedWaitForBottomRef.current = false
    breathPhaseRef.current = 'exhale'
    phase2StartRef.current = Date.now() / 1000
    pacedCueStageRef.current = 'captions'
    pacedBreathNumRef.current = 0
    // Counting is already on (count tutorial) and stays on the slider: every
    // Inhale the user takes adds a piece, in sync with the pace or not.
    gatesEnabledRef.current = true
  }, [])

  // Box Breathing: count tutorial's third cycle -- start the gates/pace art
  // on the first Inhale with the Inhale/Hold/Exhale/Hold captions.
  const startBoxArt = useCallback(() => {
    pacedWaitForBottomRef.current = false
    bbCycleRef.current = 0
    bbTutorialActiveRef.current = true
    boxCaptionsStartedRef.current = true
    gatesEnabledRef.current = true
    boxClockStartRef.current = performance.now()
    boxCaptionIndexRef.current = 0
    // Counting is already on and stays on the slider (see startPacedArt).
    clearTimeout(tutorialTimerRef.current)
    setTutorialFadeMs(FADE_TRANSITION_MS)
    currentMainTextRef.current = TEXTS.boxInhale
    setTutorialText(TEXTS.boxInhale)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
  }, [])

  // Which slider label is lit (text color) in the paced part of the session:
  // Box Breathing follows the caption clock (Inhale + Hold-in -> 'inhale',
  // Exhale + Hold-out -> 'exhale'); Slowing Down follows the paced art's
  // breathPhaseRef (the phase to breathe now). null = both tertiary.
  // Box Breathing caption clock: phase index (0 Inhale, 1 Hold-in, 2 Exhale,
  // 3 Hold-out) and progress 0-1 through it, or null before the paced part.
  const boxPhaseNow = useCallback(() => {
    if (!boxCaptionsStartedRef.current) return null
    const interval = Math.max(0.05, spawnIntervalRef.current)
    const elapsed = Math.max(0, (performance.now() - boxClockStartRef.current) / 1000)
    const inCycle = elapsed % (4 * interval)
    const index = Math.floor(inCycle / interval)
    return { index, t: (inCycle - index * interval) / interval }
  }, [])

  // Slowing Down's paced phase ('inhale'/'exhale'), or null before the paced art.
  const slowingPhaseNow = useCallback(() => {
    if (!gatesEnabledRef.current || pacedCueStageRef.current === 'off') return null
    return breathPhaseRef.current === 'inhale' || breathPhaseRef.current === 'exhale' ? breathPhaseRef.current : null
  }, [])

  // Balloon (h) and Space Ship (j): the course owns the pace (the user's
  // exhale starts each trip), so the bells/labels/holds follow its phase
  // instead of the clocks. The ship's phases map to 'inhale' / 'exhale'.
  const balloonPhaseNow = useCallback(() => {
    if (shapeRef.current === 'j') {
      const p = shipPaceRef.current
      if (!p.paced || p.phase === 'idle') return null
      return p.phase === 'inhale' ? 'inhale' : 'exhale'
    }
    if (shapeRef.current !== 'h') return undefined
    const p = balloonPaceRef.current
    return p.paced ? p.phase : null
  }, [])

  const getLabelPhase = useCallback(() => {
    const bp = balloonPhaseNow()
    if (bp !== undefined && mode !== 'basic') {
      if (bp === null) return null
      return bp === 'inhale' || bp === 'hold-in' || bp === 'retry' ? 'inhale' : 'exhale'
    }
    if (mode === 'box') {
      const p = boxPhaseNow()
      return p === null ? null : p.index < 2 ? 'inhale' : 'exhale'
    }
    if (mode === 'slowing' || mode === 'tutorial') return slowingPhaseNow()
    return null
  }, [mode, boxPhaseNow, slowingPhaseNow, balloonPhaseNow])

  // Box Breathing's "hold" slider labels: 'in' during Hold-in, 'out' during Hold-out.
  const getHoldPhase = useCallback(() => {
    if (mode !== 'box') return null
    const bp = balloonPhaseNow()
    if (bp !== undefined) return bp === 'hold-in' ? 'in' : bp === 'hold-out' ? 'out' : null
    const p = boxPhaseNow()
    return p === null ? null : p.index === 1 ? 'in' : p.index === 3 ? 'out' : null
  }, [mode, boxPhaseNow, balloonPhaseNow])

  // Blow on the Mic: how fast quiet rises (v/s). Once a pace runs, quiet
  // rises at the pace's inhale speed (holding is the user's touch, not
  // automatic). null = no pace yet.
  const getQuietRate = useCallback(() => {
    const bp = balloonPhaseNow()
    if (bp !== undefined && mode !== 'basic') return bp === null ? null : 1 / Math.max(0.05, (shapeRef.current === 'j' ? shipPaceRef : balloonPaceRef).current.inhaleDur)
    if (mode === 'box') {
      if (boxPhaseNow() === null) return null
      return 1 / Math.max(0.05, spawnIntervalRef.current)
    }
    if (mode === 'slowing' || mode === 'tutorial') {
      if (slowingPhaseNow() === null) return null
      const { inhaleDuration } = computePhaseDurations(spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef)
      return 1 / Math.max(0.05, inhaleDuration)
    }
    return null
  }, [mode, boxPhaseNow, slowingPhaseNow, balloonPhaseNow])

  // Which paced phase's bell should be ringing: Box 'inhale'/'hold'/'exhale'/
  // 'hold-out' from the caption clock; Slowing Down 'inhale'/'exhale', from the
  // first paced Inhale on (skips the 'exhale' startPacedArt sets, like the
  // captions do). null = no bells.
  const bellSawInhaleRef = useRef(false)
  const getBellPhase = useCallback(() => {
    const bp = balloonPhaseNow()
    if (bp !== undefined && mode !== 'basic') {
      // The Exhale bell's key carries its count, so a retry rings it again.
      if (bp === null) return null
      if (bp === 'inhale') return 'inhale'
      if (bp === 'hold-in') return 'hold'
      if (bp === 'hold-out') return 'hold-out'
      if (shapeRef.current === 'j') return 'exhale'
      return `exhale:${balloonPaceRef.current.bellSeq}`
    }
    if (mode === 'box') {
      const p = boxPhaseNow()
      return p === null ? null : ['inhale', 'hold', 'exhale', 'hold-out'][p.index]
    }
    if (mode === 'slowing' || mode === 'tutorial') {
      const phase = slowingPhaseNow()
      if (phase === null) { bellSawInhaleRef.current = false; return null }
      if (phase === 'inhale') bellSawInhaleRef.current = true
      return bellSawInhaleRef.current ? phase : null
    }
    return null
  }, [mode, boxPhaseNow, slowingPhaseNow, balloonPhaseNow])

  // Paced audio pair: 0 exhale -> 1 inhale following the app's paced breath
  // (Box: eased over Inhale/Exhale, held through the Holds; Slowing Down:
  // eased over each paced phase's duration), or null = silent.
  const paceAudioPhaseRef = useRef({ phase: null, start: 0 })
  const getPaceProgress = useCallback(() => {
    if (PACE_AUDIO_FROM_RIGHT_SLIDER) return THREE.MathUtils.smoothstep(1 - rightVal.current, 0, 1)
    if (balloonPhaseNow() !== undefined) return null   // Balloon: no paced pair (it's off anyway)
    if (mode === 'box') {
      const p = boxPhaseNow()
      if (p === null) return null
      const e = THREE.MathUtils.smoothstep(p.t, 0, 1)
      return [e, 1, 1 - e, 0][p.index]
    }
    if (mode === 'slowing' || mode === 'tutorial') {
      const phase = slowingPhaseNow()
      const track = paceAudioPhaseRef.current
      if (phase === null) { track.phase = null; return null }
      const now = performance.now() / 1000
      if (phase !== track.phase) { track.phase = phase; track.start = now }
      const d = computePhaseDurations(spawnIntervalRef, inhaleSecondsRef, exhaleSecondsRef)
      const dur = Math.max(0.05, phase === 'inhale' ? d.inhaleDuration : d.exhaleDuration)
      const e = THREE.MathUtils.smoothstep((now - track.start) / dur, 0, 1)
      return phase === 'inhale' ? e : 1 - e
    }
    return null
  }, [mode, boxPhaseNow, slowingPhaseNow, balloonPhaseNow])

  // Fade the current text out (or wait for a fade-out already running),
  // then swap in `text` and fade it in -- the words never change while visible.
  const fadeToText = useCallback((text, fadeMs = COUNT_FADE_MS) => {
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = text
    const fadeIn = () => {
      setTutorialOpacity(null)
      setTutorialFadeMs(fadeMs)
      setTutorialText(text)
      setTutorialVisible(true)
      tutorialVisibleRef.current = true
    }
    let wait = Math.max(0, textFadeOutEndRef.current - performance.now())
    if (tutorialVisibleRef.current) {
      setTutorialFadeMs(fadeMs)
      setTutorialVisible(false)
      tutorialVisibleRef.current = false
      textFadeOutEndRef.current = performance.now() + fadeMs
      wait = fadeMs
    }
    if (wait > 0) tutorialTimerRef.current = setTimeout(fadeIn, wait)
    else fadeIn()
  }, [])

  const showCountText = useCallback((text) => {
    awaitingMovementRef.current = false
    fadeToText(text)
  }, [fadeToText])

  const hideCountText = useCallback(() => {
    clearTimeout(tutorialTimerRef.current)
    awaitingMovementRef.current = false
    if (!tutorialVisibleRef.current) return
    setTutorialFadeMs(COUNT_FADE_MS)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    textFadeOutEndRef.current = performance.now() + COUNT_FADE_MS
  }, [])

  // Balloon (h): the door closed on a missed exhale -- "Try inhale again..."
  // fades in, and out as the user starts the next inhale.
  const handleBalloonRetryText = useCallback((on) => {
    if (on) fadeToText(TEXTS.balloonRetry)
    else if (currentMainTextRef.current === TEXTS.balloonRetry) hideCountText()
  }, [fadeToText, hideCountText])

  // Space Ship (j): its coaching text (SpaceshipBayJ decides when).
  const handleShipText = useCallback((text) => {
    if (text) fadeToText(text)
    else if (SHIP_TEXTS.includes(currentMainTextRef.current)) hideCountText()
  }, [fadeToText, hideCountText])

  // ---- Guided Breathing: Tutorial mode ----
  const tutorialLater = useCallback((fn, ms) => {
    tutorialTimersRef.current.push(setTimeout(fn, ms))
  }, [])
  const clearTutorialTimers = useCallback(() => {
    tutorialTimersRef.current.forEach(clearTimeout)
    tutorialTimersRef.current = []
  }, [])

  // A Part text at the top (the mode explanation's spot) with the Continue button.
  const showTutorialScreen = useCallback((screenId, text) => {
    const t = tutorialRef.current
    t.part = 'screen'
    t.screen = screenId
    t.reminding = false
    clearTimeout(tutorialTimerRef.current)
    setTutorialScreenId(screenId)
    setTutorialAtTop(true)
    setTutorialOpacity(null)
    setTutorialFadeMs(TUTORIAL_SCREEN_FADE_MS)
    currentMainTextRef.current = text
    setTutorialText(text)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    setContinueVisible(true)
  }, [])

  // Fade the Part text and Continue out, then run next.
  const leaveTutorialScreen = useCallback((next) => {
    tutorialRef.current.screen = null
    setContinueVisible(false)
    setTutorialFadeMs(TUTORIAL_SCREEN_FADE_MS)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    tutorialLater(() => { setTutorialAtTop(false); next() }, TUTORIAL_SCREEN_FADE_MS)
  }, [tutorialLater])

  // Fade everything back to the blank screen, then show the next Part text.
  const tutorialGoBlank = useCallback((screenId, text) => {
    const t = tutorialRef.current
    t.part = 'blank'
    t.reminding = false
    t.stepText = null
    hideCountText()
    setSceneRevealed(false)
    setCoverFading(true)   // sliders keep working until the cover is fully up
    audioRef.current.setMuted(true, SCENE_REVEAL_MS / 1000)   // silent while the Part text shows
    tutorialLater(() => {
      // Fully covered now: put the sliders back at full Exhale so they fade
      // back in from the default spot, not where they froze.
      setCoverFading(false)
      leftRawRef.current = 0
      rightRawRef.current = 1
      setSliderResetKey(k => k + 1)
      showTutorialScreen(screenId, text)
    }, SCENE_REVEAL_MS)
  }, [hideCountText, showTutorialScreen, tutorialLater])

  // The text the current step shows (null = none); held back while the reminder is up.
  const setTutorialStepText = useCallback((text) => {
    const t = tutorialRef.current
    t.stepText = text
    if (t.reminding) return
    if (text) showCountText(text)
    else hideCountText()
  }, [showCountText, hideCountText])

  // After the 3 Inhale/Exhale rounds (sliders at the bottom).
  const startTutorialPractice = useCallback(() => {
    diagStageRef.current = 'done'
    setTutorialOpacity(null)
    const t = tutorialRef.current
    Object.assign(t, { part: 'practice', step: 'gotIt', inhales: 0, reminding: false, dir: -1, extreme: breathRef.current })
    lastMoveTime.current = Date.now()
    setTutorialStepText(TUTORIAL.gotIt)
  }, [setTutorialStepText])

  // Practice steps, advanced on inhale starts / exhale starts (setRight).
  const updateTutorialPractice = useCallback((b) => {
    const t = tutorialRef.current
    if (t.part !== 'practice') return
    if (t.extreme === null) { t.extreme = b; return }
    let event = null
    if (t.dir !== 1 && b - t.extreme > DIAG_DEADBAND) { t.dir = 1; t.extreme = b; event = 'inhale' }
    else if (t.dir !== -1 && b - t.extreme < -DIAG_DEADBAND) { t.dir = -1; t.extreme = b; event = 'exhale' }
    else if (t.dir === 1 && b > t.extreme) t.extreme = b
    else if (t.dir === -1 && b < t.extreme) t.extreme = b
    if (!event) return
    if (t.step === 'gotIt' && event === 'inhale') {
      // One inhale + exhale on "You got it!", then free breaths.
      if (++t.inhales === 2) { t.step = 'free'; t.inhales = 0; setTutorialStepText(null) }
    } else if (t.step === 'free' && event === 'inhale') {
      if (++t.inhales === PRACTICE_FREE_BREATHS) { t.step = 'notice'; setTutorialStepText(TUTORIAL.notice) }
    } else if (t.step === 'notice' && event === 'exhale') {
      t.step = 'after'; t.inhales = 0; setTutorialStepText(null)
    } else if (t.step === 'after' && event === 'inhale') {
      // The "Notice" breath ends on the first inhale start, then PRACTICE_AFTER_BREATHS more.
      if (++t.inhales === PRACTICE_AFTER_BREATHS + 1) tutorialGoBlank('part2', TUTORIAL.part2)
    }
  }, [setTutorialStepText, tutorialGoBlank])

  // "Relax and prepare to inhale." with a countdown on the sub line: 3, 2, 1;
  // the text fades out during "1". onStart runs as "1" ends (the first paced
  // Inhale and bell); returns that time (ms from now). withInhaleWord (Tutorial,
  // Slowing Down) then shows "Inhale" on the countdown line for
  // COUNTDOWN_START_MS; Box Breathing has its own Inhale caption instead.
  const runPreparedStart = useCallback((withInhaleWord, onStart) => {
    setTutorialSub('')
    setTutorialSubVisible(false)
    setTutorialSubFadeMs(COUNTDOWN_FADE_MS)
    currentMainTextRef.current = TUTORIAL.prepare
    setTutorialFadeMs(COUNT_FADE_MS)
    setTutorialText(TUTORIAL.prepare)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    const startAt = TUTORIAL_PREPARE_MS + (TUTORIAL.countdown.length - 1) * COUNTDOWN_STEP_MS
    const words = withInhaleWord ? TUTORIAL.countdown : TUTORIAL.countdown.slice(0, -1)
    words.forEach((word, i) => {
      const at = TUTORIAL_PREPARE_MS + i * COUNTDOWN_STEP_MS
      tutorialLater(() => { setTutorialSub(word); setTutorialSubVisible(true) }, at)
      if (at < startAt) tutorialLater(() => setTutorialSubVisible(false), at + COUNTDOWN_STEP_MS - COUNTDOWN_FADE_MS)
    })
    tutorialLater(() => { currentMainTextRef.current = ''; hideCountText() }, startAt - COUNT_FADE_MS)
    if (withInhaleWord) {
      tutorialLater(() => {
        setTutorialSubFadeMs(COUNT_FADE_MS)
        setTutorialSubVisible(false)
      }, startAt + COUNTDOWN_START_MS)
      tutorialLater(() => setTutorialSub(null), startAt + COUNTDOWN_START_MS + COUNT_FADE_MS)
    }
    tutorialLater(onStart, startAt)
    return startAt
  }, [tutorialLater, hideCountText])

  // Fade the scene back in (and the audio) after a screen.
  const revealAfterScreen = useCallback(() => {
    setSceneRevealed(true)
    audioRef.current.setMuted(false, SCENE_REVEAL_MS / 1000)
  }, [])

  // Part 3's last screen: fade in the scene with the paced 6-6 art ready,
  // "Relax and prepare to inhale.", then 3, 2, 1 and "Inhale" exactly as the
  // first paced Inhale starts (gates enabled, first bell). showDone false
  // (Skip Tutorial) leaves out the closing "Good job!" text.
  const startTutorialPaced = useCallback(({ showDone = true } = {}) => {
    const pace = TARGET_PACES['6-6']
    spawnIntervalRef.current = pace.inhale + pace.exhale
    inhaleSecondsRef.current = pace.inhale
    exhaleSecondsRef.current = pace.exhale
    setTutorialPaced(true)
    leaveTutorialScreen(() => {
      tutorialRef.current.part = 'paced'
      setSceneRevealed(true)
      audioRef.current.setMuted(false, SCENE_REVEAL_MS / 1000)
      const inhaleAt = runPreparedStart(true, () => {
        // Same start as Slowing Down's paced art, without its captions.
        breathPhaseRef.current = 'exhale'
        pacedCueStageRef.current = 'done'
        gatesEnabledRef.current = true
      })
      if (!showDone) return
      tutorialLater(() => showCountText(TUTORIAL.done), inhaleAt + TUTORIAL_DONE_AFTER_MS)
      tutorialLater(() => {
        currentMainTextRef.current = ''
        hideCountText()
      }, inhaleAt + TUTORIAL_DONE_AFTER_MS + TUTORIAL_DONE_SHOW_MS)
    })
  }, [leaveTutorialScreen, tutorialLater, runPreparedStart, showCountText, hideCountText])

  // Skip Tutorial (Part 1 and 2 screens): straight to Part 3's paced start,
  // with the full art and counting on as after Part 2, and no closing text.
  const handleTutorialSkip = useCallback(() => {
    stageRef.current = 'done'
    diagStageRef.current = 'done'
    setTutorialArt('background')
    breathCountingEnabledRef.current = true
    startTutorialPaced({ showDone: false })
  }, [startTutorialPaced])

  const handleTutorialContinue = useCallback(() => {
    const screenId = tutorialRef.current.screen
    if (screenId === 'part1') {
      leaveTutorialScreen(() => {
        // Inhale/Exhale rounds (updateDiagonalSequence): "Inhale and..." fades
        // in, then the sliders and Morph fade in.
        const t = tutorialRef.current
        t.part = 'rounds'
        stageRef.current = 'done'
        diagRoundRef.current = 1
        diagDirectionRef.current = 0
        diagExtremeRef.current = null
        diagReversalCountRef.current = 0
        currentMainTextRef.current = TUTORIAL.inhaleUp
        setTutorialText(TUTORIAL.inhaleUp)
        setTutorialFadeMs(A1_FADE_IN_MS)
        setTutorialOpacity(null)
        setTutorialVisible(true)
        tutorialVisibleRef.current = true
        diagStageRef.current = 'A1-appear'
        // Sliders and Morph follow the text in, TUTORIAL_REVEAL_LAG_MS behind.
        tutorialLater(() => setSceneRevealed(true), TUTORIAL_REVEAL_LAG_MS)
        tutorialLater(() => { diagStageRef.current = 'A1' }, A1_FADE_IN_MS)
      })
    } else if (screenId === 'part2') {
      setTutorialArt('background')   // mounts under the cover, fades in with the scene
      leaveTutorialScreen(() => {
        tutorialRef.current.part = 'count'
        lastMoveTime.current = Date.now()
        setSceneRevealed(true)
        audioRef.current.setMuted(false, SCENE_REVEAL_MS / 1000)
        breathCountingEnabledRef.current = true
      })
    } else if (screenId === 'part3') {
      // Space Ship: no closing text (its inhale coaching keeps going).
      startTutorialPaced({ showDone: shapeRef.current !== 'j' })
    } else if (screenId === 'box') {
      // Box Breathing: countdown, then the paced art and captions.
      leaveTutorialScreen(() => {
        tutorialRef.current.part = 'paced'
        revealAfterScreen()
        breathCountingEnabledRef.current = true
        runPreparedStart(false, () => { setTutorialSub(null); startBoxArt() })
      })
    } else if (screenId === 'slowing1') {
      // Slowing Down Part 1: breathe freely while SlowingDownController records
      // the pace (handleRecordingReady goes blank to Part 2).
      leaveTutorialScreen(() => {
        tutorialRef.current.part = 'record'
        lastMoveTime.current = Date.now()
        revealAfterScreen()
        breathCountingEnabledRef.current = true
        recordingEnabledRef.current = true
        setTutorialStepText(MODE_SCREENS.slowingRecord)
      })
    } else if (screenId === 'slowing2') {
      // Slowing Down Part 2: countdown, then the paced art at the recorded
      // pace and the ramp, without captions (bells and labels only).
      leaveTutorialScreen(() => {
        tutorialRef.current.part = 'paced'
        revealAfterScreen()
        runPreparedStart(true, () => {
          startPacedArt()
          pacedCueStageRef.current = 'done'
        })
      })
    }
  }, [leaveTutorialScreen, showTutorialScreen, startTutorialPaced, tutorialLater, revealAfterScreen, runPreparedStart, startBoxArt, startPacedArt, setTutorialStepText])

  // Slowing Down: recording done. From Part 1, hold the ramp at the recorded
  // pace and go blank to Part 2.
  const handleRecordingReady = useCallback(() => {
    if (tutorialRef.current.part !== 'record') { handleSlowingRecordingDone(); return }
    phase2StartRef.current = Infinity
    tutorialGoBlank('slowing2', MODE_SCREENS.slowing2)
  }, [handleSlowingRecordingDone, tutorialGoBlank])

  // "Remember to move the sliders..." after TUTORIAL_REMIND_MS still (Tutorial
  // Parts 1 and 2, Slowing Down's recording).
  useEffect(() => {
    if (!usesScreens(mode)) return
    const id = setInterval(() => {
      const t = tutorialRef.current
      if ((t.part !== 'practice' && t.part !== 'count' && t.part !== 'record') || t.reminding) return
      if (Date.now() - lastMoveTime.current < TUTORIAL_REMIND_MS) return
      t.reminding = true
      showCountText(TUTORIAL.remember)
    }, 500)
    return () => clearInterval(id)
  }, [mode, showCountText])

  // Breath events from the Morph's 5-breath counter: 'breath' as piece n
  // (1-5) of count cycle `cycle` (0-based) starts to appear, 'cycleDone' as
  // a cycle's pieces go away (breath 5's Exhale). Each text shows on its
  // breath and fades out on the next one.
  const handleBreathCountEvent = useCallback((type, cycle, n) => {
    // Tutorial Part 2: after 10 breaths (2 count cycles), on to Part 3.
    if (tutorialRef.current.part === 'count') {
      if (type === 'cycleDone' && cycle === 1) tutorialGoBlank('part3', TUTORIAL.part3)
      return
    }
    // Count tutorial (Own Pace; Box/Slowing open with screens instead).
    const ct = countTutorialRef.current
    if (!ct.active || type === 'cycleDone') return
    if (cycle === 0) {
      if (n === 1) showCountText(TEXTS.countEachBreath)
      else if (n === 2) hideCountText()
      else if (n === 3) showCountText(TEXTS.countColors)
      else if (n === 4) hideCountText()
      else if (n === 5) showCountText(TEXTS.countResets)
    } else if (cycle === 1) {
      if (n === 1) showCountText(TEXTS.countNewCycle)
      else {
        // The tutorial ends with the new-cycle text.
        hideCountText()
        ct.active = false
      }
    }
  }, [showCountText, hideCountText, tutorialGoBlank])

  const handlePacedPhase = useCallback((phase) => {
    const stage = pacedCueStageRef.current
    if (phase === 'inhale') pacedBreathNumRef.current++
    const n = pacedBreathNumRef.current
    if (stage === 'captions') {
      if (n === 0) return
      if (n > PACED_CAPTION_BREATHS) {
        // Captions end (already faded out). If the user goes still, idle
        // re-show brings back Text E ("Keep your breathing...").
        pacedCueStageRef.current = 'done'
        pacedCaptionRef.current = null
        setPacedCaptionsOn(false)
        clearTimeout(tutorialTimerRef.current)
        setTutorialVisible(false)
        tutorialVisibleRef.current = false
        currentMainTextRef.current = ''
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
  }, [])

  const handleSlowingTextEDone = useCallback(() => {
    clearTimeout(tutorialTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
  }, [])

  const beginDiagonalHold = useCallback((seedV) => {
    diagReversalCountRef.current = 0
    diagDirectionRef.current = 0
    diagExtremeRef.current = seedV
  }, [])

  // B2/B3: fade in over DIAG_FADE_IN_MS, then hold for one breath cycle
  // (updateDiagonalSequence's '<step>-hold').
  const showDiagonalStep = useCallback((step, text) => {
    diagStageRef.current = step + '-hold-pending'
    currentMainTextRef.current = text
    setTutorialOpacity(null)
    setTutorialText(text)
    setTutorialFadeMs(DIAG_FADE_IN_MS)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    clearTimeout(tutorialTimerRef.current)
    tutorialTimerRef.current = setTimeout(() => {
      diagStageRef.current = step + '-hold'
      beginDiagonalHold(breathRef.current)
    }, DIAG_FADE_IN_MS)
  }, [beginDiagonalHold])
  const showDiagonalB2 = useCallback(() => showDiagonalStep('B2', TEXT_B2_DIAGONAL), [showDiagonalStep])
  // "Now the art will change with each breath." -- last step before the count
  // (both layouts); its fade-out hands off to the count (finishDiagonalSequence).
  const showB3 = useCallback(() => showDiagonalStep('B3', TEXT_B3), [showDiagonalStep])

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
      showB3()   // then the count hand-off (finishDiagonalSequence)
    }, FADE_TRANSITION_MS)
  }, [showB3])

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

  const finishDiagonalSequence = useCallback(() => {
    diagStageRef.current = 'B3-fadeout'
    clearTimeout(tutorialTimerRef.current)
    setTutorialFadeMs(DIAG_FADE_OUT_MS)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    tutorialTimerRef.current = setTimeout(() => {
      diagStageRef.current = 'done'
      if (introStartsCountingRef.current) breathCountingEnabledRef.current = true
      if (countTutorialRef.current.mode !== 'timed') countTutorialRef.current.active = true
      if (pendingGatesFnRef.current !== null) {
        const fn = pendingGatesFnRef.current
        pendingGatesFnRef.current = null
        fn()
      }
    }, DIAG_FADE_OUT_MS)
  }, [])

  // Diagonal-slider-layout-only tutorial sequence: continuous, left-slider-
  // position-driven fades for A1/A2, then timed fade-in + 1-breath-cycle-hold
  // + timed fade-out for B1/B2. Runs entirely off setLeft (no useFrame needed,
  // consistent with the rest of App.jsx's event-driven tutorial state).
  // Next up/down round: A1 fades back in, then tracks 1 - v again ('A1').
  const showA1Again = useCallback(() => {
    diagRoundRef.current++
    diagStageRef.current = 'A1-reappear'
    setTutorialOpacity(null)
    const text = modeRef.current === 'tutorial' ? TUTORIAL.inhaleUp : TEXT_A1_DIAGONAL
    currentMainTextRef.current = text
    setTutorialText(text)
    setTutorialFadeMs(DIAG_FADE_IN_MS)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    clearTimeout(tutorialTimerRef.current)
    tutorialTimerRef.current = setTimeout(() => {
      diagStageRef.current = 'A1'
    }, DIAG_FADE_IN_MS)
  }, [])

  const updateDiagonalSequence = useCallback((v) => {
    const stage = diagStageRef.current
    if (stage === 'A1') {
      setTutorialOpacity(1 - v)
      if (v >= 1 - DIAG_EDGE_THRESHOLD) {
        diagStageRef.current = 'A2-appear'
        setTutorialOpacity(null)
        const text = modeRef.current === 'tutorial' ? TUTORIAL.exhaleDown : TEXT_A2_DIAGONAL
        currentMainTextRef.current = text
        setTutorialText(text)
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
        // Order: round 1 -> B1 -> rounds 2..DIAG_ROUNDS -> B2 -> B3.
        // Tutorial mode: the rounds back to back, then practice (no B texts).
        if (modeRef.current === 'tutorial') {
          if (diagRoundRef.current < DIAG_ROUNDS) showA1Again()
          else startTutorialPractice()
        } else if (diagRoundRef.current === 1) {
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
            beginDiagonalHold(breathRef.current)
          }, DIAG_FADE_IN_MS)
        } else if (diagRoundRef.current < DIAG_ROUNDS) {
          showA1Again()
        } else {
          showDiagonalB2()
        }
      }
    } else if (stage === 'B1-hold' || stage === 'B2-hold' || stage === 'B3-hold') {
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
          if (stage === 'B1-hold' || stage === 'B2-hold') {
            diagStageRef.current = stage === 'B1-hold' ? 'B1-fadeout' : 'B2-fadeout'
            clearTimeout(tutorialTimerRef.current)
            setTutorialFadeMs(DIAG_FADE_OUT_MS)
            setTutorialVisible(false)
            tutorialVisibleRef.current = false
            tutorialTimerRef.current = setTimeout(stage === 'B1-hold' ? showA1Again : showB3, DIAG_FADE_OUT_MS)
          } else {
            finishDiagonalSequence()
          }
        }
      }
    }
  }, [beginDiagonalHold, showDiagonalB2, showB3, showA1Again, finishDiagonalSequence, startTutorialPractice])

  useEffect(() => {
    if (screen !== 'experience') return
    const id = setInterval(() => {
      // Box Breathing's captions are driven by their own clock-based poll
      // below, not by user interaction -- "stillness" is meaningless here.
      if (mode === 'box') return
      if (usesScreens(mode)) return   // Tutorial-style modes: own reminder (TUTORIAL_REMIND_MS)
      if (introActiveRef.current) return
      if (mode === 'slowing' && pacedCueStageRef.current === 'captions') return
      if (isDiagonal && diagStageRef.current !== 'done') return
      if (!tutorialVisibleRef.current && performance.now() >= textFadeOutEndRef.current && Date.now() - lastMoveTime.current >= STILLNESS_MS) {
        awaitingMovementRef.current = true
        setTutorialText(currentMainTextRef.current)
        setTutorialVisible(true)
        tutorialVisibleRef.current = true
      }
    }, 500)
    return () => clearInterval(id)
  }, [screen, isDiagonal, mode])

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
        if (tutorialVisibleRef.current && currentMainTextRef.current !== TEXTS.balloonRetry) {
          setTutorialVisible(false)
          tutorialVisibleRef.current = false
        }
        return
      }
      // Balloon (h): its course sets the pace, so the captions follow its
      // phases as plain text (no timed fades): Inhale, Hold, Exhale, Hold,
      // for BALLOON_CAPTION_CYCLES box cycles.
      if (shapeRef.current === 'h') {
        const bp = balloonPaceRef.current.phase
        const cap = balloonCaptionRef.current
        if (bp === cap.phase) return
        if (bp === 'retry') { cap.phase = bp; return }   // the retry text shows instead
        if (bp === 'inhale' && cap.phase === 'hold-out' && ++cap.cycles >= BALLOON_CAPTION_CYCLES) {
          bbTutorialActiveRef.current = false
          return
        }
        cap.phase = bp
        const nextText = bp === 'hold-in' || bp === 'hold-out' ? TEXTS.boxHold
          : bp === 'door-open' || bp === 'exhale' ? TEXTS.boxExhale : TEXTS.boxInhale
        if (nextText === currentMainTextRef.current && tutorialVisibleRef.current) return
        currentMainTextRef.current = nextText
        setTutorialFadeMs(BALLOON_CAPTION_FADE_MS)
        setTutorialText(nextText)
        setTutorialVisible(true)
        tutorialVisibleRef.current = true
        return
      }
      const interval = Math.max(0.05, spawnIntervalRef.current)
      const totalElapsed = Math.max(0, (performance.now() - boxClockStartRef.current) / 1000)
      const phaseIndex = Math.floor((totalElapsed % (4 * interval)) / interval)
      if (phaseIndex !== boxCaptionIndexRef.current) {
        boxCaptionIndexRef.current = phaseIndex
        // The Inhale/Exhale caption stays up through the Hold after it;
        // TutorialText fades "Hold" in below it (subText).
        const nextText = [TEXTS.boxInhale, TEXTS.boxInhale, TEXTS.boxExhale, TEXTS.boxExhale][phaseIndex]
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

  // iOS Safari ignores user-scalable=no: block its pinch gestures so a stray
  // touch never zooms the page (the experience wrapper also has touch-action: none).
  useEffect(() => {
    const block = (e) => e.preventDefault()
    document.addEventListener('gesturestart', block)
    document.addEventListener('gesturechange', block)
    return () => {
      document.removeEventListener('gesturestart', block)
      document.removeEventListener('gesturechange', block)
    }
  }, [])

  useEffect(() => {
    spawnIntervalRef.current = breathLength
  }, [breathLength])

  const handleBreathChange = useCallback((v) => {
    setBreathLength(v)
  }, [])

  // Left slider: kept working, but drives nothing for now (see breathRef).
  const setLeft = useCallback((v) => {
    leftVal.current = v
    audioRef.current.setSlider(v)   // left slider drives the slider audio pair
  }, [])

  const setRight = useCallback((v) => {
    rightVal.current = v
    lastMoveTime.current = Date.now()
    // Breath position in the old left-slider convention (0 exhale -> 1 inhale).
    const b = 1 - v
    if (usesScreens(modeRef.current)) {
      // Moving again after the reminder: back to the step's own text.
      const t = tutorialRef.current
      if (t.reminding) {
        t.reminding = false
        if (t.stepText) showCountText(t.stepText)
        else hideCountText()
      }
      updateTutorialPractice(b)
    }
    if (isDiagonal || modeRef.current === 'tutorial' || diagStageRef.current.startsWith('B3')) updateDiagonalSequence(b)
    updatePacedText(b)
    if (pacedWaitForBottomRef.current && b <= DIAG_EDGE_THRESHOLD && pacedStartFnRef.current) pacedStartFnRef.current()

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
  }, [handleMovement, triggerTextAFade, triggerTextBFade, isDiagonal, updateDiagonalSequence, updatePacedText, updateTutorialPractice, showCountText, hideCountText])

  // Single Slider / Touch the Screen / Tilt Your Phone / Blow on the Mic drive the breath here,
  // exactly as if both sliders had moved (raw refs too, for recording).
  const drivenBreath = useBreathControl({
    control: mode ? breathControl : null,
    disabledRef: slidersDisabledRef,
    resetKey: sliderResetKey,
    onValue: (v) => {
      leftRawRef.current = v
      rightRawRef.current = 1 - v
      setLeft(v)
      setRight(1 - v)
    },
    onTiltFail: () => setTiltFailed(true),
    onMicFail: () => setMicFailed(true),
    getQuietRate,
    blowRef,
    allSensors: shapeOption === 'i',
    readoutRef: inputReadoutRef,
    calibrateKey: micCheckKey,
    calStatusRef: micCheckStatusRef,
    onCalibrated: () => finishMicCheck(),
  })

  // Mic check done or skipped: unmute and run the mode's opening.
  const finishMicCheck = useCallback(() => {
    setMicCheckKey(0)
    const open = afterMicCheckRef.current
    afterMicCheckRef.current = null
    if (!open) return
    audioRef.current.setMuted(false, 0.5)
    open()
  }, [])
  // No mic, or the control fell back to Double Sliders: skip the check.
  const micInUse = breathControl === 'blow' || shapeOption === 'i'
  useEffect(() => {
    if (micCheckKey && (micFailed || !micInUse)) finishMicCheck()
  }, [micCheckKey, micFailed, micInUse, finishMicCheck])

  // Keep the screen awake for the whole session (every control).
  useWakeLock(!!mode)

  // Fade the scene and sliders in (see SCENE_REVEAL_MS).
  const revealScene = useCallback(() => {
    setSceneRevealed(true)   // sliders are touchable from the start of the fade
  }, [])

  const handleSelectMode = useCallback((m) => {
    // Start/Restart taps: unlock and (re)start the breath audio.
    audioGroupIndexRef.current = 0
    // Tilt Your Phone: ask for motion access inside this tap (iOS).
    const tiltControl = sliderLayout === 'tilt'
    // (Failures are cleared first, so a stale one doesn't skip the mic check.)
    if (tiltControl) { setTiltFailed(false); requestTiltPermission().then((ok) => setTiltFailed(!ok)) }
    // Paper Airplane / Balloon steer by side tilt, Input Test reads tilt: ask in this tap too.
    if ((shapeRef.current === 'g' || shapeRef.current === 'h' || shapeRef.current === 'i' || shapeRef.current === 'j') && !tiltControl) requestTiltPermission()
    audioRef.current.unlock()
    audioRef.current.start(0)
    // Blow on the Mic: open the mic inside this tap, after the app's sound has
    // set up its own audio context (doing it first could leave the mic silent).
    if (sliderLayout === 'blow' || shapeRef.current === 'i') { setMicFailed(false); requestMicAccess().then((ok) => setMicFailed(!ok)) }
    audioRef.current.setSlider(leftVal.current)
    gatesEnabledRef.current = false
    clearTimeout(gateEnableTimerRef.current)
    spawnIntervalRef.current = m === 'timed' ? 12 : m === 'box' ? BOX_STEP_SECONDS : 8
    inhaleSecondsRef.current = null
    exhaleSecondsRef.current = null
    if (m === 'timed' || m === 'slowing' || m === 'box') { clearTimeout(breathControlTimerRef.current); setBreathControlVisible(false) }
    if (m === 'timed') setBreathLength(12)
    lastMoveTime.current = Date.now() - STILLNESS_MS - 1
    if (m === 'slowing') resetSlowingState()
    bbCycleRef.current = 0
    bbTutorialActiveRef.current = false
    boxCaptionsStartedRef.current = false
    balloonStateRef.current = { mode: 'follow', travelP: 0, bounceStart: -Infinity, bottom: 0 }
    balloonPaceRef.current = { paced: false, phase: null, bellSeq: 0, inhaleDur: 1 }
    shipStateRef.current = { y: 0, z: 0, alpha: 0, rev: 0, rock: 0, emit: 0, steer: false, seq: 0 }
    shipPaceRef.current = { paced: false, phase: 'idle', inhaleDur: 1 }
    balloonCaptionRef.current = { phase: null, cycles: 0 }
    pacedWaitForBottomRef.current = false
    pacedCueStageRef.current = 'off'
    pacedBreathNumRef.current = 0
    pacedCaptionRef.current = null
    setPacedCaptionsOn(false)
    pacedTextStageRef.current = 'off'
    pacedTextStrokesRef.current = 0

    clearTimeout(tutorialTimerRef.current)
    setSceneRevealed(false)
    setCoverFading(false)
    textFadeOutEndRef.current = 0
    modeRef.current = m
    clearTutorialTimers()
    tutorialRef.current = newTutorialState()
    setContinueVisible(false)
    setTutorialArt('morph')
    setTutorialPaced(false)
    setTutorialSub(null)
    setTutorialSubVisible(false)
    diagRoundRef.current = 1
    pendingGatesFnRef.current = null
    awaitingMovementRef.current = false
    breathCountingEnabledRef.current = false
    // Every mode counts from the intro hand-off (Box/Slowing switch to their
    // paced source at the count tutorial's third cycle).
    introStartsCountingRef.current = true
    countTutorialRef.current = { active: false, mode: m }
    pacedStartFnRef.current = null   // Box/Slowing start from their countdown (handleTutorialContinue)
    breathCountSourceRef.current = null
    breathPhaseRef.current = 'exhale'
    paceArtFadeRef.current = 1
    paletteCycleIndexRef.current = 0
    paletteLerpRef.current = null
    landscapeIndexRef.current = 0
    livePaletteRef.current.tertiary.set(PALETTES.teal.tertiaryColor)
    livePaletteRef.current.primary.set(PALETTES.teal.primaryColor)
    livePaletteRef.current.secondary.set(PALETTES.teal.secondaryColor)
    livePaletteRef.current.background.set(PALETTES.teal.background)
    livePaletteRef.current.text.set(PALETTES.teal.textColor)

    // Tutorial start (Text A / Diagonal A1), run after the mode explanation.
    const beginTutorial = () => {
    introActiveRef.current = false
    revealScene()   // scene + sliders fade in together with the first text
    setTutorialAtTop(false)
    if (isDiagonal) {
      stageRef.current = 'done'
      diagStageRef.current = 'A1'
      diagDirectionRef.current = 0
      diagExtremeRef.current = null
      diagReversalCountRef.current = 0
      currentMainTextRef.current = TEXT_A1_DIAGONAL
      setTutorialText(TEXT_A1_DIAGONAL)
      setTutorialVisible(true)
      tutorialVisibleRef.current = true
      // Fade in over A1_FADE_IN_MS, multiplied by the slider-bound opacity
      // (1 - breath) so moving a slider meanwhile doesn't pop it to full.
      // Then 'A1' hands it to updateDiagonalSequence.
      diagStageRef.current = 'A1-appear'
      setTutorialOpacity(0)
      const appearStart = performance.now()
      const appearTick = () => {
        if (diagStageRef.current !== 'A1-appear') return
        const t = Math.min(1, (performance.now() - appearStart) / A1_FADE_IN_MS)
        setTutorialOpacity(THREE.MathUtils.smoothstep(t, 0, 1) * (1 - breathRef.current))
        if (t < 1) requestAnimationFrame(appearTick)
        else diagStageRef.current = 'A1'
      }
      requestAnimationFrame(appearTick)
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
    }

    // Mode explanation first (MODE_INTRO_MS), then fade out and start the
    // tutorial. The tutorial stages sit at 'intro' meanwhile, so slider
    // movement doesn't advance them.
    clearTimeout(introTimerRef.current)
    const intro = MODE_INTRO[m]
    const openMode = () => {
    if (m === 'tutorial' && shapeRef.current === 'j') {
      // Space Ship: no Part 1/2 practice (it has no 5-breath count). Open on
      // Part 3 (Test Bell); its Continue runs the paced start.
      introActiveRef.current = false
      stageRef.current = 'done'
      diagStageRef.current = 'done'
      setTutorialArt('background')
      showTutorialScreen('part3', TUTORIAL.part3)
    } else if (m === 'tutorial') {
      // Tutorial: Part 1's text waits for Continue (handleTutorialContinue).
      introActiveRef.current = false
      stageRef.current = 'done'
      diagStageRef.current = 'intro'
      showTutorialScreen('part1', TUTORIAL.part1)
    } else if (m === 'box' || m === 'slowing') {
      // Tutorial-style opening screen; Continue runs the rest (handleTutorialContinue).
      introActiveRef.current = false
      stageRef.current = 'done'
      diagStageRef.current = 'done'
      const id = m === 'box' ? 'box' : 'slowing1'
      showTutorialScreen(id, MODE_SCREENS[id])
    } else if (intro) {
      introActiveRef.current = true
      setTutorialAtTop(true)
      stageRef.current = 'intro'
      diagStageRef.current = 'intro'
      currentMainTextRef.current = intro
      setTutorialOpacity(null)
      setTutorialFadeMs(FADE_TRANSITION_MS)
      setTutorialText(intro)
      setTutorialVisible(true)
      tutorialVisibleRef.current = true
      introTimerRef.current = setTimeout(() => {
        setTutorialFadeMs(MODE_INTRO_FADE_OUT_MS)
        setTutorialVisible(false)
        tutorialVisibleRef.current = false
        introTimerRef.current = setTimeout(beginTutorial, MODE_INTRO_FADE_OUT_MS)
      }, MODE_INTRO_MS)
    } else {
      introActiveRef.current = false
      beginTutorial()
    }
    }
    // Sessions that use the mic open with the mic check (MicCheck); the
    // mode's own opening waits for it, with the app's sound muted.
    afterMicCheckRef.current = null
    if (sliderLayout === 'blow' || shapeRef.current === 'i') {
      afterMicCheckRef.current = openMode
      audioRef.current.setMuted(true, 0.3)
      micCheckSeqRef.current += 1
      setMicCheckKey(micCheckSeqRef.current)
    } else {
      setMicCheckKey(0)
      openMode()
    }
    if (m === 'timed') pendingGatesFnRef.current = showGatesText

    setMode(m)
    setModeKey(k => k + 1)
    setScreen('experience')
  }, [resetSlowingState, showGatesText, isDiagonal, sliderLayout, revealScene, clearTutorialTimers, showTutorialScreen])

  // Slowing Down: first paced Inhale after recording (see PacedBreathCountStarter).
  const handlePacedCountStart = useCallback(() => {
    breathCountSourceRef.current = shapeRef.current === 'd' || usesCubeFlow(shapeRef.current) ? ringPaceProgressRef : null
    breathCountingEnabledRef.current = true
  }, [])

  const handleRestart = useCallback(() => {
    handleSelectMode(mode)
  }, [mode, handleSelectMode])

  const handleBackFromExperience = useCallback(() => {
    audioRef.current.stop()
    afterMicCheckRef.current = null
    setMicCheckKey(0)
    clearTimeout(introTimerRef.current)
    clearTutorialTimers()
    tutorialRef.current = newTutorialState()
    setContinueVisible(false)
    introActiveRef.current = false
    setTutorialAtTop(false)
    gatesEnabledRef.current = false
    pacedWaitForBottomRef.current = false
    countTutorialRef.current = { active: false, mode: null }
    pacedCueStageRef.current = 'off'
    pacedBreathNumRef.current = 0
    pacedCaptionRef.current = null
    setPacedCaptionsOn(false)
    pacedTextStageRef.current = 'off'
    pacedTextStrokesRef.current = 0
    clearTimeout(tutorialTimerRef.current)
    clearTimeout(gateEnableTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    setMode(null)
    setScreen('selectMode')
  }, [clearTutorialTimers])

  // Measures the Home/Restart button (group)'s own rendered height so the
  // sliders can be shifted up to sit flush against its top edge -- avoids
  // hardcoding a guessed pixel height for the nav buttons.
  const navButtonsRef = useRef(null)
  const [sliderShiftUp, setSliderShiftUp] = useState(50)
  useLayoutEffect(() => {
    if (navButtonsRef.current) setSliderShiftUp(navButtonsRef.current.offsetHeight)
  }, [isDiagonal])
  useLayoutEffect(() => {
    if (continueRef.current) setContinueHeight(continueRef.current.offsetHeight)
    if (skipRef.current) setSkipHeight(skipRef.current.offsetHeight)
  }, [mode, tutorialScreenId])

  // Home screen loop: on while Home shows, off on every other screen.
  useEffect(() => {
    if (!unlocked) return
    if (screen === 'selectMode') audioRef.current.startHome()
    else audioRef.current.stopHome()
  }, [screen, unlocked])

  // Passcode gate: not saved anywhere, so every load/refresh asks again.
  if (!unlocked) {
    return <PasscodeScreen palette={palette} onUnlock={handleUnlock} />
  }

  if (screen === 'selectMode') {
    return (
      <SelectModeScreen
        onStart={handleSelectMode}
        onPersonalize={() => setScreen('personalize')}
        onSliderLayouts={() => setScreen('sliderLayouts')}
        palette={palette}
        selectedMode={selectedMode}
        onSelectModeChange={setSelectedMode}
        shapeOption={shapeOption}
        onAnyTap={() => audioRef.current.startHome()}
      />
    )
  }
  if (screen === 'sliderLayouts') {
    return (
      <SliderLayoutsScreen
        selected={sliderLayout}
        shapeOption={shapeOption}
        onSelect={(v) => {
          setSliderLayout(v)
          if (v === 'tilt') requestTiltPermission().then((ok) => setTiltFailed(!ok))
          if (v === 'blow') requestMicAccess(false).then((ok) => setMicFailed(!ok))
        }}
        tiltFailed={tiltFailed}
        micFailed={micFailed}
        onHome={() => setScreen('selectMode')}
        onStart={() => handleSelectMode(selectedMode)}
        onArtOptions={() => setScreen('personalize')}
        modeLabel={MODE_LABELS[selectedMode]}
        palette={palette}
      />
    )
  }
  if (screen === 'personalize') {
    return (
      <PersonalizeScreen
        shapeOption={shapeOption}
        sliderLayout={sliderLayout}
        onSelectShape={(v) => {
          setShapeOption(v)
          if (v === 'j') setSelectedMode('tutorial')   // Space Ship: Tutorial only for now
          if (v === 'g' || v === 'h' || v === 'i' || v === 'j') requestTiltPermission()
          if (v === 'i') requestMicAccess(false)
        }}
        onSelectMode={() => setScreen('selectMode')}
        onStart={() => handleSelectMode(selectedMode)}
        onControlOptions={() => setScreen('sliderLayouts')}
        modeLabel={MODE_LABELS[selectedMode]}
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
  // Tutorial: Part 1 shows the Morph only; the paced gates/art mount for Part 3's end.
  const tutorialPacedOn = mode === 'tutorial' && tutorialPaced
  const showBackgroundArt = mode !== 'tutorial' || tutorialArt === 'background'
  const landscapeMode = tutorialPacedOn ? 'slowing' : mode   // landscape speed follows the gates once they run
  const hasGates = mode === 'timed' || mode === 'slowing' || mode === 'box' || tutorialPacedOn
  // Continue sits a little above the Home/Restart buttons' tops; the Part
  // texts center between the mode name and the top of Continue.
  const modeLabelLines = (MODE_LABELS[mode] || '').includes(': ') ? 2 : 1
  // Tutorial Parts 1 and 2 add Skip Tutorial in Continue's spot; Continue moves up.
  const showSkip = mode === 'tutorial' && (tutorialScreenId === 'part1' || tutorialScreenId === 'part2')
  const skipBottom = 16 + sliderShiftUp + 12
  const continueBottom = skipBottom + (showSkip ? skipHeight + 12 : 0)
  const tutorialScreenRegion = usesScreens(mode) && tutorialAtTop
    ? { top: MODE_CAPTION_TOP + modeLabelLines * MODE_CAPTION_LINE_PX, bottom: continueBottom + continueHeight }
    : null
  const MorphComponent = shapeOption === 'b' ? MorphB : shapeOption === 'c' || shapeOption === 'd' ? MorphC : shapeOption === 'e' ? MorphE : shapeOption === 'f' ? MorphF : shapeOption === 'g' ? MorphG : shapeOption === 'h' ? MorphH : shapeOption === 'j' ? MorphJ : shapeOption === 'i' ? null : MorphA
  const GatesComponent = shapeOption === 'f' ? GatesF : shapeOption === 'b' ? GatesB : shapeOption === 'c' ? GatesC : shapeOption === 'd' ? GatesHeadless : shapeOption === 'g' ? GatesG : shapeOption === 'e' ? GatesHeadlessE : GatesA
  const BoxGatesComponent = shapeOption === 'f' ? GatesBoxBreathingF : shapeOption === 'b' ? GatesBoxBreathingB : shapeOption === 'c' ? GatesBoxBreathingC : shapeOption === 'd' ? GatesBoxBreathingD : shapeOption === 'g' ? GatesBoxBreathingG : shapeOption === 'e' ? GatesBoxBreathingHeadlessE : GatesBoxBreathingA
  const targetPaceInfo = TARGET_PACES[targetPace] || TARGET_PACES[DEFAULT_TARGET_PACE]

  return (
    <div key={modeKey} ref={wrapperRef} style={{ width: '100%', height: '100%', position: 'relative', touchAction: 'none' }}>
      <Canvas
        camera={CAMERA_BY_SHAPE[shapeOption] || DEFAULT_CAMERA}
        style={{ position: 'absolute', inset: 0 }}
      >
        <color attach="background" args={[palette.background]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <PaletteLerpDriver livePaletteRef={livePaletteRef} paletteLerpRef={paletteLerpRef} paletteCycleIndexRef={paletteCycleIndexRef} wrapperRef={wrapperRef} getLabelPhase={getLabelPhase} getHoldPhase={getHoldPhase} />
        <PaceAudioDriver audioRef={audioRef} getPaceProgress={getPaceProgress} getBellPhase={getBellPhase} />
        {shapeOption === 'd' && <CameraVerticalShift />}
        {shapeOption === 'f' && <CameraVerticalShift lowerWorldUnits={4} />}
        {MorphComponent && <MorphComponent leftVal={breathRef} rightVal={rightVal} palette={palette} shapeOption={shapeOption} leftRawRef={breathRawRef} breathCountingEnabledRef={breathCountingEnabledRef} breathCountSourceRef={breathCountSourceRef} livePaletteRef={livePaletteRef} onBreathPaletteCycle={handleBreathPaletteCycle} onBreathCountEvent={handleBreathCountEvent} landscapeIndexRef={landscapeIndexRef} planePosRef={planePosRef} blowRef={blowRef} balloonStateRef={balloonStateRef} shipStateRef={shipStateRef} />}
        {showBackgroundArt && shapeOption === 'b' && <LandscapeB mode={landscapeMode} spawnIntervalRef={spawnIntervalRef} landscapeIndexRef={landscapeIndexRef} livePaletteRef={livePaletteRef} palette={palette} />}
        {showBackgroundArt && shapeOption === 'h' && (
          <BalloonCourseH leftVal={breathRef} gatesEnabledRef={gatesEnabledRef} isBox={mode === 'box'} spawnIntervalRef={spawnIntervalRef}
            inhaleSecondsRef={inhaleSecondsRef} exhaleSecondsRef={exhaleSecondsRef} breathPhaseRef={breathPhaseRef}
            balloonStateRef={balloonStateRef} balloonPaceRef={balloonPaceRef} planePosRef={planePosRef}
            palette={palette} livePaletteRef={livePaletteRef} onRetryText={handleBalloonRetryText} />
        )}
        {showBackgroundArt && shapeOption === 'j' && (
          <SpaceshipBayJ leftVal={breathRef} gatesEnabledRef={gatesEnabledRef} spawnIntervalRef={spawnIntervalRef}
            inhaleSecondsRef={inhaleSecondsRef} exhaleSecondsRef={exhaleSecondsRef} blowRef={blowRef} micFailed={micFailed}
            shipStateRef={shipStateRef} shipPaceRef={shipPaceRef} planePosRef={planePosRef}
            palette={palette} livePaletteRef={livePaletteRef} onShipText={handleShipText} />
        )}
        {showBackgroundArt && shapeOption === 'g' && <GroundTiesG mode={landscapeMode} spawnIntervalRef={spawnIntervalRef} livePaletteRef={livePaletteRef} palette={palette} />}
        {showBackgroundArt && shapeOption === 'f' && <SideCloudsF mode={landscapeMode} spawnIntervalRef={spawnIntervalRef} leftVal={breathRef} gatesEnabledRef={gatesEnabledRef} livePaletteRef={livePaletteRef} palette={palette} />}
        {showBackgroundArt && backgroundOption === 'rings' && <BackgroundRingsD baseColor={palette.background} emissiveColor={palette.secondaryColor} breathPhaseRef={breathPhaseRef} gatesEnabledRef={gatesEnabledRef} spawnIntervalRef={spawnIntervalRef} inhaleSecondsRef={inhaleSecondsRef} exhaleSecondsRef={exhaleSecondsRef} paceProgressRef={ringPaceProgressRef} livePaletteRef={livePaletteRef} />}
        {showBackgroundArt && backgroundOption === 'rings' && <RingParticlesD textColor={palette.textColor} secondaryColor={palette.secondaryColor} tertiaryColor={palette.tertiaryColor} primaryColor={palette.primaryColor} paceProgressRef={ringPaceProgressRef} breathPhaseRef={breathPhaseRef} gatesEnabledRef={gatesEnabledRef} isBoxBreathing={mode === 'box'} boxPhaseRef={boxPhaseRef} boxProgressRef={boxProgressRef} livePaletteRef={livePaletteRef} paceArtFadeRef={paceArtFadeRef} />}
        {mode === 'slowing' && !isAmbientArt(shapeOption) && !usesCubeFlow(shapeOption) && <PacedBreathCountStarter gatesEnabledRef={gatesEnabledRef} breathPhaseRef={breathPhaseRef} onStart={handlePacedCountStart} />}
        {mode === 'slowing' && (isAmbientArt(shapeOption) || usesCubeFlow(shapeOption)) && <PacedPhaseWatcher gatesEnabledRef={gatesEnabledRef} breathPhaseRef={breathPhaseRef} onPhaseChange={handlePacedPhase} />}
        {(mode === 'slowing' || tutorialPacedOn) && shapeOption === 'd' && <SlowingDownPaceRingsD gatesEnabledRef={gatesEnabledRef} breathPhaseRef={breathPhaseRef} spawnIntervalRef={spawnIntervalRef} inhaleSecondsRef={inhaleSecondsRef} exhaleSecondsRef={exhaleSecondsRef} gateColor={palette.secondaryColor} emissiveColor={palette.primaryColor} livePaletteRef={livePaletteRef} paceArtFadeRef={paceArtFadeRef} />}
        {showBackgroundArt && backgroundOption === 'b' && <BackgroundB gateColor={palette.secondaryColor} breathPhaseRef={breathPhaseRef} gatesEnabledRef={gatesEnabledRef} spawnIntervalRef={spawnIntervalRef} inhaleSecondsRef={inhaleSecondsRef} exhaleSecondsRef={exhaleSecondsRef} />}
        <EffectComposer>
          <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.5} />
        </EffectComposer>
        {hasGates && mode !== 'box' && shapeOption !== 'h' && shapeOption !== 'i' && shapeOption !== 'j' && (
          <GatesComponent
            palette={palette}
            rightVal={rightVal}
            gatesEnabledRef={gatesEnabledRef}
            spawnIntervalRef={spawnIntervalRef}
            gateColor={palette.secondaryColor}
            emissiveColor={palette.primaryColor}
            breathPhaseRef={breathPhaseRef}
            inhaleSecondsRef={inhaleSecondsRef}
            exhaleSecondsRef={exhaleSecondsRef}
            livePaletteRef={livePaletteRef}
            paceProgressRef={ringPaceProgressRef}
            planePosRef={planePosRef}
            startOnInhale={mode === 'slowing' || mode === 'tutorial'}
          />
        )}
        {mode === 'box' && hasGates && shapeOption !== 'h' && shapeOption !== 'i' && shapeOption !== 'j' && (
          <BoxGatesComponent
            palette={palette}
            rightVal={rightVal}
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
            planePosRef={planePosRef}
            paceArtFadeRef={paceArtFadeRef}
          />
        )}
        {shapeOption === 'e' && mode === 'box' && (
          <StarFieldE gateColor={palette.secondaryColor} emissiveColor={palette.primaryColor} holdFlareRef={holdFlareRef} />
        )}
        {mode === 'slowing' && (
          <SlowingDownController
            leftRawRef={breathRawRef}
            spawnIntervalRef={spawnIntervalRef}
            recordingEnabledRef={recordingEnabledRef}
            lastMaxTimeRef={lastMaxTimeRef}
            onGatesReady={handleRecordingReady}
            onTextDone={isAmbientArt(shapeOption) || usesCubeFlow(shapeOption) ? () => {} : handleSlowingTextDDone}
            onTextEDone={isAmbientArt(shapeOption) || usesCubeFlow(shapeOption) ? () => {} : handleSlowingTextEDone}
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
        {/* Blank-background start: covers the scene until revealScene */}
        <div style={{
          position: 'absolute', inset: 0, background: 'var(--live-bg-color, ' + palette.background + ')',
          opacity: sceneRevealed ? 0 : 1, transition: `opacity ${SCENE_REVEAL_MS}ms ease`, pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: slidersLive ? 'auto' : 'none',
          opacity: sceneRevealed ? 1 : 0, transition: `opacity ${SCENE_REVEAL_MS}ms ease`,
        }}>
          {isDiagonal
            ? <SlidersDiagonal key={sliderResetKey} onLeft={setLeft} onRight={setRight} leftRawRef={leftRawRef} rightRawRef={rightRawRef} shiftUp={sliderShiftUp} disabledRef={slidersDisabledRef} drivenValue={drivenBreath} labelsOnly={shapeOption === 'j' && breathControl === 'blow'} />
            : <Sliders key={sliderResetKey} onLeft={setLeft} onRight={setRight} leftRawRef={leftRawRef} rightRawRef={rightRawRef} shiftUp={sliderShiftUp} disabledRef={slidersDisabledRef} />}
        </div>
        <div style={{ position: 'absolute', top: MODE_CAPTION_TOP, left: '50%', transform: 'translateX(-50%)' }}>
          <span style={{
            color: 'var(--live-text-color, rgba(255,255,255,0.7))', fontSize: 13, lineHeight: `${MODE_CAPTION_LINE_PX}px`, fontFamily: 'sans-serif',
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
                    background: UI_INTERIOR,
                    border: `1px solid ${UI_EDGE}`,
                    borderRadius: 6,
                    cursor: 'pointer', pointerEvents: 'auto',
                  }} />
        )}
        {shapeOption === 'i' && !micCheckKey && <InputTestReadout readoutRef={inputReadoutRef} />}
        {micCheckKey > 0 && <MicCheck statusRef={micCheckStatusRef} onSkip={finishMicCheck} />}
        <TutorialText region={tutorialScreenRegion} topPx={tutorialAtTop ? MODE_CAPTION_TOP + ((MODE_LABELS[mode] || '').includes(': ') ? 4 : 3) * MODE_CAPTION_LINE_PX + INTRO_EXTRA_LINES * TEXT_SIZE_INTRO * 1.2 : null} text={tutorialText} visible={tutorialVisible} opacity={tutorialOpacity} fadeMs={tutorialFadeMs}
          size={tutorialAtTop ? TEXT_SIZE_INTRO
            : (tutorialText === TEXTS.boxInhale || tutorialText === TEXTS.boxExhale || tutorialText === TEXTS.boxHold) ? TEXT_SIZE_CAPTION
            : TEXT_SIZE_TUTORIAL}
          liftPx={tutorialAtTop ? 0
            : (tutorialText === TEXTS.boxInhale || tutorialText === TEXTS.boxExhale || tutorialText === TEXTS.boxHold) ? TEXT_SIZE_CAPTION * 1.2   // captions: 1 line up
            : TUTORIAL_TEXT_LIFT_PX}
          subText={mode === 'box' && shapeOption !== 'h' && (tutorialText === TEXTS.boxInhale || tutorialText === TEXTS.boxExhale) ? TEXTS.boxHold
            : usesScreens(mode) ? tutorialSub : null}
          subVisible={tutorialSubVisible} subFadeMs={tutorialSubFadeMs}
          subGapPx={usesScreens(mode) && tutorialText !== TEXTS.boxInhale && tutorialText !== TEXTS.boxExhale ? TUTORIAL_SUB_GAP_PX : 0}
          pulseActive={(mode === 'box' && shapeOption !== 'h' && tutorialVisible && (tutorialText === TEXTS.boxInhale || tutorialText === TEXTS.boxExhale))
            || (mode === 'slowing' && pacedCaptionsOn && tutorialVisible)}
          pulseMode={mode === 'slowing' ? 'paced' : 'box'}
          pulseCycleStartRef={boxClockStartRef} pulseIntervalRef={spawnIntervalRef} pacedCaptionRef={pacedCaptionRef}
          insert={tutorialAtTop && (tutorialScreenId === 'part3' || tutorialScreenId === 'box') && (
            <button onClick={continueVisible ? () => audioRef.current.testBell(tutorialScreenId === 'box' ? BELL_HOLD : BELL_INHALE_EXHALE) : undefined} style={navPillStyle}>
              {TEST_BELL_LABEL}
            </button>
          )} />
        {usesScreens(mode) && (
          // Tutorial-style screens: rounded like the mode cards, colored/pressed like Start.
          <button
            ref={continueRef}
            onClick={continueVisible ? handleTutorialContinue : undefined}
            onPointerDown={() => setContinuePressed(true)}
            onPointerUp={() => setContinuePressed(false)}
            onPointerLeave={() => setContinuePressed(false)}
            onPointerCancel={() => setContinuePressed(false)}
            style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)',
              bottom: continueBottom,
              padding: '20px 24px', borderRadius: 12,
              background: `rgba(var(--live-primary-rgb, 141, 177, 161), ${continuePressed ? 0.75 : 0.25})`,
              border: '2px solid rgb(var(--live-primary-rgb, 141, 177, 161))',
              color: 'rgb(var(--live-primary-rgb, 141, 177, 161))', fontSize: 20, fontWeight: 700,
              fontFamily: 'sans-serif', cursor: 'pointer',
              opacity: continueVisible ? 1 : 0,
              transition: `opacity ${TUTORIAL_SCREEN_FADE_MS}ms ease`,
              pointerEvents: continueVisible ? 'auto' : 'none',
              zIndex: 101,
            }}
          >
            Continue
          </button>
        )}
        {showSkip && (
          // Same shape and colors as Continue, outline only and smaller.
          <button
            ref={skipRef}
            onClick={continueVisible ? handleTutorialSkip : undefined}
            onPointerDown={() => setSkipPressed(true)}
            onPointerUp={() => setSkipPressed(false)}
            onPointerLeave={() => setSkipPressed(false)}
            onPointerCancel={() => setSkipPressed(false)}
            style={{
              position: 'absolute', left: '50%', transform: 'translateX(-50%)',
              bottom: skipBottom,
              padding: '16px 20px', borderRadius: 12,
              background: skipPressed ? 'rgba(var(--live-primary-rgb, 141, 177, 161), 0.75)' : 'transparent',
              border: '2px solid rgb(var(--live-primary-rgb, 141, 177, 161))',
              color: 'rgb(var(--live-primary-rgb, 141, 177, 161))', fontSize: 16, fontWeight: 700,
              fontFamily: 'sans-serif', cursor: 'pointer', whiteSpace: 'nowrap',
              opacity: continueVisible ? 1 : 0,
              transition: `opacity ${TUTORIAL_SCREEN_FADE_MS}ms ease`,
              pointerEvents: continueVisible ? 'auto' : 'none',
              zIndex: 101,
            }}
          >
            Skip Tutorial
          </button>
        )}
        {mode === 'timed' && (
          <BreathLengthControl
            breathLength={breathLength}
            onChange={handleBreathChange}
            visible={breathControlVisible}
          />
        )}
        {isDiagonal ? (
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
