import { useRef, useCallback, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import MorphA from './MorphA'
import MorphB from './MorphB'
import MorphC from './MorphC'
import GatesA from './GatesA'
import GatesB from './GatesB'
import GatesC from './GatesC'
import GatesHeadless from './GatesHeadless'
import GatesBoxBreathingA from './GatesBoxBreathingA'
import GatesBoxBreathingB from './GatesBoxBreathingB'
import GatesBoxBreathingC from './GatesBoxBreathingC'
import Sliders from './Sliders'
import SlidersDiagonal from './SlidersDiagonal'
import HomeScreen from './HomeScreen'
import SelectModeScreen from './SelectModeScreen'
import SliderLayoutsScreen from './SliderLayoutsScreen'
import PersonalizeScreen from './PersonalizeScreen'
import ShapeOptionsScreen from './ShapeOptionsScreen'
import ColorOptionsScreen from './ColorOptionsScreen'
import BackgroundA from './BackgroundA'
import TutorialText from './TutorialText'
import SlowingDownController from './SlowingDownController'
import BreathLengthControl from './BreathLengthControl'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { PALETTES } from './palettes'
import { TEXT_A, TEXT_B, TEXTS } from './copy'

const navPillStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8, color: 'rgba(255,255,255,0.7)',
  padding: '8px 14px', fontSize: 13,
  cursor: 'pointer', fontFamily: 'sans-serif',
  letterSpacing: '0.03em', whiteSpace: 'nowrap',
  pointerEvents: 'auto',
}

const STILLNESS_MS = 10000
const MOVEMENT_FADE_DELAY_MS = 2000
const TEXT_C_DISPLAY_MS = 5000
const FADE_TRANSITION_MS = 2000
const BB_TEXT_LEAD_MS = 1600
const RIGHT_DEADBAND = 0.08
const TARGET_STROKES_A = 4  // 2 full up+down oscillations
const TARGET_STROKES_B = 6  // 3 full up+down oscillations

