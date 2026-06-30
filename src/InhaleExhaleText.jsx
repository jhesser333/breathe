import { useRef, useEffect } from 'react'

export default function InhaleExhaleText({ rightVal, showing }) {
  const inhaleRef = useRef(null)
  const exhaleRef = useRef(null)

  useEffect(() => {
    if (!showing) {
      if (inhaleRef.current) inhaleRef.current.style.opacity = 0
      if (exhaleRef.current) exhaleRef.current.style.opacity = 0
      return
    }

    let rafId
    const tick = () => {
      const rv = rightVal.current
      // inhale: rv 0.5 → 0, opacity 0 → 1
      const inhaleOpacity = rv <= 0.5 ? (0.5 - rv) / 0.5 : 0
      // exhale: rv 0.5 → 1, opacity 0 → 1
      const exhaleOpacity = rv >= 0.5 ? (rv - 0.5) / 0.5 : 0
      if (inhaleRef.current) inhaleRef.current.style.opacity = inhaleOpacity
      if (exhaleRef.current) exhaleRef.current.style.opacity = exhaleOpacity
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [showing, rightVal])

  const textStyle = {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translateX(-50%)',
    color: 'rgba(255,255,255,0.9)',
    fontSize: 20,
    textAlign: 'center',
    fontFamily: 'sans-serif',
    fontWeight: 700,
    opacity: 0,
    margin: 0,
    whiteSpace: 'nowrap',
    letterSpacing: '0.05em',
  }

  return (
    <div style={{
      position: 'absolute',
      top: '53%',
      left: 0,
      right: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{ position: 'relative', height: 30 }}>
        <p ref={inhaleRef} style={textStyle}>inhale</p>
        <p ref={exhaleRef} style={textStyle}>exhale</p>
      </div>
    </div>
  )
}
