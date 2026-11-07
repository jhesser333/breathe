import { useEffect, useState } from 'react'
import { UI_EDGE, UI_INTERIOR, UI_FILL, UI_THUMB_GLOW } from './uiColors'

// Space Ship on the mic: the round cue between Home and Restart. The mic's
// blow only counts while a finger holds the screen (useBreathControl's
// blowNeedsTouch), anywhere but a button; this circle shows where to hold and
// lights while a finger is down. It takes no touches itself (pointer events
// pass through to the window listeners, which ignore real buttons).
export const HOLD_CIRCLE_SIZE = 72
export const HOLD_CIRCLE_BOTTOM = 16

const onButton = (e) => !!(e.target && e.target.closest && e.target.closest('button'))

export default function HoldCircle() {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const down = new Set()
    const onDown = (e) => { if (!onButton(e)) { down.add(e.pointerId); setHeld(true) } }
    const onUp = (e) => { down.delete(e.pointerId); if (down.size === 0) setHeld(false) }
    const opts = { passive: true }
    window.addEventListener('pointerdown', onDown, opts)
    window.addEventListener('pointerup', onUp, opts)
    window.addEventListener('pointercancel', onUp, opts)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])
  return (
    <div style={{
      position: 'absolute',
      bottom: HOLD_CIRCLE_BOTTOM,
      left: '50%',
      transform: 'translateX(-50%)',
      width: HOLD_CIRCLE_SIZE,
      height: HOLD_CIRCLE_SIZE,
      borderRadius: '50%',
      boxSizing: 'border-box',
      border: `1px solid ${UI_EDGE}`,
      background: held ? UI_FILL : UI_INTERIOR,
      boxShadow: held ? `0 0 18px ${UI_THUMB_GLOW}` : 'none',
      transition: 'background 0.15s ease, box-shadow 0.15s ease',
      pointerEvents: 'none',
    }} />
  )
}
