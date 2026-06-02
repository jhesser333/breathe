import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const LOW_THRESHOLD = 0.15   // "at the bottom"
const HIGH_THRESHOLD = 0.5   // must reach this height to count as a real breath
const MIN_BREATH_SECONDS = 1.5
const MIN_BREATHS = 3
const RAMP_SECONDS = 60

export default function SlowingDownController({ leftVal, gatesEnabledRef, spawnIntervalRef, onGatesReady }) {
  const prevLeft = useRef(null)
  const cycleStart = useRef(null)
  const hadPeak = useRef(false)
  const breaths = useRef([])
  const phase = useRef('learning')
  const avgBreath = useRef(0)
  const phase2Start = useRef(0)
  const onGatesReadyRef = useRef(onGatesReady)
  onGatesReadyRef.current = onGatesReady

  useFrame((state) => {
    const now = state.clock.elapsedTime

    if (prevLeft.current === null) {
      prevLeft.current = leftVal.current
      return
    }

    const lv = leftVal.current
    const prev = prevLeft.current

    // Slider reached top (inhale peak)
    if (prev < HIGH_THRESHOLD && lv >= HIGH_THRESHOLD && cycleStart.current !== null) {
      hadPeak.current = true
    }

    // Slider returned to bottom (cycle end / next cycle start)
    if (prev > LOW_THRESHOLD && lv <= LOW_THRESHOLD) {
      if (cycleStart.current !== null && hadPeak.current) {
        const duration = now - cycleStart.current
        if (duration >= MIN_BREATH_SECONDS) {
          breaths.current.push(duration)
        }
      }
      // Start tracking the next cycle from this bottom point
      cycleStart.current = now
      hadPeak.current = false
    }

    prevLeft.current = lv

    if (phase.current === 'learning') {
      const count = breaths.current.length
      if (count >= MIN_BREATHS) {
        const avg = breaths.current.reduce((a, b) => a + b, 0) / count
        avgBreath.current = avg
        spawnIntervalRef.current = avg
        phase2Start.current = now
        phase.current = 'gates'
        gatesEnabledRef.current = true
        onGatesReadyRef.current()
      }
    } else {
      // Linearly ramp spawn interval from avg → avg*2 over RAMP_SECONDS
      const t = Math.min((now - phase2Start.current) / RAMP_SECONDS, 1)
      spawnIntervalRef.current = avgBreath.current * (1 + t)
    }
  })

  return null
}
