import { useRef, useLayoutEffect } from 'react'

const PULSE_DURATION = 1.0
const PULSE_FADE_IN = 0.2
const PULSE_MID_FLOOR = 0.75

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

// Per-second pulse used by Box Breathing's captions: the first second fades
// in over PULSE_FADE_IN then eases to PULSE_MID_FLOOR for the rest of the
// second; every other second steps immediately to full and eases back down
// across the whole second -- down to 0 (instead of PULSE_MID_FLOOR) on the
// last second, so the caption is gone right before the next one's hidden gap.
function pulseAlpha(elapsed, interval) {
  const t = elapsed % PULSE_DURATION
  const pulseIndex = Math.floor(elapsed / PULSE_DURATION)
  const lastPulseIndex = Math.floor((interval - 1e-4) / PULSE_DURATION)
  if (pulseIndex === 0) {
    if (t < PULSE_FADE_IN) return smoothstep(t / PULSE_FADE_IN)
    return lerp(1, PULSE_MID_FLOOR, smoothstep((t - PULSE_FADE_IN) / (PULSE_DURATION - PULSE_FADE_IN)))
  }
  const floor = pulseIndex >= lastPulseIndex ? 0 : PULSE_MID_FLOOR
  return lerp(floor, 1, 1 - smoothstep(t / PULSE_DURATION))
}

export default function TutorialText({ text, visible, opacity, fadeMs = 2000, pulseActive, pulseCycleStartRef, pulseIntervalRef }) {
  const textRef = useRef(null)

  // Box Breathing's captions drive their own per-second opacity pulse via a
  // rAF loop writing straight to the DOM node, bypassing React state so this
  // doesn't trigger a re-render every frame. useLayoutEffect + an immediate
  // synchronous tick() avoids a one-frame flash before the loop's first paint.
  // Timing is derived from pulseCycleStartRef -- a single timestamp stamped
  // once when Box Breathing starts (never reset per-caption) -- via the same
  // free-running 4-phase-modulo math GatesBoxBreathingD's own ring pulse
  // uses, so the two stay in step even though they're computed independently
  // (one on a rAF/performance.now clock, the other on R3F's per-frame delta).
  useLayoutEffect(() => {
    if (!pulseActive) return
    let raf
    const tick = () => {
      const totalElapsed = Math.max(0, (performance.now() - pulseCycleStartRef.current) / 1000)
      const interval = Math.max(0.05, pulseIntervalRef.current)
      const cycleT = totalElapsed % (4 * interval)
      const phaseElapsed = cycleT % interval
      if (textRef.current) textRef.current.style.opacity = String(pulseAlpha(phaseElapsed, interval))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [pulseActive, pulseCycleStartRef, pulseIntervalRef])

  const alpha = typeof opacity === 'number' ? opacity : (visible ? 1 : 0)
  const transition = (typeof opacity === 'number' || pulseActive) ? 'none' : `opacity ${fadeMs}ms ease`
  return (
    <div style={{
      position: 'absolute',
      top: '38%', left: 0, right: 0,
      transform: 'translateY(-50%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
      padding: '0 80px',
    }}>
      <p ref={textRef} style={{
        color: 'rgba(255,255,255,0.9)',
        fontSize: 20,
        textAlign: 'center',
        fontFamily: 'sans-serif',
        fontWeight: 700,
        lineHeight: 1.5,
        maxWidth: 280,
        whiteSpace: 'pre-line',
        opacity: pulseActive ? undefined : alpha,
        transition,
        margin: 0,
      }}>
        {text}
      </p>
    </div>
  )
}
