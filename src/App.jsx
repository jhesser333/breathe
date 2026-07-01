import { useRef, useCallback, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import MorphA from './MorphA'
import MorphB from './MorphB'
import MorphC from './MorphC'
import MorphD from './MorphD'
import MorphE from './MorphE'
import GatesA from './GatesA'
import GatesB from './GatesB'
import GatesC from './GatesC'
import GatesD from './GatesD'
import GatesE from './GatesE'
import Sliders from './Sliders'
import HomeScreen from './HomeScreen'
import PersonalizeScreen from './PersonalizeScreen'
import ShapeOptionsScreen from './ShapeOptionsScreen'
import ColorOptionsScreen from './ColorOptionsScreen'
import TutorialText from './TutorialText'
import SlowingDownController from './SlowingDownController'
import BreathLengthControl from './BreathLengthControl'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { PALETTES } from './palettes'
import { TEXT_A, TEXT_B, TEXTS } from './copy'

const STILLNESS_MS = 10000
const MOVEMENT_FADE_DELAY_MS = 2000
const TEXT_C_DISPLAY_MS = 5000
const FADE_TRANSITION_MS = 2000
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
  const [shapeOption, setShapeOptionState] = useState(() => localStorage.getItem('shapeOption') || 'a')
  const [colorPalette, setColorPaletteState] = useState(() => localStorage.getItem('colorPalette') || 'a')

  const setShapeOption = useCallback((v) => {
    localStorage.setItem('shapeOption', v)
    setShapeOptionState(v)
  }, [])

  const setColorPalette = useCallback((v) => {
    localStorage.setItem('colorPalette', v)
    setColorPaletteState(v)
  }, [])

  const palette = PALETTES[colorPalette]

  const lastMoveTime = useRef(0)
  const tutorialVisibleRef = useRef(false)
  const tutorialTimerRef = useRef(null)
  const awaitingMovementRef = useRef(false)
  const stageRef = useRef('done')
  const pendingGatesTextRef = useRef(false)
  const currentMainTextRef = useRef('')
  const gatesEnabledRef = useRef(false)
  const spawnIntervalRef = useRef(12)
  const [breathLength, setBreathLength] = useState(12)

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
  const phaseRef = useRef('learning')
  const avgBreathRef = useRef(0)
  const phase2StartRef = useRef(0)

  const resetSlowingState = useCallback(() => {
    prevRawRef.current = null
    directionRef.current = 0
    extremeValueRef.current = 0
    extremeTimeRef.current = 0
    lastMinTimeRef.current = null
    hadMaxRef.current = false
    breathsRef.current = []
    phaseRef.current = 'learning'
    avgBreathRef.current = 0
    phase2StartRef.current = 0
  }, [])

  const showGatesText = useCallback(() => {
    clearTimeout(tutorialTimerRef.current)
    currentMainTextRef.current = TEXTS.gates
    setTutorialText(TEXTS.gates)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    awaitingMovementRef.current = false
    tutorialTimerRef.current = setTimeout(() => {
      setTutorialVisible(false)
      tutorialVisibleRef.current = false
    }, TEXT_C_DISPLAY_MS)
  }, [])

  const requestGatesText = useCallback(() => {
    if (stageRef.current === 'done') {
      showGatesText()
    } else {
      pendingGatesTextRef.current = true
    }
  }, [showGatesText])

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
      if (pendingGatesTextRef.current) {
        pendingGatesTextRef.current = false
        showGatesText()
      }
    }, FADE_TRANSITION_MS)
  }, [showGatesText])

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
    gatesEnabledRef.current = m === 'timed'
    spawnIntervalRef.current = m === 'timed' ? 12 : 8
    if (m === 'timed') setBreathLength(12)
    lastMoveTime.current = Date.now() - STILLNESS_MS - 1
    if (m === 'slowing') resetSlowingState()

    clearTimeout(tutorialTimerRef.current)
    stageRef.current = 'A'
    pendingGatesTextRef.current = false
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
    if (m === 'timed') pendingGatesTextRef.current = true

    setMode(m)
    setModeKey(k => k + 1)
    setScreen('experience')
  }, [resetSlowingState])

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
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    setMode(null)
    setScreen('home')
  }, [])

  if (screen === 'home') {
    return <HomeScreen onSelect={handleSelectMode} onPersonalize={() => setScreen('personalize')} palette={palette} />
  }
  if (screen === 'personalize') {
    return (
      <PersonalizeScreen
        onShape={() => setScreen('shape')}
        onColor={() => setScreen('color')}
        onBack={() => setScreen('home')}
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
        onHome={() => setScreen('home')}
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
        onHome={() => setScreen('home')}
        onContinue={handleContinue}
        palette={palette}
      />
    )
  }

  const hasGates = mode === 'timed' || mode === 'slowing'
  const MorphComponent = shapeOption === 'b' ? MorphB : shapeOption === 'c' ? MorphC : shapeOption === 'd' ? MorphD : shapeOption === 'e' ? MorphE : MorphA
  const GatesComponent = shapeOption === 'b' ? GatesB : shapeOption === 'c' ? GatesC : shapeOption === 'd' ? GatesD : shapeOption === 'e' ? GatesE : GatesA

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
        <EffectComposer>
          <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.5} />
        </EffectComposer>
        {hasGates && (
          <GatesComponent
            gatesEnabledRef={gatesEnabledRef}
            spawnIntervalRef={spawnIntervalRef}
            gateColor={palette.gateColor}
            emissiveColor={palette.morphEmissive}
          />
        )}
        {mode === 'slowing' && (
          <SlowingDownController
            leftRawRef={leftRawRef}
            gatesEnabledRef={gatesEnabledRef}
            spawnIntervalRef={spawnIntervalRef}
            onGatesReady={requestGatesText}
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
          <Sliders onLeft={setLeft} onRight={setRight} leftRawRef={leftRawRef} />
        </div>
        <TutorialText text={tutorialText} visible={tutorialVisible} />
        {mode === 'timed' && (
          <BreathLengthControl
            breathLength={breathLength}
            onChange={handleBreathChange}
          />
        )}
        <div style={{
          position: 'absolute', bottom: 16, left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column',
          gap: 20, alignItems: 'center',
          pointerEvents: 'auto',
        }}>
          {[
            { label: 'Personalize', onClick: () => setScreen('personalize') },
            { label: 'Select Mode', onClick: handleBackFromExperience },
            { label: 'Restart', onClick: handleRestart },
          ].map(({ label, onClick }) => (
            <button key={label} onClick={onClick} style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 8, color: 'rgba(255,255,255,0.7)',
              padding: '8px 14px', fontSize: 13,
              cursor: 'pointer', fontFamily: 'sans-serif',
              letterSpacing: '0.03em', whiteSpace: 'nowrap',
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
