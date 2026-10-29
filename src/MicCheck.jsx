import { useEffect, useRef } from 'react'

// Mic check overlay, shown over the blank cover at the start of sessions that
// use the mic. The steps run in useBreathControl (stepCal), which writes
// statusRef each frame: { step, blows, needed, blowing, hint, level }. A rAF
// loop copies it into the DOM without React re-renders.
const TEXT = {
  wait: 'Getting the mic ready…',
  quiet: 'Hold your phone the way you will use it, and stay quiet for a moment.',
  blow: 'Now blow gently toward the mic, like a long, slow exhale.',
  again: 'Good. Again.',
  done: 'Got it.',
}
const HINT = 'Try a little closer to the mic, or a little harder.'

export default function MicCheck({ statusRef, onSkip }) {
  const textRef = useRef(null)
  const hintRef = useRef(null)
  const dotsRef = useRef(null)
  const barRef = useRef(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const s = statusRef.current
      const step = s ? s.step : 'wait'
      const text = step === 'blow' ? (s.blows > 0 && !s.blowing ? TEXT.again : TEXT.blow)
        : step === 'quiet' ? TEXT.quiet
        : step === 'done' || step === 'finished' ? TEXT.done
        : TEXT.wait
      if (textRef.current && textRef.current.textContent !== text) textRef.current.textContent = text
      if (hintRef.current) hintRef.current.style.opacity = s && s.hint ? 1 : 0
      if (dotsRef.current) {
        const needed = s ? s.needed : 3
        const done = s ? s.blows : 0
        const dots = Array.from({ length: needed }, (_, i) => (i < done ? '●' : '○')).join('  ')
        if (dotsRef.current.textContent !== dots) dotsRef.current.textContent = dots
        dotsRef.current.style.opacity = step === 'blow' || step === 'done' || step === 'finished' ? 1 : 0.3
      }
      if (barRef.current) {
        barRef.current.style.width = `${Math.round((s ? s.level : 0) * 100)}%`
        barRef.current.style.opacity = s && s.blowing ? 1 : 0.5
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [statusRef])

  return (
    <>
      <div style={{
        position: 'absolute', top: '18%', left: '50%', transform: 'translateX(-50%)',
        width: '92vw', maxWidth: 420, padding: '0 16px', boxSizing: 'border-box',
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
