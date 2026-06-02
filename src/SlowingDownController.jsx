import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const BREATH_THRESHOLD = 0.5
const MIN_BREATH_SECONDS = 1.5
const MIN_LEARNING_SECONDS = 60
const MIN_BREATHS = 5
const RAMP_SECONDS = 60

export default function SlowingDownController({ leftVal, gatesEnabledRef, spawnIntervalRef, onGatesReady }) {
  const startTime = useRef(null)
  const prevLeft = useRef(null)
  const breathStart = useRef(null)
  const breaths = useRef([])
  const phase = useRef('learning')
  const avgBreath = useRef(0)
  const phase2Start = useRef(0)
  const onGatesReadyRef = useRef(onGatesReady)
  onGatesReadyRef.current = onGatesReady

  useFrame((state) => {
    const now = state.clock.elapsedTime

    if (startTime.current === null) {
      startTime.current = now
      prevLeft.current = leftVal.current
      return
    }

    const lv = leftVal.current
    const prev = prevLeft.current

    // Detect upward threshold crossing (inhale start)
    if (prev <= BREATH_THRESHOLD && lv > BREATH_THRESHOLD) {
      breathStart.current = now
    }
    // Detect downward threshold crossing (exhale complete = full breath)
    if (prev > BREATH_THRESHOLD && lv <= BREATH_THRESHOLD && breathStart.current !== null) {
      const duration = now - breathStart.current
      if (duration >= MIN_BREATH_SECONDS) {
        breaths.current.push(duration)
      }
      breathStart.current = null
    }

    prevLeft.current = lv

    if (phase.current === 'learning') {
      const elapsed = now - startTime.current
      const count = breaths.current.length
      if (elapsed >= MIN_LEARNING_SECONDS && count >= MIN_BREATHS) {
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
