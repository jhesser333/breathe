import { useRef, useCallback, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import MorphA from './MorphA'
import MorphB from './MorphB'
import GatesA from './GatesA'
import GatesB from './GatesB'
import Sliders from './Sliders'
import HomeScreen from './HomeScreen'
import PersonalizeScreen from './PersonalizeScreen'
import ShapeOptionsScreen from './ShapeOptionsScreen'
import ColorOptionsScreen from './ColorOptionsScreen'
import TutorialText from './TutorialText'
import SlowingDownController from './SlowingDownController'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { PALETTES } from './palettes'
import { TEXT_A, TEXT_B, TEXTS } from './copy'

const STILLNESS_MS = 10000
const MOVEMENT_FADE_DELAY_MS = 2000
const TEXT_B_DISPLAY_MS = 3000
const TEXT_C_DISPLAY_MS = 5000
const FADE_TRANSITION_MS = 1500

export default function App() {
  const leftVal = useRef(0)
  const rightVal = useRef(1)

  const [screen, setScreen] = useState('home')
  const [mode, setMode] = useState(null)
  const [levelKey, setLevelKey] = useState(0)
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
  const skipMovementRef = useRef(0)
  const stageRef = useRef('done')
  const pendingGatesTextRef = useRef(false)
  const currentMainTextRef = useRef('')
  const gatesEnabledRef = useRef(false)
  const spawnIntervalRef = useRef(12)

  // Slowing Down breath-tracking state, lifted here so it survives
  // SlowingDownController unmounting/remounting (e.g. when visiting Personalize)
  const prevLeftRef = useRef(null)
  const cycleStartRef = useRef(null)
  const hadPeakRef = useRef(false)
  const breathsRef = useRef([])
  const phaseRef = useRef('learning')
  const avgBreathRef = useRef(0)
  const phase2StartRef = useRef(0)

  const resetSlowingState = useCallback(() => {
    prevLeftRef.current = null
    cycleStartRef.current = null
    hadPeakRef.current = false
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
    tutorialTimerRef.current = setTimeout(() => {
      setTutorialVisible(false)
      tutorialVisibleRef.current = false
      tutorialTimerRef.current = setTimeout(() => {
        stageRef.current = 'done'
        if (pendingGatesTextRef.current) {
          pendingGatesTextRef.current = false
          showGatesText()
        }
      }, FADE_TRANSITION_MS)
    }, TEXT_B_DISPLAY_MS)
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

  const setLeft = useCallback((v) => {
    leftVal.current = v
    lastMoveTime.current = Date.now()
    if (skipMovementRef.current > 0) {
      skipMovementRef.current -= 1
    } else {
      handleMovement()
    }
  }, [handleMovement])

  const setRight = useCallback((v) => {
    rightVal.current = v
    lastMoveTime.current = Date.now()
    if (skipMovementRef.current > 0) {
      skipMovementRef.current -= 1
    } else {
      handleMovement()
    }
  }, [handleMovement])

  const handleSelectMode = useCallback((m) => {
    gatesEnabledRef.current = m === 'timed'
    spawnIntervalRef.current = m === 'timed' ? 12 : 8
    lastMoveTime.current = Date.now() - STILLNESS_MS - 1
    if (m === 'slowing') resetSlowingState()

    clearTimeout(tutorialTimerRef.current)
    stageRef.current = 'A'
    pendingGatesTextRef.current = false
    awaitingMovementRef.current = true
    skipMovementRef.current = 2
    currentMainTextRef.current = TEXT_B
    setTutorialText(TEXT_A)
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    if (m === 'timed') pendingGatesTextRef.current = true

    setMode(m)
    setLevelKey(k => k + 1)
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
    return <HomeScreen onSelect={handleSelectMode} onPersonalize={() => setScreen('personalize')} />
  }
  if (screen === 'personalize') {
    return (
      <PersonalizeScreen
        onShape={() => setScreen('shape')}
        onColor={() => setScreen('color')}
        onBack={() => setScreen('home')}
        onContinue={handleContinue}
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
      />
    )
  }

  const hasGates = mode === 'timed' || mode === 'slowing'
  const MorphComponent = shapeOption === 'b' ? MorphB : MorphA
  const GatesComponent = shapeOption === 'b' ? GatesB : GatesA

  return (
    <div key={levelKey} style={{ width: '100%', height: '100%', position: 'relative' }}>
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
            leftVal={leftVal}
            gatesEnabledRef={gatesEnabledRef}
            spawnIntervalRef={spawnIntervalRef}
            onGatesReady={requestGatesText}
            prevLeftRef={prevLeftRef}
            cycleStartRef={cycleStartRef}
            hadPeakRef={hadPeakRef}
            breathsRef={breathsRef}
            phaseRef={phaseRef}
            avgBreathRef={avgBreathRef}
            phase2StartRef={phase2StartRef}
          />
        )}
      </Canvas>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
          <Sliders onLeft={setLeft} onRight={setRight} />
        </div>
        <TutorialText text={tutorialText} visible={tutorialVisible} />
        <button
          onClick={handleBackFromExperience}
          style={{
            position: 'absolute', top: 16, left: 16,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 8, color: 'rgba(255,255,255,0.7)',
            padding: '8px 14px', fontSize: 13,
            cursor: 'pointer', pointerEvents: 'auto',
            fontFamily: 'sans-serif', letterSpacing: '0.03em',
          }}
        >
          ← Home
        </button>
        <button
          onClick={handleRestart}
          style={{
            position: 'absolute', top: 16, right: 16,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 8, color: 'rgba(255,255,255,0.7)',
            padding: '8px 14px', fontSize: 13,
            cursor: 'pointer', pointerEvents: 'auto',
            fontFamily: 'sans-serif', letterSpacing: '0.03em',
          }}
        >
          Restart
        </button>
        <button
          onClick={() => setScreen('personalize')}
          style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 8, color: 'rgba(255,255,255,0.7)',
            padding: '8px 14px', fontSize: 13,
            cursor: 'pointer', pointerEvents: 'auto',
            fontFamily: 'sans-serif', letterSpacing: '0.03em',
          }}
        >
          Personalize
        </button>
      </div>
    </div>
  )
}
