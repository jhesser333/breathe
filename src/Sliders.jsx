import { useEffect } from 'react'
import { useTouchSlider } from './useTouchSlider'

const trackStyle = {
  position: 'absolute',
  top: '10%',
  height: '80%',
  width: '56px',
  display: 'flex',
  alignItems: 'stretch',
  cursor: 'pointer',
  userSelect: 'none',
  touchAction: 'none',
}

const trackInner = {
  flex: 1,
  borderRadius: '28px',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.15)',
  position: 'relative',
}

function ThumbDot({ value }) {
  return (
    <div style={{
      position: 'absolute',
      left: '50%',
      bottom: `calc(${value * 100}% - 14px)`,
      transform: 'translateX(-50%)',
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.7)',
      boxShadow: '0 0 8px rgba(255,255,255,0.4)',
      pointerEvents: 'none',
    }} />
  )
}

export default function Sliders({ onLeft, onRight }) {
  const [leftRef, leftVal] = useTouchSlider(0)
  const [rightRef, rightVal] = useTouchSlider(0)

  useEffect(() => { onLeft(leftVal) }, [leftVal])
  useEffect(() => { onRight(rightVal) }, [rightVal])

  return (
    <>
      <div ref={leftRef} style={{ ...trackStyle, left: '12px' }}>
        <div style={trackInner}>
          <ThumbDot value={leftVal} />
        </div>
      </div>
      <div ref={rightRef} style={{ ...trackStyle, right: '12px' }}>
        <div style={trackInner}>
          <ThumbDot value={rightVal} />
        </div>
      </div>
    </>
  )
}
