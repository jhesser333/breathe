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
      if (touchId.current !== null) return
      const touch = e.changedTouches[0]
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

    // Mouse fallback for desktop testing
    let dragging = false
    function onMouseDown(e) { dragging = true; getValueFromPoint(e.clientX, e.clientY) }
    function onMouseMove(e) { if (dragging) getValueFromPoint(e.clientX, e.clientY) }
    function onMouseUp() { dragging = false }

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
  }, [])

  return [ref, value]
}
