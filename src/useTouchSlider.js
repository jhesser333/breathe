import { useRef, useState, useEffect } from 'react'
import { projectToCurve, CURVE_BOX_W, CURVE_BOX_H } from './diagonalCurveGeometry'

export function useTouchSlider(initialValue = 0, rawRef = null, orientation = 'vertical') {
  const ref = useRef(null)
  const touchId = useRef(null)
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function getValueFromPoint(x, y) {
      const rect = el.getBoundingClientRect()
      let ratio
      if (orientation === 'diagonal-left' || orientation === 'diagonal-right') {
        const side = orientation === 'diagonal-left' ? 'left' : 'right'
        const localX = (x - rect.left) * (CURVE_BOX_W / rect.width)
        const localY = (y - rect.top) * (CURVE_BOX_H / rect.height)
        const { arcFrac } = projectToCurve(localX, localY, side)
        ratio = side === 'left' ? arcFrac : 1 - arcFrac
      } else {
        ratio = 1 - (y - rect.top) / rect.height
      }
      if (rawRef) rawRef.current = ratio
      setValue(Math.min(1, Math.max(0, ratio)))
    }

    function onTouchStart(e) {
      e.preventDefault()
      // Self-heal: don't let a stale id (missed touchend/touchcancel -- e.g.
      // an OS edge-swipe gesture stealing a touch near the screen edge, where
      // these sliders sit) block this slider forever. e.touches is the
      // browser's own live list, so this is always accurate.
      if (touchId.current !== null && !Array.from(e.touches).some(t => t.identifier === touchId.current)) {
        touchId.current = null
      }
      if (touchId.current !== null) return
      // changedTouches isn't scoped to this element -- when two fingers
      // touch down in the same event batch (e.g. both slider thumbs at
      // once), it can include a touch meant for the other slider. Only
      // claim the touch whose target actually landed inside this slider's
      // own hit area.
      const touch = Array.from(e.changedTouches).find(t => el.contains(t.target))
      if (!touch) return
      touchId.current = touch.identifier
      getValueFromPoint(touch.clientX, touch.clientY)
    }

    function onTouchMove(e) {
      e.preventDefault()
      const touch = Array.from(e.changedTouches).find(t => t.identifier === touchId.current)
      if (touch) getValueFromPoint(touch.clientX, touch.clientY)
    }

    function onTouchEnd(e) {
      const touch = Array.from(e.changedTouches).find(t => t.identifier === touchId.current)
      if (touch) touchId.current = null
    }

    // The browser sends touchcancel (not touchend) when it decides a touch
    // is being taken over by something else -- commonly an OS gesture (edge-
    // swipe back, control center, etc). Without this, a cancelled touch near
    // the screen edge (exactly where these sliders sit) leaves touchId stuck
    // forever, freezing the slider until the self-heal check above catches it.
    function onTouchCancel(e) {
      const touch = Array.from(e.changedTouches).find(t => t.identifier === touchId.current)
      if (touch) touchId.current = null
    }

    // Mouse fallback for desktop testing
    let dragging = false
    function onMouseDown(e) { dragging = true; getValueFromPoint(e.clientX, e.clientY) }
    function onMouseMove(e) { if (dragging) getValueFromPoint(e.clientX, e.clientY) }
    function onMouseUp() { dragging = false }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchCancel)
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchCancel)
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return [ref, value]
}
