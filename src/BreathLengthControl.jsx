import { useRef, useEffect, useCallback } from 'react'

const MIN_S = 5
const MAX_S = 24
const STEP = 0.5
const THUMB_SIZE = 34
const TRACK_WIDTH = 40
const TRACK_HEIGHT = 220

function snap(seconds) {
  return Math.min(MAX_S, Math.max(MIN_S, Math.round(seconds / STEP) * STEP))
}

export default function BreathLengthControl({ breathLength, onChange }) {
  const trackRef = useRef(null)
  const touchIdRef = useRef(null)
  const draggingRef = useRef(false)

  const ratio = (breathLength - MIN_S) / (MAX_S - MIN_S) // 0 = bottom = 5s, 1 = top = 24s

  const readClientY = useCallback((clientY) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const raw = 1 - (clientY - rect.top) / rect.height
    onChange(snap(MIN_S + Math.min(1, Math.max(0, raw)) * (MAX_S - MIN_S)))
  }, [onChange])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return

    function onTouchStart(e) {
      e.preventDefault()
      if (touchIdRef.current !== null) return
      const t = e.changedTouches[0]
      touchIdRef.current = t.identifier
      readClientY(t.clientY)
    }
    function onTouchMove(e) {
      e.preventDefault()
      const t = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current)
      if (t) readClientY(t.clientY)
    }
    function onTouchEnd(e) {
      const t = Array.from(e.changedTouches).find(t => t.identifier === touchIdRef.current)
      if (t) touchIdRef.current = null
    }
    function onMouseDown(e) { draggingRef.current = true; readClientY(e.clientY) }
    function onMouseMove(e) { if (draggingRef.current) readClientY(e.clientY) }
    function onMouseUp() { draggingRef.current = false }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [readClientY])

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: 16,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 6,
      pointerEvents: 'auto',
    }}>
      <span style={{
        color: 'rgba(255,255,255,0.55)',
        fontFamily: 'sans-serif',
        fontSize: 14,
        letterSpacing: '0.03em',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}>
        Adjust Breath Length
      </span>
      <span style={{
        color: 'rgba(255,255,255,0.75)',
        fontFamily: 'sans-serif',
        fontSize: 20,
        letterSpacing: '0.03em',
        userSelect: 'none',
      }}>
        {breathLength.toFixed(1)}s
      </span>
      <div
        ref={trackRef}
        style={{
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          display: 'flex',
          alignItems: 'stretch',
          cursor: 'pointer',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <div style={{
          flex: 1,
          borderRadius: 20,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          position: 'relative',
        }}>
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${ratio * 100}%`,
            background: 'rgba(255,255,255,0.35)',
            borderRadius: 20,
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute',
            left: '50%',
            bottom: `calc(${ratio} * (100% - ${THUMB_SIZE}px))`,
            transform: 'translateX(-50%)',
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.7)',
            boxShadow: '0 0 8px rgba(255,255,255,0.4)',
            pointerEvents: 'none',
          }} />
        </div>
      </div>
    </div>
  )
}