export default function App() {
  const leftVal = useRef(0)
  const rightVal = useRef(1)

  const [screen, setScreen] = useState('home')
  const [mode, setMode] = useState(null)
  const [modeKey, setModeKey] = useState(0)
  const [tutorialText, setTutorialText] = useState('')
  const [tutorialVisible, setTutorialVisible] = useState(false)
  const [shapeOption, setShapeOptionState] = useState(() => {
    const saved = localStorage.getItem('shapeOption') || 'a'
    return ['a', 'b', 'c', 'd'].includes(saved) ? saved : 'a'
  })
  const [colorPalette, setColorPaletteState] = useState(() => localStorage.getItem('colorPalette') || 'a')
  const [sliderLayout, setSliderLayoutState] = useState(() => {
    const saved = localStorage.getItem('sliderLayout') || 'vertical'
    return ['vertical', 'diagonal'].includes(saved) ? saved : 'vertical'
  })

  const setShapeOption = useCallback((v) => {
    localStorage.setItem('shapeOption', v)
    setShapeOptionState(v)
  }, [])

  const setColorPalette = useCallback((v) => {
    localStorage.setItem('colorPalette', v)
    setColorPaletteState(v)
  }, [])

  const setSliderLayout = useCallback((v) => {
    localStorage.setItem('sliderLayout', v)
    setSliderLayoutState(v)
  }, [])

  // Background is fully derived from the shape choice: Option D is the only
  // shape with no visible Gates/rails, so it's the only one that needs the
  // ambient background as a pacing cue. A/B/C stay background-free.
  const backgroundOption = shapeOption === 'd' ? 'a' : 'none'

  const palette = PALETTES[colorPalette]
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

  // Raw (unclamped) left-slider position, tracks thumb movement past the
  // slider's visual bounds. Used by SlowingDownController for breath timing.
  const leftRawRef = useRef(0)

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
  const recordingEnabledRef = useRef(false)
  const lastMaxTimeRef = useRef(0)
  const gateEnableTimerRef = useRef(null)
  const bbCycleRef = useRef(0)
  const bbTutorialActiveRef = useRef(false)
  const breathPhaseRef = useRef('exhale')

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
    recordingEnabledRef.current = false
    lastMaxTimeRef.current = 0
  }, [])

  const showBoxText = useCallback((text) => {
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = text
    setTutorialText(text)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
  }, [])

  const transitionBoxText = useCallback((text) => {
    clearTimeout(tutorialTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    tutorialTimerRef.current = setTimeout(() => {
      if (!bbTutorialActiveRef.current) return
      showBoxText(text)
    }, BB_TEXT_LEAD_MS)
  }, [showBoxText])

  const handleBBFirstGate = useCallback((type) => {
    // Inverted vs. GatesC's direct 'inhale'/'exhale' writes: this fires at
    // Hold-onset and holds until the opposite Hold begins, so writing the
    // opposite of type is what lines up with BackgroundA's exhale-means-
    // visible convention (visible during Hold-in, invisible during Hold-out).
    breathPhaseRef.current = type === 'inhale' ? 'exhale' : 'inhale'
    if (!bbTutorialActiveRef.current) return
    transitionBoxText(TEXTS.boxHold)
  }, [transitionBoxText])

  const handleBBLastGate = useCallback((type) => {
    if (!bbTutorialActiveRef.current) return
    if (type === 'inhale') {
      transitionBoxText(TEXTS.boxExhale)
    } else {
      bbCycleRef.current++
      if (bbCycleRef.current < 2) {
        transitionBoxText(TEXTS.boxInhale)
      } else {
        bbTutorialActiveRef.current = false
        clearTimeout(tutorialTimerRef.current)
        setTutorialVisible(false)
        tutorialVisibleRef.current = false
      }
    }
  }, [transitionBoxText])

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
    const isAmbient = shapeRef.current === 'd'
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
    const text = shapeRef.current === 'd' ? TEXTS.slowingTextDAmbient : TEXTS.slowingTextD
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = text
    setTutorialText(text)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
  }, [])

  const showSlowingTextE = useCallback(() => {
    const text = shapeRef.current === 'd' ? TEXTS.slowingTextEAmbient : TEXTS.slowingTextE
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = text
    setTutorialText(text)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
  }, [])

  const handleSlowingRecordingDone = useCallback(() => {
    const t_done = Date.now() / 1000
    const P = avgBreathRef.current
    let d = 0
    if (lastMaxTimeRef.current > 0) {
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

  const handleSlowingTextEDone = useCallback(() => {
    clearTimeout(tutorialTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
  }, [])

  const showSlowingTextF = useCallback(() => {
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = TEXTS.slowingTextF
    setTutorialText(TEXTS.slowingTextF)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
  }, [])

  const showSlowingTextG = useCallback(() => {
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = TEXTS.slowingTextG
    setTutorialText(TEXTS.slowingTextG)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
  }, [])

  const handleSlowingRampDone = useCallback(() => {
    clearTimeout(tutorialTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    tutorialTimerRef.current = setTimeout(() => showSlowingTextF(), FADE_TRANSITION_MS)
  }, [showSlowingTextF])

  const handleSlowingTextFDone = useCallback(() => {
    clearTimeout(tutorialTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    tutorialTimerRef.current = setTimeout(() => showSlowingTextG(), FADE_TRANSITION_MS)
  }, [showSlowingTextG])

  const handleSlowingShowSlider = useCallback(() => {
    const rounded = Math.round(avgBreathRef.current * 2 / 0.5) * 0.5
    setBreathLength(rounded)
    setBreathControlVisible(true)
  }, [])

  const handleSlowingTextGDone = useCallback(() => {
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

  useEffect(() => {
    if (screen !== 'experience') return
    const id = setInterval(() => {
      if (!tutorialVisibleRef.current && Date.now() - lastMoveTime.current >= STILLNESS_MS) {
        awaitingMovementRef.current = true
        setTutorialText(currentMainTextRef.current)
        setTutorialVisible(true)
        tutorialVisibleRef.current = true
      }
    }, 500)
    return () => clearInterval(id)
  }, [screen])

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
    handleMovement()
  }, [handleMovement])

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
    if (m === 'timed' || m === 'slowing' || m === 'box') { clearTimeout(breathControlTimerRef.current); setBreathControlVisible(false) }
    if (m === 'timed') setBreathLength(12)
    lastMoveTime.current = Date.now() - STILLNESS_MS - 1
    if (m === 'slowing') resetSlowingState()
    bbCycleRef.current = 0
    bbTutorialActiveRef.current = false

    clearTimeout(tutorialTimerRef.current)
    stageRef.current = 'A'
    pendingGatesFnRef.current = null
    awaitingMovementRef.current = false
    rightStrokeCountRef.current = 0
    rightDirectionRef.current = 0
    rightExtremeRef.current = null
    textAFadeStartedRef.current = false
    textBFadeStartedRef.current = false
    currentMainTextRef.current = TEXT_B
    setTutorialText(TEXT_A)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    if (m === 'timed') pendingGatesFnRef.current = showGatesText
    if (m === 'slowing') pendingGatesFnRef.current = showSlowingTextC
    if (m === 'box') pendingGatesFnRef.current = () => {
      bbCycleRef.current = 0
      bbTutorialActiveRef.current = true
      gatesEnabledRef.current = true
      showBoxText(TEXTS.boxInhale)
    }

    setMode(m)
    setModeKey(k => k + 1)
    setScreen('experience')
  }, [resetSlowingState, showGatesText, showSlowingTextC, showBoxText])

  const handleContinue = useCallback(() => {
    if (!mode) {
      handleSelectMode('basic')
    } else {
      setScreen('experience')
    }
  }, [mode, handleSelectMode])

  const handleRestart = useCallback(() => {
    handleSelectMode(mode)
  }, [mode, handleSelectMode])

  const handleBackFromExperience = useCallback(() => {
    gatesEnabledRef.current = false
    clearTimeout(tutorialTimerRef.current)
    clearTimeout(gateEnableTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    setMode(null)
    setScreen('home')
  }, [])

  if (screen === 'home') {
    return (
      <HomeScreen
        onPersonalize={() => setScreen('personalize')}
        onSelectMode={() => setScreen('selectMode')}
        onSliderLayouts={() => setScreen('sliderLayouts')}
        palette={palette}
      />
    )
  }
  if (screen === 'selectMode') {
    return <SelectModeScreen onSelect={handleSelectMode} onHome={() => setScreen('home')} palette={palette} />
  }
  if (screen === 'sliderLayouts') {
    return (
      <SliderLayoutsScreen
        selected={sliderLayout}
        onSelect={setSliderLayout}
        onHome={() => setScreen('home')}
        palette={palette}
      />
    )
  }
  if (screen === 'personalize') {
    return (
      <PersonalizeScreen
        onShape={() => setScreen('shape')}
        onColor={() => setScreen('color')}
        onSelectMode={() => setScreen('selectMode')}
        onContinue={handleContinue}
        palette={palette}
      />
    )
  }
  if (screen === 'shape') {
    return (
      <ShapeOptionsScreen
        selected={shapeOption}
        onSelect={setShapeOption}
        onBack={() => setScreen('personalize')}
        onSelectMode={() => setScreen('selectMode')}
        onContinue={handleContinue}
        palette={palette}
      />
    )
  }
  if (screen === 'color') {
    return (
      <ColorOptionsScreen
        selected={colorPalette}
        onSelect={setColorPalette}
        onBack={() => setScreen('personalize')}
        onSelectMode={() => setScreen('selectMode')}
        onContinue={handleContinue}
        palette={palette}
      />
    )
  }
  const hasGates = mode === 'timed' || mode === 'slowing' || mode === 'box'
  const MorphComponent = shapeOption === 'b' ? MorphB : shapeOption === 'c' || shapeOption === 'd' ? MorphC : MorphA
  const GatesComponent = shapeOption === 'b' ? GatesB : shapeOption === 'c' ? GatesC : shapeOption === 'd' ? GatesHeadless : GatesA
  const BoxGatesComponent = shapeOption === 'b' ? GatesBoxBreathingB : shapeOption === 'c' || shapeOption === 'd' ? GatesBoxBreathingC : GatesBoxBreathingA

  return (
    <div key={modeKey} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 3.5, 5], fov: 50 }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <color attach="background" args={[palette.background]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <MorphComponent leftVal={leftVal} rightVal={rightVal} palette={palette} />
        {backgroundOption === 'a' && <BackgroundA gateColor={palette.gateColor} emissiveColor={palette.morphEmissive} breathPhaseRef={breathPhaseRef} gatesEnabledRef={gatesEnabledRef} spawnIntervalRef={spawnIntervalRef} />}
        <EffectComposer>
          <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.5} />
        </EffectComposer>
        {hasGates && mode !== 'box' && (
          <GatesComponent
            gatesEnabledRef={gatesEnabledRef}
            spawnIntervalRef={spawnIntervalRef}
            gateColor={palette.gateColor}
            emissiveColor={palette.morphEmissive}
            breathPhaseRef={breathPhaseRef}
          />
        )}
        {mode === 'box' && hasGates && (
          <BoxGatesComponent
            gatesEnabledRef={gatesEnabledRef}
            spawnIntervalRef={spawnIntervalRef}
            gateColor={palette.gateColor}
            emissiveColor={palette.morphEmissive}
            onFirstGate={handleBBFirstGate}
            onLastGate={handleBBLastGate}
          />
        )}
        {mode === 'slowing' && (
          <SlowingDownController
            leftRawRef={leftRawRef}
            spawnIntervalRef={spawnIntervalRef}
            recordingEnabledRef={recordingEnabledRef}
            lastMaxTimeRef={lastMaxTimeRef}
            onGatesReady={handleSlowingRecordingDone}
            onTextDone={handleSlowingTextDDone}
            onTextEDone={handleSlowingTextEDone}
            onRampDone={handleSlowingRampDone}
            onTextFDone={handleSlowingTextFDone}
            onShowSlider={handleSlowingShowSlider}
            onTextGDone={handleSlowingTextGDone}
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
            ? <SlidersDiagonal onLeft={setLeft} onRight={setRight} leftRawRef={leftRawRef} />
            : <Sliders onLeft={setLeft} onRight={setRight} leftRawRef={leftRawRef} />}
        </div>
        <TutorialText text={tutorialText} visible={tutorialVisible} />
        {(mode === 'timed' || mode === 'slowing') && (
          <BreathLengthControl
            breathLength={breathLength}
            onChange={handleBreathChange}
            visible={breathControlVisible}
          />
        )}
        {sliderLayout === 'diagonal' ? (
          <>
            <button onClick={handleBackFromExperience} style={{ ...navPillStyle, position: 'absolute', bottom: 16, left: 16 }}>
              Home
            </button>
            <button onClick={handleRestart} style={{ ...navPillStyle, position: 'absolute', bottom: 16, right: 16 }}>
              Restart
            </button>
          </>
        ) : (
          <div style={{
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
