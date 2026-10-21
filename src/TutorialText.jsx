import { useRef, useLayoutEffect } from 'react'

const OUTLINE_COLOR = 'var(--live-bg-color, #1a1a3a)'
const OUTLINE_PX = 2
const OUTLINE_SHADOW = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7],
].map(([x, y]) => `${x * OUTLINE_PX}px ${y * OUTLINE_PX}px 0 ${OUTLINE_COLOR}`)
  .concat(`0 0 6px ${OUTLINE_COLOR}`)
  .join(', ')

const FADE_IN_FRAC = 0.9   // Inhale/Exhale: fraction of the phase spent easing 0 -> 1
const HOLD_FADE_IN_S = 1   // Box Breathing: "Hold" fades in over this at the start of each Hold

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

// Single fade spanning the whole phase, used by Inhale/Exhale instead of the
// per-second pulse: eases 0 -> 1 over the first FADE_IN_FRAC of the phase,
// then eases 1 -> 0 over the remainder.
function fadeAlpha(phaseElapsed, interval) {
  const t = interval > 0 ? phaseElapsed / interval : 0
  if (t < FADE_IN_FRAC) return smoothstep(t / FADE_IN_FRAC)
  return lerp(1, 0, smoothstep((t - FADE_IN_FRAC) / (1 - FADE_IN_FRAC)))
}

// Box Breathing: one caption per half-cycle (Inhale + Hold-in, Exhale +
// Hold-out). "Inhale"/"Exhale" eases in over the first FADE_IN_FRAC of the
// movement phase and stays up through the Hold; "Hold" fades in below it
// over HOLD_FADE_IN_S as the Hold starts. Both ease out together over the
// Hold's last (1 - FADE_IN_FRAC), the same fade-out Inhale/Exhale had alone.
function boxAlphas(halfElapsed, interval) {
  const t = interval > 0 ? halfElapsed / interval : 0   // 0-1 movement, 1-2 Hold
  const out = t < 1 + FADE_IN_FRAC ? 1 : lerp(1, 0, smoothstep((t - 1 - FADE_IN_FRAC) / (1 - FADE_IN_FRAC)))
  const main = t < FADE_IN_FRAC ? smoothstep(t / FADE_IN_FRAC) : out
  const hold = t < 1 ? 0 : smoothstep((halfElapsed - interval) / Math.min(HOLD_FADE_IN_S, interval * FADE_IN_FRAC)) * out
  return { main, hold }
}

const ROUND_ALPHA = [1, 1, 0.5, 0.15]   // per round (0-indexed): rounds 1-2 full, round 3 half, round 4 nearly gone

// Overall fade-out across the whole 4-round tutorial, layered on top of the
// per-caption envelopes. Uses the un-wrapped totalElapsed (not the
// latched/wrapped phaseElapsed), so it keeps counting rounds correctly for
// the whole session; it only changes at the Hold-out -> Inhale boundary,
// the same instant the wrap-latch above already holds the base envelope
// near 0, so any one-poll-tick staleness here is imperceptible.
function roundAlphaMultiplier(totalElapsed, interval) {
  const roundIndex = interval > 0 ? Math.floor(totalElapsed / (4 * interval)) : 0
  return ROUND_ALPHA[roundIndex] ?? 1
}

// topPx: pin the text's top edge this far from the top of the screen (the mode
// explanation) instead of the usual spot over the Morph's lower third.
// size: font size in px (App: 20 mode explanation, 60 paced captions, 40 the rest);
// larger text gets a wider column so long lines still fit.
// subText: Box Breathing's "Hold", shown on the line below the caption
// (positioned so the caption itself doesn't move).
export default function TutorialText({ size = 20, topPx = null, text, subText = null, visible, opacity, fadeMs = 2000, pulseActive, pulseMode = 'box', pulseCycleStartRef, pulseIntervalRef, pacedCaptionRef }) {
  const textRef = useRef(null)
  const subRef = useRef(null)

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
      // Slowing Down's Inhale/Exhale captions: same whole-phase fade as Box
      // Breathing's, timed from the current paced phase's start (App.jsx
      // restamps pacedCaptionRef on every phase change), times a per-breath
      // multiplier that fades the last two breaths out.
      if (pulseMode === 'paced') {
        const cap = pacedCaptionRef?.current
        const value = cap
          ? fadeAlpha((performance.now() - cap.start) / 1000, Math.max(0.05, cap.getDuration())) * cap.mult
          : 0
        if (textRef.current) textRef.current.style.opacity = String(value)
        raf = requestAnimationFrame(tick)
        return
      }
      const interval = Math.max(0.05, pulseIntervalRef.current)
      const totalElapsed = Math.max(0, (performance.now() - pulseCycleStartRef.current) / 1000)
      let halfElapsed = (totalElapsed % (4 * interval)) % (2 * interval)
      if (prevPhaseElapsed !== null && halfElapsed < prevPhaseElapsed) wrapped = true
      prevPhaseElapsed = halfElapsed
      if (wrapped) halfElapsed = 2 * interval - 1e-4
      const { main, hold } = boxAlphas(halfElapsed, interval)
      const round = roundAlphaMultiplier(totalElapsed, interval)
      if (textRef.current) textRef.current.style.opacity = String(main * round)
      if (subRef.current) subRef.current.style.opacity = String(hold * round)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      if (subRef.current) subRef.current.style.opacity = '0'   // "Hold" never lingers once the captions stop
    }
    // text: each new Box caption (Inhale <-> Exhale) restarts the loop, clearing the wrap latch.
  }, [pulseActive, pulseMode, text, pulseCycleStartRef, pulseIntervalRef, pacedCaptionRef])

  const alpha = typeof opacity === 'number' ? opacity : (visible ? 1 : 0)
  const transition = (typeof opacity === 'number' || pulseActive) ? 'none' : `opacity ${fadeMs}ms ease`
  const lineStyle = {
    color: 'var(--live-text-color, rgba(255,255,255,0.9))',
    fontSize: size,
    textAlign: 'center',
    fontFamily: 'sans-serif',
    fontWeight: 700,
    lineHeight: size > 20 ? 1.2 : 1.5,
    maxWidth: size > 20 ? '92vw' : 280,
    whiteSpace: 'pre-line',
    // Outline in the live background color so the text reads over both
    // light and dark art (8-way shadow ring + soft halo; text-shadow is
    // used instead of -webkit-text-stroke, which eats into the glyphs).
    textShadow: OUTLINE_SHADOW,
    margin: 0,
  }
  return (
    <div style={{
      position: 'absolute',
      top: topPx !== null ? topPx : 'calc(44% + 24px)', left: 0, right: 0,   // default: in front of the Morph's lower third, nudged down ~1/4 inch
      transform: topPx !== null ? 'none' : 'translateY(-50%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 100,   // always above the canvas, sliders and nav buttons
      padding: size > 20 ? '0 16px' : '0 80px',
    }}>
      <div style={{ position: 'relative' }}>
        <p ref={textRef} style={{ ...lineStyle, opacity: pulseActive ? undefined : alpha, transition }}>
          {text}
        </p>
        {subText !== null && (
          <p ref={subRef} style={{
            ...lineStyle,
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            opacity: 0,
          }}>
            {subText}
          </p>
        )}
      </div>
    </div>
  )
}
