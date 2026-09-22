import { useRef, useLayoutEffect } from 'react'

const PULSE_DURATION = 1.0
const PULSE_FADE_IN = 0.2
const PULSE_MID_FLOOR = 0.5

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

// Per-second pulse used by Box Breathing's captions: the first second fades
// in over PULSE_FADE_IN then eases to PULSE_MID_FLOOR for the rest of the
// second; every other second (including the last) steps immediately to full
// and eases back down to PULSE_MID_FLOOR across the whole second.
function pulseAlpha(elapsed) {
  const t = elapsed % PULSE_DURATION
  const pulseIndex = Math.floor(elapsed / PULSE_DURATION)
  if (pulseIndex === 0) {
    if (t < PULSE_FADE_IN) return smoothstep(t / PULSE_FADE_IN)
    return lerp(1, PULSE_MID_FLOOR, smoothstep((t - PULSE_FADE_IN) / (PULSE_DURATION - PULSE_FADE_IN)))
  }
  return lerp(PULSE_MID_FLOOR, 1, 1 - smoothstep(t / PULSE_DURATION))
}

export default function TutorialText({ text, visible, opacity, fadeMs = 2000, pulseActive, pulseCycleStartRef, pulseIntervalRef }) {
  const textRef = useRef(null)

  // Box Breathing's captions drive their own per-second opacity pulse via a
  // rAF loop writing straight to the DOM node, bypassing React state so this
  // doesn't trigger a re-render every frame. useLayoutEffect + an immediate
  // synchronous tick() avoids a one-frame flash before the loop's first paint.
  // Timing is derived from pulseCycleStartRef -- a single timestamp stamped
  // once when Box Breathing starts (never reset per-caption) -- via the same
  // free-running 4-phase-modulo math App.jsx's caption poll uses to decide
  // which caption to show, so the two can never disagree about where in the
  // cycle they are (no clamp needed -- `%` already keeps phaseElapsed inside
  // [0, interval)).
  useLayoutEffect(() => {
    if (!pulseActive) return
    let raf
    const tick = () => {
      const interval = Math.max(0.05, pulseIntervalRef.current)
      const totalElapsed = Math.max(0, (performance.now() - pulseCycleStartRef.current) / 1000)
      const phaseElapsed = (totalElapsed % (4 * interval)) % interval
      if (textRef.current) textRef.current.style.opacity = String(pulseAlpha(phaseElapsed))
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
