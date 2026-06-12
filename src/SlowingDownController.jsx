import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const LOW_THRESHOLD = 0.15   // "at the bottom"
const HIGH_THRESHOLD = 0.5   // must reach this height to count as a real breath
const MIN_BREATH_SECONDS = 1.5
const MIN_BREATHS = 3
const RAMP_SECONDS = 60

export default function SlowingDownController({
  leftVal, gatesEnabledRef, spawnIntervalRef, onGatesReady,
  prevLeftRef, cycleStartRef, hadPeakRef, breathsRef, phaseRef, avgBreathRef, phase2StartRef,
}) {
  const onGatesReadyRef = useRef(onGatesReady)
  onGatesReadyRef.current = onGatesReady

  useFrame(() => {
    const now = Date.now() / 1000

    if (prevLeftRef.current === null) {
      prevLeftRef.current = leftVal.current
      return
    }

    const lv = leftVal.current
    const prev = prevLeftRef.current

    // Slider reached top (inhale peak)
    if (prev < HIGH_THRESHOLD && lv >= HIGH_THRESHOLD && cycleStartRef.current !== null) {
      hadPeakRef.current = true
    }

    // Slider returned to bottom (cycle end / next cycle start)
    if (prev > LOW_THRESHOLD && lv <= LOW_THRESHOLD) {
      if (cycleStartRef.current !== null && hadPeakRef.current) {
        const duration = now - cycleStartRef.current
        if (duration >= MIN_BREATH_SECONDS) {
          breathsRef.current.push(duration)
        }
      }
      // Start tracking the next cycle from this bottom point
      cycleStartRef.current = now
      hadPeakRef.current = false
    }

    prevLeftRef.current = lv

    if (phaseRef.current === 'learning') {
      const count = breathsRef.current.length
      if (count >= MIN_BREATHS) {
        const avg = breathsRef.current.reduce((a, b) => a + b, 0) / count
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
