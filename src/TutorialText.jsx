import { useRef, useLayoutEffect } from 'react'

const PULSE_DURATION = 1.0
const PULSE_MID_FLOOR = 0.5
const FADE_IN_FRAC = 0.9   // Inhale/Exhale: fraction of the phase spent easing 0 -> 1

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

// Per-second pulse used by Box Breathing's "Hold" caption: every second
// (including the first and last) steps immediately to full and eases back
// down to PULSE_MID_FLOOR across the whole second -- identical treatment
// throughout, no special-cased first/last pulse.
function pulseAlpha(elapsed) {
  const t = elapsed % PULSE_DURATION
  return lerp(PULSE_MID_FLOOR, 1, 1 - smoothstep(t / PULSE_DURATION))
}

// Single fade spanning the whole phase, used by Inhale/Exhale instead of the
// per-second pulse: eases 0 -> 1 over the first FADE_IN_FRAC of the phase,
// then eases 1 -> 0 over the remainder.
function fadeAlpha(phaseElapsed, interval) {
  const t = interval > 0 ? phaseElapsed / interval : 0
  if (t < FADE_IN_FRAC) return smoothstep(t / FADE_IN_FRAC)
  return lerp(1, 0, smoothstep((t - FADE_IN_FRAC) / (1 - FADE_IN_FRAC)))
}

// Mirror image of Inhale/Exhale's fade-in (rise 0 -> 1 over the first
// FADE_IN_FRAC of the phase): flat at 1 for the mirrored remainder, then
// eases 1 -> 0 over the last FADE_IN_FRAC. Multiplied over Hold's per-second
// pulse as an additional overall fade-out.
function holdFadeMultiplier(phaseElapsed, interval) {
  const t = interval > 0 ? phaseElapsed / interval : 0
  const flatFrac = 1 - FADE_IN_FRAC
  if (t < flatFrac) return 1
  return 1 - smoothstep((t - flatFrac) / FADE_IN_FRAC)
}

export default function TutorialText({ text, visible, opacity, fadeMs = 2000, pulseActive, pulseMode = 'pulse', pulseCycleStartRef, pulseIntervalRef }) {
  const textRef = useRef(null)

  // Box Breathing's captions drive their own per-second opacity pulse via a
  // rAF loop writing straight to the DOM node, bypassing React state so this
  // doesn't trigger a re-render every frame. useLayoutEffect + an immediate
  // synchronous tick() avoids a one-frame flash before the loop's first paint.
  // Timing is derived from pulseCycleStartRef -- a single timestamp stamped
  // once when Box Breathing starts (never reset per-caption) -- via the same
  // free-running 4-phase-modulo math App.jsx's caption poll uses to decide
  // which caption to show. That poll only runs every 100ms though, so it can
  // lag up to ~100ms behind the true phase boundary while this per-frame
  // loop reacts immediately -- without a guard, the envelope would free-run
  // into what looks like a fresh pulse (jumping back to full opacity) while
  // the stale caption is still on screen. Once a wrap is detected (this
  // frame's phaseElapsed < last frame's), latch at the end-of-phase value
  // instead, so it stays faded out until the caption prop actually catches
  // up and this effect re-runs fresh.
  useLayoutEffect(() => {
    if (!pulseActive) return
    let raf
    let prevPhaseElapsed = null
    let wrapped = false
    const tick = () => {
      const interval = Math.max(0.05, pulseIntervalRef.current)
      const totalElapsed = Math.max(0, (performance.now() - pulseCycleStartRef.current) / 1000)
      let phaseElapsed = (totalElapsed % (4 * interval)) % interval
      if (prevPhaseElapsed !== null && phaseElapsed < prevPhaseElapsed) wrapped = true
      prevPhaseElapsed = phaseElapsed
      if (wrapped) phaseElapsed = interval - 1e-4
      const value = pulseMode === 'fade'
        ? fadeAlpha(phaseElapsed, interval)
        : pulseAlpha(phaseElapsed) * holdFadeMultiplier(phaseElapsed, interval)
      if (textRef.current) textRef.current.style.opacity = String(value)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [pulseActive, pulseMode, pulseCycleStartRef, pulseIntervalRef])

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
