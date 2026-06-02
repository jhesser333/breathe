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

const STILLNESS_MS = 10000
const FORCE_VISIBLE_MS = 10000

export default function App() {
  const leftVal = useRef(0)
  const rightVal = useRef(0)

  const [mode, setMode] = useState(null)
  const [tutorialText, setTutorialText] = useState('')
  const [tutorialShow, setTutorialShow] = useState(true)
  const [tutorialForce, setTutorialForce] = useState(false)

  const lastMoveTime = useRef(0)
  const isForcedRef = useRef(false)
  const gatesEnabledRef = useRef(false)
  const spawnIntervalRef = useRef(8)

  // Keep isForcedRef in sync so setLeft/setRight callbacks don't go stale
  useEffect(() => { isForcedRef.current = tutorialForce }, [tutorialForce])

  const setLeft = useCallback((v) => {
    leftVal.current = v
    lastMoveTime.current = Date.now()
    if (!isForcedRef.current) setTutorialShow(false)
  }, [])

  const setRight = useCallback((v) => {
    rightVal.current = v
    lastMoveTime.current = Date.now()
    if (!isForcedRef.current) setTutorialShow(false)
  }, [])

  // Check for 10s of slider stillness → fade text back in
  useEffect(() => {
    if (!mode) return
    const id = setInterval(() => {
      if (Date.now() - lastMoveTime.current >= STILLNESS_MS) {
        setTutorialShow(true)
      }
    }, 500)
    return () => clearInterval(id)
  }, [mode])

  // Force-visible timer: after 10s, always hide then let stillness rules take over
  useEffect(() => {
    if (!tutorialForce) return
    const id = setTimeout(() => {
      setTutorialForce(false)
      isForcedRef.current = false
      setTutorialShow(false)
    }, FORCE_VISIBLE_MS)
    return () => clearTimeout(id)
  }, [tutorialForce])

  const handleSelectMode = useCallback((m) => {
    gatesEnabledRef.current = m === 'timed'
    spawnIntervalRef.current = 8
    lastMoveTime.current = 0
    isForcedRef.current = true
    setTutorialForce(true)
    setTutorialShow(true)
    setTutorialText(m === 'timed' ? TEXTS.timed : TEXTS[m === 'slowing' ? 'slowing_learn' : 'basic'])
    setMode(m)
  }, [])

  // Called by SlowingDownController when conditions are met
  const handleGatesReady = useCallback(() => {
    setTutorialText(TEXTS.slowing_gates)
    setTutorialForce(true)
    isForcedRef.current = true
    setTutorialShow(true)
  }, [])

  const handleBack = useCallback(() => {
    gatesEnabledRef.current = false
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
        <color attach="background" args={['#111111']} />
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
        <TutorialText
          text={tutorialText}
          visible={tutorialShow || tutorialForce}
        />
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
