import { useEffect } from 'react'
import { useTouchSlider } from './useTouchSlider'

const TRACK_W = 90
const TRACK_H = 100
const TRACK_THICKNESS = 56
const THUMB_SIZE = 46
const INNER_GAP = 114
const BOTTOM_INSET = 150
const PILL_LENGTH = Math.sqrt(TRACK_W * TRACK_W + TRACK_H * TRACK_H)
const ANGLE = Math.atan2(TRACK_H, TRACK_W) * 180 / Math.PI
const THUMB_INSET_SCALE = 1 - THUMB_SIZE / PILL_LENGTH

const labelStyle = {
  position: 'absolute',
  color: 'rgba(255,255,255,0.35)',
  fontSize: 11,
  fontFamily: 'sans-serif',
  fontWeight: 400,
  letterSpacing: '0.06em',
  userSelect: 'none',
  pointerEvents: 'none',
}

function DiagonalTrack({ sliderRef, value, side }) {
  const isLeft = side === 'left'
  const rotateDeg = isLeft ? ANGLE : -ANGLE
  const t = 1 - value
  const tEff = 0.5 + (t - 0.5) * THUMB_INSET_SCALE
  const localX = tEff * TRACK_W
  const localY = isLeft ? tEff * TRACK_H : (1 - tEff) * TRACK_H
  const anchorLeft = side === 'right'
  const fillFrac = anchorLeft ? (1 - value) : value
  const edgeStyle = isLeft
    ? { right: `calc(50% + ${INNER_GAP / 2}px)` }
    : { left: `calc(50% + ${INNER_GAP / 2}px)` }

  return (
    <div style={{
      position: 'absolute',
      bottom: BOTTOM_INSET,
      width: TRACK_W, height: TRACK_H,
      ...edgeStyle,
    }}>
      <span style={{ ...labelStyle, top: -22, [isLeft ? 'left' : 'right']: 0 }}>
        inhale
      </span>
      <div
        ref={sliderRef}
        style={{ position: 'absolute', inset: 0, cursor: 'pointer', userSelect: 'none', touchAction: 'none' }}
      >
        <div style={{
          position: 'absolute',
          top: '50%', left: '50%',
          width: PILL_LENGTH, height: TRACK_THICKNESS,
          transform: `translate(-50%, -50%) rotate(${rotateDeg}deg)`,
          pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: TRACK_THICKNESS / 2,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
          }} />
          <div style={{
            position: 'absolute',
            [anchorLeft ? 'left' : 'right']: 0,
            top: 0, bottom: 0,
            width: `${fillFrac * 100}%`,
            background: 'rgba(255,255,255,0.35)',
            borderRadius: TRACK_THICKNESS / 2,
          }} />
        </div>
        <div style={{
          position: 'absolute',
          left: localX, top: localY,
          transform: 'translate(-50%, -50%)',
          width: THUMB_SIZE, height: THUMB_SIZE,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.7)',
          boxShadow: '0 0 8px rgba(255,255,255,0.4)',
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  )
}

export default function SlidersDiagonal({ onLeft, onRight, leftRawRef }) {
  const [leftRef, leftVal] = useTouchSlider(0, leftRawRef, 'diagonal-left')
  const [rightRef, rightVal] = useTouchSlider(1, null, 'diagonal-right')

  useEffect(() => { onLeft(leftVal) }, [leftVal])
  useEffect(() => { onRight(rightVal) }, [rightVal])

  return (
    <>
      <DiagonalTrack sliderRef={leftRef} value={leftVal} side="left" />
      <DiagonalTrack sliderRef={rightRef} value={rightVal} side="right" />
      <span style={{ ...labelStyle, bottom: BOTTOM_INSET + TRACK_H + 22, left: '50%', transform: 'translateX(-50%)' }}>
        exhale
      </span>
    </>
  )
}
