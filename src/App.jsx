import { useRef, useCallback, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import Morph from './Morph'
import Gates from './Gates'
import Sliders from './Sliders'
import HomeScreen from './HomeScreen'
import TutorialText from './TutorialText'
import SlowingDownController from './SlowingDownController'

const TEXTS = {
  basic: 'Move the sliders up and down along with your breath',
  timed: 'Move the sliders up and down with your breath. Time your breathing so the object fits through the gates',
  slowing_learn: 'Move the sliders up and down along with your breath',
  slowing_gates: 'Now begin to time your breath so the object fits through the gates',
}

const DISPLAY_MS = 5000
const STILLNESS_MS = 10000

export default function App() {
  const leftVal = useRef(0)
  const rightVal = useRef(1)

  const [mode, setMode] = useState(null)
  const [tutorialText, setTutorialText] = useState('')
  const [tutorialVisible, setTutorialVisible] = useState(false)

  const lastMoveTime = useRef(0)
  const tutorialVisibleRef = useRef(false)
  const tutorialForcedRef = useRef(false)
  const displayTimerRef = useRef(null)
  const gatesEnabledRef = useRef(false)
  const spawnIntervalRef = useRef(12)

  // Show current tutorialText for DISPLAY_MS then hide.
  // Pass { force: true } to keep text visible even while sliders are moving.
  const showTutorial = useCallback((opts = {}) => {
    tutorialForcedRef.current = opts.force ?? false
    setTutorialVisible(true)
    tutorialVisibleRef.current = true
    clearTimeout(displayTimerRef.current)
    displayTimerRef.current = setTimeout(() => {
      setTutorialVisible(false)
      tutorialVisibleRef.current = false
      tutorialForcedRef.current = false
    }, DISPLAY_MS)
  }, [])

  // Stillness check: if text is hidden and sliders haven't moved for STILLNESS_MS, show again
  useEffect(() => {
    if (!mode) return
    const id = setInterval(() => {
      if (!tutorialVisibleRef.current && Date.now() - lastMoveTime.current >= STILLNESS_MS) {
        showTutorial()
      }
    }, 500)
    return () => clearInterval(id)
  }, [mode, showTutorial])

  // Cleanup display timer on unmount
  useEffect(() => () => clearTimeout(displayTimerRef.current), [])

  const setLeft = useCallback((v) => {
    leftVal.current = v
    lastMoveTime.current = Date.now()
    if (tutorialVisibleRef.current && !tutorialForcedRef.current) {
      clearTimeout(displayTimerRef.current)
      setTutorialVisible(false)
      tutorialVisibleRef.current = false
    }
  }, [])

  const setRight = useCallback((v) => {
    rightVal.current = v
    lastMoveTime.current = Date.now()
    if (tutorialVisibleRef.current && !tutorialForcedRef.current) {
      clearTimeout(displayTimerRef.current)
      setTutorialVisible(false)
      tutorialVisibleRef.current = false
    }
  }, [])

  const handleSelectMode = useCallback((m) => {
    gatesEnabledRef.current = m === 'timed'
    spawnIntervalRef.current = m === 'timed' ? 12 : 8
    lastMoveTime.current = Date.now() - STILLNESS_MS - 1 // treat as already-still
    clearTimeout(displayTimerRef.current)
    const text = m === 'timed' ? TEXTS.timed : TEXTS[m === 'slowing' ? 'slowing_learn' : 'basic']
    setTutorialText(text)
    setMode(m)
    // show immediately on entry — use timeout to let text state settle first
    setTimeout(() => showTutorial(), 0)
  }, [showTutorial])

  // Called by SlowingDownController when 5 breath cycles are recorded
  const handleGatesReady = useCallback(() => {
    setTutorialText(TEXTS.slowing_gates)
    setTimeout(() => showTutorial({ force: true }), 0)
  }, [showTutorial])

  const handleBack = useCallback(() => {
    gatesEnabledRef.current = false
    clearTimeout(displayTimerRef.current)
    setTutorialVisible(false)
    tutorialVisibleRef.current = false
    tutorialForcedRef.current = false
    setMode(null)
  }, [])

  if (!mode) {
    return <HomeScreen onSelect={handleSelectMode} />
  }

  const hasGates = mode === 'timed' || mode === 'slowing'

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 2.9, 5], fov: 50 }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <color attach="background" args={['#1a1028']} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Morph leftVal={leftVal} rightVal={rightVal} />
        {hasGates && (
          <Gates gatesEnabledRef={gatesEnabledRef} spawnIntervalRef={spawnIntervalRef} />
        )}
        {mode === 'slowing' && (
          <SlowingDownController
            leftVal={leftVal}
            gatesEnabledRef={gatesEnabledRef}
            spawnIntervalRef={spawnIntervalRef}
            onGatesReady={handleGatesReady}
          />
        )}
      </Canvas>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
          <Sliders onLeft={setLeft} onRight={setRight} />
        </div>
        <TutorialText text={tutorialText} visible={tutorialVisible} />
        <button
          onClick={handleBack}
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
      </div>
    </div>
  )
}
