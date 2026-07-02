import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const DEADBAND           = 0.08
const MIN_BREATH_SECONDS = 1.5
const SLACK_FACTOR       = 1.15  // start gates 15% slower than recorded pace
const WARMUP_CYCLES      = 3   // skip first N cycles after Text C appears
const RECORD_CYCLES      = 2   // record next N cycles to compute Initial Pace
const TEXT_D_CYCLES      = 3   // dismiss Text D after N post-gate cycles
const TEXT_E_CYCLES      = 4   // dismiss Text E after N more post-gate cycles
const RAMP_SECONDS       = 60

export default function SlowingDownController({
  leftRawRef, spawnIntervalRef, recordingEnabledRef, lastMaxTimeRef, onGatesReady, onTextDone, onTextEDone,
  prevRawRef, directionRef, extremeValueRef, extremeTimeRef,
  lastMinTimeRef, hadMaxRef, breathsRef, phaseRef, avgBreathRef, phase2StartRef,
}) {
  const onGatesReadyRef = useRef(onGatesReady)
  onGatesReadyRef.current = onGatesReady
  const onTextDoneRef = useRef(onTextDone)
  onTextDoneRef.current = onTextDone
  const onTextEDoneRef = useRef(onTextEDone)
  onTextEDoneRef.current = onTextEDone

  // Local refs — reset each time the component mounts (Personalize navigation)
  const warmupCountRef    = useRef(0)
  const postGateCyclesRef = useRef(0)
  const textDFiredRef     = useRef(false)
  const textEFiredRef     = useRef(false)

  useFrame(() => {
    const now = Date.now() / 1000
    const raw = leftRawRef.current

    // Transition idle → warmup when App.jsx signals Text C has appeared
    if (phaseRef.current === 'idle') {
      if (!recordingEnabledRef.current) return
      phaseRef.current = 'warmup'
      prevRawRef.current = raw
      directionRef.current = 0
      extremeValueRef.current = raw
      extremeTimeRef.current = now
      lastMinTimeRef.current = null
      hadMaxRef.current = false
      warmupCountRef.current = 0
      return
    }

    if (prevRawRef.current === null) {
      prevRawRef.current = raw
      extremeValueRef.current = raw
      extremeTimeRef.current = now
      return
    }
    prevRawRef.current = raw

    // Zigzag reversal detection on the raw (unclamped) thumb position.
    // direction: 0 = not yet established, 1 = tracking toward a max, -1 = tracking toward a min
    if (directionRef.current === 0) {
      if (raw >= extremeValueRef.current + DEADBAND) {
        lastMinTimeRef.current = extremeTimeRef.current
        extremeValueRef.current = raw
        extremeTimeRef.current = now
        directionRef.current = 1
      } else if (raw <= extremeValueRef.current - DEADBAND) {
        extremeValueRef.current = raw
        extremeTimeRef.current = now
        directionRef.current = -1
      }
    } else if (directionRef.current === 1) {
      if (raw > extremeValueRef.current) {
        extremeValueRef.current = raw
        extremeTimeRef.current = now
      } else if (raw <= extremeValueRef.current - DEADBAND) {
        hadMaxRef.current = true
        lastMaxTimeRef.current = extremeTimeRef.current  // save inhale peak time before overwrite
        extremeValueRef.current = raw
        extremeTimeRef.current = now
        directionRef.current = -1
      }
    } else {
      if (raw < extremeValueRef.current) {
        extremeValueRef.current = raw
        extremeTimeRef.current = now
      } else if (raw >= extremeValueRef.current + DEADBAND) {
        // Confirmed reversal up: tracked extreme was a local min — one full breath cycle complete.
        const cycleValid = hadMaxRef.current && lastMinTimeRef.current !== null
        const duration = extremeTimeRef.current - lastMinTimeRef.current

        if (cycleValid && duration >= MIN_BREATH_SECONDS) {
          if (phaseRef.current === 'warmup') {
            warmupCountRef.current++
            if (warmupCountRef.current >= WARMUP_CYCLES) phaseRef.current = 'recording'
          } else if (phaseRef.current === 'recording') {
            breathsRef.current.push(duration)
            if (breathsRef.current.length >= RECORD_CYCLES) {
              const avg = breathsRef.current.reduce((a, b) => a + b, 0) / breathsRef.current.length
              avgBreathRef.current = avg * SLACK_FACTOR
              spawnIntervalRef.current = avg * SLACK_FACTOR
              phaseRef.current = 'gates'
              onGatesReadyRef.current()
            }
          } else if (phaseRef.current === 'gates') {
            postGateCyclesRef.current++
            if (!textDFiredRef.current && postGateCyclesRef.current >= TEXT_D_CYCLES) {
              textDFiredRef.current = true
              onTextDoneRef.current()
            } else if (textDFiredRef.current && !textEFiredRef.current && postGateCyclesRef.current >= TEXT_D_CYCLES + TEXT_E_CYCLES) {
              textEFiredRef.current = true
              onTextEDoneRef.current()
            }
          }
        }

        lastMinTimeRef.current = extremeTimeRef.current
        hadMaxRef.current = false
        extremeValueRef.current = raw
        extremeTimeRef.current = now
        directionRef.current = 1
      }
    }

    if (phaseRef.current === 'gates') {
      const t = Math.min(Math.max((now - phase2StartRef.current) / RAMP_SECONDS, 0), 1)
      spawnIntervalRef.current = avgBreathRef.current * (1 + t)
    }
  })

  return null
}
