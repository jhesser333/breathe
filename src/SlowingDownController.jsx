import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const DEADBAND = 0.08        // min swing (as a fraction of slider height) to count as a real reversal
const MIN_BREATH_SECONDS = 1.5
const MIN_BREATHS = 5
const RAMP_SECONDS = 60

export default function SlowingDownController({
  leftRawRef, gatesEnabledRef, spawnIntervalRef, onGatesReady,
  prevRawRef, directionRef, extremeValueRef, extremeTimeRef,
  lastMinTimeRef, hadMaxRef, breathsRef, phaseRef, avgBreathRef, phase2StartRef,
}) {
  const onGatesReadyRef = useRef(onGatesReady)
  onGatesReadyRef.current = onGatesReady

  useFrame(() => {
    const now = Date.now() / 1000
    const raw = leftRawRef.current

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
        // Risen out of the deadband: the starting point was effectively a low (min).
        lastMinTimeRef.current = extremeTimeRef.current
        extremeValueRef.current = raw
        extremeTimeRef.current = now
        directionRef.current = 1
      } else if (raw <= extremeValueRef.current - DEADBAND) {
        // Fallen out of the deadband: the starting point was effectively a high (max).
        extremeValueRef.current = raw
        extremeTimeRef.current = now
        directionRef.current = -1
      }
    } else if (directionRef.current === 1) {
      if (raw > extremeValueRef.current) {
        extremeValueRef.current = raw
        extremeTimeRef.current = now
      } else if (raw <= extremeValueRef.current - DEADBAND) {
        // Confirmed reversal down: the tracked extreme was a local max.
        hadMaxRef.current = true
        extremeValueRef.current = raw
        extremeTimeRef.current = now
        directionRef.current = -1
      }
    } else {
      if (raw < extremeValueRef.current) {
        extremeValueRef.current = raw
        extremeTimeRef.current = now
      } else if (raw >= extremeValueRef.current + DEADBAND) {
        // Confirmed reversal up: the tracked extreme was a local min — one full breath cycle complete.
        if (hadMaxRef.current && lastMinTimeRef.current !== null) {
          const duration = extremeTimeRef.current - lastMinTimeRef.current
          if (duration >= MIN_BREATH_SECONDS) {
            breathsRef.current.push(duration)
          }
        }
        lastMinTimeRef.current = extremeTimeRef.current
        hadMaxRef.current = false
        extremeValueRef.current = raw
        extremeTimeRef.current = now
        directionRef.current = 1
      }
    }

    if (phaseRef.current === 'learning') {
      const count = breathsRef.current.length
      if (count >= MIN_BREATHS) {
        const last2 = breathsRef.current.slice(-2)
        const avg = last2.reduce((a, b) => a + b, 0) / last2.length
        avgBreathRef.current = avg
        spawnIntervalRef.current = avg
        phase2StartRef.current = now
        phaseRef.current = 'gates'
        gatesEnabledRef.current = true
        onGatesReadyRef.current()
      }
    } else {
      // Linearly ramp spawn interval from avg → avg*2 over RAMP_SECONDS
      const t = Math.min(Math.max((now - phase2StartRef.current) / RAMP_SECONDS, 0), 1)
      spawnIntervalRef.current = avgBreathRef.current * (1 + t)
    }
  })

  return null
}
