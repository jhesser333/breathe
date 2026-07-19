import { useEffect } from 'react'
import { useTouchSlider } from './useTouchSlider'

const THUMB_SIZE = 52
const CENTER_GAP = 150

const trackInner = {
  height: '100%',
  borderRadius: '28px',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.15)',
  position: 'relative',
}

const labelStyle = {
  color: 'rgba(255,255,255,0.35)',
  fontSize: 11,
  fontFamily: 'sans-serif',
  fontWeight: 400,
  letterSpacing: '0.06em',
  userSelect: 'none',
  pointerEvents: 'none',
}

function ThumbDot({ value }) {
  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: `calc((1 - ${value}) * (100% - ${THUMB_SIZE}px))`,
      transform: 'translateY(-50%)',
      width: `${THUMB_SIZE}px`,
      height: `${THUMB_SIZE}px`,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.7)',
      boxShadow: '0 0 8px rgba(255,255,255,0.4)',
      pointerEvents: 'none',
    }} />
  )
}

function Slider({ sliderRef, value, leftLabel, rightLabel, side }) {
  const anchorLeft = side === 'right'
  const fillWidth = anchorLeft ? (1 - value) * 100 : value * 100
  const edgeStyle = side === 'left'
    ? { left: 12, right: `calc(50% + ${CENTER_GAP / 2}px)` }
    : { left: `calc(50% + ${CENTER_GAP / 2}px)`, right: 12 }

  return (
    <div style={{
      position: 'absolute',
      ...edgeStyle,
      top: '70%',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px' }}>
        <span style={labelStyle}>{leftLabel}</span>
        <span style={labelStyle}>{rightLabel}</span>
      </div>
      <div
        ref={sliderRef}
        style={{
          height: 62, width: '100%',
          cursor: 'pointer', userSelect: 'none', touchAction: 'none',
        }}
      >
        <div style={trackInner}>
          <div style={{
            position: 'absolute',
            [anchorLeft ? 'left' : 'right']: 0,
            top: 0, bottom: 0,
            width: `${fillWidth}%`,
            background: 'rgba(255,255,255,0.35)',
            borderRadius: 28,
            pointerEvents: 'none',
          }} />
          <ThumbDot value={value} />
        </div>
      </div>
    </div>
  )
}

export default function SlidersHorizontal({ onLeft, onRight, leftRawRef }) {
  const [leftRef, leftVal] = useTouchSlider(0, leftRawRef, 'horizontal')
  const [rightRef, rightVal] = useTouchSlider(1, null, 'horizontal')

  useEffect(() => { onLeft(leftVal) }, [leftVal])
  useEffect(() => { onRight(rightVal) }, [rightVal])

  return (
    <>
      <Slider sliderRef={leftRef} value={leftVal} leftLabel="inhale" rightLabel="exhale" side="left" />
      <Slider sliderRef={rightRef} value={rightVal} leftLabel="exhale" rightLabel="inhale" side="right" />
    </>
  )
}
