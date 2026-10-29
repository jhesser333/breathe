import { useEffect, useRef } from 'react'

// Input Test art option: live numbers from the tilt and mic sensors, read
// from readoutRef (written by useBreathControl) each frame without React
// re-renders. Tilt: 0 flat/exhale -> 1 upright/inhale. Mic: blow strength,
// 0 quiet -> 1 hard blow. Slider: the breath value driving the sliders.
const fmt = (n) => (n === null || n === undefined ? '--' : n.toFixed(2))

export default function InputTestReadout({ readoutRef }) {
  const elRef = useRef(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const r = readoutRef.current
      if (elRef.current) {
        elRef.current.textContent = r
          ? `Tilt ${fmt(r.tilt)}\nMic ${fmt(r.mic)} ${r.mic === null ? '' : r.blowing ? 'BLOWING' : 'quiet'}\nSlider ${fmt(r.v)}`
          : 'Tilt --\nMic --\nSlider --'
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [readoutRef])

  return (
    <div ref={elRef} style={{
      position: 'absolute', top: '22%', left: '50%', transform: 'translateX(-50%)',
      color: 'var(--live-text-color)', fontFamily: 'monospace', fontSize: 28, lineHeight: 1.4,
      whiteSpace: 'pre', textAlign: 'left', pointerEvents: 'none', zIndex: 50,
    }} />
  )
}
