import { useEffect, useRef } from 'react'

// Mic check overlay, shown over the blank cover at the start of sessions that
// use the mic. The steps run in useBreathControl (stepCal), which writes
// statusRef each frame: { step, blows, needed, blowing, hint, level, inhaleP }.
// A rAF loop copies it into the DOM without React re-renders. Each paced
// breath is paced like the Space Ship: an Inhale bell and glowing side
// columns that fill over the inhale (inhaleP), then an Exhale bell that's cut
// as soon as the blow starts, so it doesn't spill into the recording.
const TEXT = {
  wait: 'Getting the mic ready…',
  quiet: 'Hold your phone the way you will use it, and stay quiet for a moment.',
  inhale: 'Take a slow, deep breath in.',
  exhale: 'Now blow gently toward the mic, like a long, slow exhale.',
  done: 'Got it.',
}
const HINT = 'Try a little closer to the mic, or a little harder.'

// Side columns: from under the title area to just above Skip.
const COLUMN_TOP = '14%'
const COLUMN_BOTTOM = 140
const COLUMN_W = 12
const GLOW_W = 16
const TERTIARY = 'var(--live-tertiary-color, #276d8c)'

export default function MicCheck({ statusRef, onSkip, onBell, onBellStop }) {
  const textRef = useRef(null)
  const hintRef = useRef(null)
  const dotsRef = useRef(null)
  const barRef = useRef(null)
  const glowRefs = useRef([])
  const onBellRef = useRef(onBell)
  const onBellStopRef = useRef(onBellStop)
  onBellRef.current = onBell
  onBellStopRef.current = onBellStop

  useEffect(() => {
    let raf = 0
    let lastStep = null
    let lastBlowing = false
    const tick = () => {
      const s = statusRef.current
      const step = s ? s.step : 'wait'
      if (step !== lastStep) {
        if (step === 'inhale' || step === 'exhale') onBellRef.current?.(step)
        lastStep = step
      }
      const blowing = !!(s && s.blowing)
      if (step === 'exhale' && blowing && !lastBlowing) onBellStopRef.current?.()
      lastBlowing = blowing

      const text = TEXT[step === 'finished' ? 'done' : step] || TEXT.wait
      if (textRef.current && textRef.current.textContent !== text) textRef.current.textContent = text
      if (hintRef.current) hintRef.current.style.opacity = s && s.hint ? 1 : 0
      if (dotsRef.current) {
        const needed = s ? s.needed : 3
        const done = s ? s.blows : 0
        const dots = Array.from({ length: needed }, (_, i) => (i < done ? '●' : '○')).join('  ')
        if (dotsRef.current.textContent !== dots) dotsRef.current.textContent = dots
        dotsRef.current.style.opacity = step === 'quiet' || step === 'wait' ? 0.3 : 1
      }
      if (barRef.current) {
        barRef.current.style.width = `${Math.round((s ? s.level : 0) * 100)}%`
        barRef.current.style.opacity = blowing ? 1 : 0.5
      }
      const p = s && s.inhaleP ? s.inhaleP : 0
      glowRefs.current.forEach((el) => { if (el) el.style.height = `${p * 100}%` })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [statusRef])

  return (
    <>
      {['left', 'right'].map((side, n) => (
        <div key={side} style={{
          position: 'absolute', top: COLUMN_TOP, bottom: COLUMN_BOTTOM, [side]: 16, width: GLOW_W,
          pointerEvents: 'none', zIndex: 101,
        }}>
          <div style={{
            position: 'absolute', top: 0, bottom: 0, left: (GLOW_W - COLUMN_W) / 2, width: COLUMN_W,
            borderRadius: COLUMN_W / 2, background: TERTIARY, opacity: 0.5,
          }} />
          <div ref={(el) => { glowRefs.current[n] = el }} style={{
            position: 'absolute', bottom: 0, left: 0, width: GLOW_W, height: 0,
            borderRadius: GLOW_W / 2, background: TERTIARY,
            boxShadow: `0 0 12px ${TERTIARY}, 0 0 24px ${TERTIARY}`,
          }} />
        </div>
      ))}
      <div style={{
        position: 'absolute', top: '18%', left: '50%', transform: 'translateX(-50%)',
        width: '92vw', maxWidth: 420, padding: '0 40px', boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
        color: 'var(--live-text-color)', fontFamily: 'sans-serif', textAlign: 'center',
        pointerEvents: 'none', zIndex: 102,
      }}>
        <div style={{ fontSize: 16, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.8 }}>Mic check</div>
        <div ref={textRef} style={{ fontSize: 24, lineHeight: 1.2, minHeight: '3.6em' }} />
        <div ref={dotsRef} style={{ fontSize: 24, letterSpacing: '0.1em' }} />
        <div style={{
          width: 160, height: 6, borderRadius: 3, overflow: 'hidden',
          background: 'rgba(var(--live-primary-rgb, 141, 177, 161), 0.2)',
        }}>
          <div ref={barRef} style={{ height: '100%', width: 0, background: 'rgb(var(--live-primary-rgb, 141, 177, 161))' }} />
        </div>
        <div ref={hintRef} style={{ fontSize: 18, lineHeight: 1.2, opacity: 0, transition: 'opacity 0.5s ease' }}>{HINT}</div>
      </div>
      <button onClick={onSkip} style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: 80,
        padding: '12px 20px', borderRadius: 12,
        background: 'transparent',
        border: '2px solid rgb(var(--live-primary-rgb, 141, 177, 161))',
        color: 'rgb(var(--live-primary-rgb, 141, 177, 161))', fontSize: 16, fontWeight: 700,
        fontFamily: 'sans-serif', cursor: 'pointer', whiteSpace: 'nowrap',
        pointerEvents: 'auto', zIndex: 102,
      }}>
        Skip mic check
      </button>
    </>
  )
}
