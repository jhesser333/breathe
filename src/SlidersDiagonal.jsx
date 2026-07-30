import { useEffect, useMemo } from 'react'
import { useTouchSlider } from './useTouchSlider'
import {
  CURVE_BOX_W, CURVE_BOX_H, TRACK_THICKNESS, THUMB_SIZE,
  P0_FRAC, sampleCurve, getPathD, pointAtArcFrac,
} from './diagonalCurveGeometry'

const INNER_GAP = 50
const BOTTOM_INSET = 16

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
  const w = CURVE_BOX_W, h = CURVE_BOX_H

  const { totalLength } = useMemo(() => sampleCurve(side, w, h), [side])
  const pathD = useMemo(() => getPathD(side, w, h), [side])

  const rawArcFrac = isLeft ? value : 1 - value
  const thumb = pointAtArcFrac(side, rawArcFrac, w, h)
  const dashLength = rawArcFrac * totalLength

  const edgeStyle = isLeft
    ? { right: `calc(50% + ${INNER_GAP / 2}px)` }
    : { left: `calc(50% + ${INNER_GAP / 2}px)` }

  return (
    <div style={{
      position: 'absolute',
      bottom: BOTTOM_INSET,
      width: w, height: h,
      ...edgeStyle,
    }}>
      <span style={{ ...labelStyle, top: -22, [isLeft ? 'left' : 'right']: 0 }}>
        inhale
      </span>
      <div
        ref={sliderRef}
        style={{ position: 'absolute', inset: 0, cursor: 'pointer', userSelect: 'none', touchAction: 'none' }}
      >
        <svg
          width={w} height={h} viewBox={`0 0 ${w} ${h}`}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
        >
          <path d={pathD} stroke="rgba(255,255,255,0.15)" strokeWidth={TRACK_THICKNESS + 3}
                strokeLinecap="round" fill="none" />
          <path d={pathD} stroke="rgba(255,255,255,0.08)" strokeWidth={TRACK_THICKNESS}
                strokeLinecap="round" fill="none" />
          <path d={pathD} stroke="rgba(255,255,255,0.35)" strokeWidth={TRACK_THICKNESS}
                strokeLinecap="round" fill="none"
                strokeDasharray={`${dashLength} ${totalLength}`} strokeDashoffset={0} />
        </svg>
        <div style={{
          position: 'absolute',
          left: thumb.x, top: thumb.y,
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

  const exhaleLabelBottom = BOTTOM_INSET + (1 - P0_FRAC.y) * CURVE_BOX_H

  return (
    <>
      <DiagonalTrack sliderRef={leftRef} value={leftVal} side="left" />
      <DiagonalTrack sliderRef={rightRef} value={rightVal} side="right" />
      <span style={{ ...labelStyle, bottom: exhaleLabelBottom, left: '50%', transform: 'translate(-50%, 50%)' }}>
        exhale
      </span>
    </>
  )
}
