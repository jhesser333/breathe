import { useEffect } from 'react'
import { useTouchSlider } from './useTouchSlider'

const TRACK_WIDTH = 62
const HIT_WIDTH = 100

const trackInner = {
  width: `${TRACK_WIDTH}px`,
  alignSelf: 'stretch',
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

const THUMB_SIZE = 52

function ThumbDot({ value }) {
  return (
    <div style={{
      position: 'absolute',
      left: '50%',
      bottom: `calc(${value} * (100% - ${THUMB_SIZE}px))`,
      transform: 'translateX(-50%)',
      width: `${THUMB_SIZE}px`,
      height: `${THUMB_SIZE}px`,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.7)',
      boxShadow: '0 0 8px rgba(255,255,255,0.4)',
      pointerEvents: 'none',
    }} />
  )
}

function Slider({ sliderRef, value, topLabel, bottomLabel, side }) {
  const fillFromTop = side === 'right'
  const fillHeight = fillFromTop ? (1 - value) * 100 : value * 100
  return (
    <div style={{
      position: 'absolute',
      [side]: 16,
      top: '63%', bottom: 16,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 6,
    }}>
      <span style={labelStyle}>{topLabel}</span>
      <div
        ref={sliderRef}
        style={{
          flex: 1, width: HIT_WIDTH,
          display: 'flex', justifyContent: 'center', alignItems: 'stretch',
          cursor: 'pointer', userSelect: 'none', touchAction: 'none',
        }}
      >
        <div style={trackInner}>
          <div style={{
            position: 'absolute',
            [fillFromTop ? 'top' : 'bottom']: 0,
            left: 0, right: 0,
            height: `${fillHeight}%`,
            background: 'rgba(255,255,255,0.35)',
            borderRadius: 28,
            pointerEvents: 'none',
          }} />
          <ThumbDot value={value} />
        </div>
      </div>
      <span style={labelStyle}>{bottomLabel}</span>
    </div>
  )
}

export default function Sliders({ onLeft, onRight, leftRawRef }) {
  const [leftRef, leftVal] = useTouchSlider(0, leftRawRef)
  const [rightRef, rightVal] = useTouchSlider(1)

  useEffect(() => { onLeft(leftVal) }, [leftVal])
  useEffect(() => { onRight(rightVal) }, [rightVal])

  return (
    <>
      <Slider sliderRef={leftRef} value={leftVal} topLabel="inhale" bottomLabel="exhale" side="left" />
      <Slider sliderRef={rightRef} value={rightVal} topLabel="exhale" bottomLabel="inhale" side="right" />
    </>
  )
}
