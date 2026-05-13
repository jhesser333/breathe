import { useRef, useState, useEffect } from 'react'

export function useTouchSlider(initialValue = 0) {
  const ref = useRef(null)
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    function getValueFromEvent(clientY) {
      const rect = el.getBoundingClientRect()
      const ratio = 1 - (clientY - rect.top) / rect.height
      setValue(Math.min(1, Math.max(0, ratio)))
    }

    function onTouchStart(e) {
      e.preventDefault()
      getValueFromEvent(e.touches[0].clientY)
    }

    function onTouchMove(e) {
      e.preventDefault()
      getValueFromEvent(e.touches[0].clientY)
    }

    // Mouse fallback for desktop testing
    let dragging = false
    function onMouseDown(e) {
      dragging = true
      getValueFromEvent(e.clientY)
    }
    function onMouseMove(e) {
      if (dragging) getValueFromEvent(e.clientY)
    }
    function onMouseUp() { dragging = false }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return [ref, value]
}
