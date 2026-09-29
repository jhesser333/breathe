import { useEffect, useMemo } from 'react'
import { useTouchSlider } from './useTouchSlider'
import { UI_EDGE, UI_INTERIOR, UI_FILL, UI_THUMB, UI_THUMB_GLOW } from './uiColors'
import {
  CURVE_BOX_W, CURVE_BOX_H, TRACK_THICKNESS, THUMB_SIZE,
  P0_FRAC, P2_FRAC, sampleCurve, getPathD, pointAtArcFrac,
} from './diagonalCurveGeometry'

const INNER_GAP = 20
const BOTTOM_INSET = 16
const INHALE_LABEL_GAP = 14 // label bottom to top of the thumb at the inhale end
const EXHALE_LABEL_GAP = 6  // bottom of the track caps to label top

const labelStyle = {
  position: 'absolute',
  color: 'var(--live-tertiary-color, #276d8c)',
  fontSize: 22,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  fontFamily: 'sans-serif',
  fontWeight: 700,
  letterSpacing: '0.06em',
  userSelect: 'none',
  pointerEvents: 'none',
}

function DiagonalTrack({ sliderRef, value, side }) {
  const isLeft = side === 'left'
  const w = CURVE_BOX_W, h = CURVE_BOX_H

  const { totalLength } = useMemo(() => sampleCurve(side, w, h), [side])
  const pathD = useMemo(() => getPathD(side, w, h), [side])
  const edgeMaskId = `slider-edge-${side}`

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
      <span style={{
        ...labelStyle,
        color: 'var(--inhale-label-color, var(--live-tertiary-color, #276d8c))',
        opacity: 'var(--inhale-label-opacity, 0.5)',
        textShadow: 'var(--inhale-label-glow, none)',
        left: (isLeft ? P2_FRAC.x : 1 - P2_FRAC.x) * w,
        top: P2_FRAC.y * h - THUMB_SIZE / 2 - INHALE_LABEL_GAP,
        transform: 'translate(-50%, -100%)',
      }}>
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
          {/* Edge = a stroke 1px wider on each side than the track, with the
              track itself masked out so the edge is only a thin outline (like
              the buttons' border) and never stacks under the interior. */}
          <defs>
            <mask id={edgeMaskId} maskUnits="userSpaceOnUse" x={-w} y={-h} width={w * 3} height={h * 3}>
              <rect x={-w} y={-h} width={w * 3} height={h * 3} fill="white" />
              <path d={pathD} stroke="black" strokeWidth={TRACK_THICKNESS} strokeLinecap="round" fill="none" />
            </mask>
          </defs>
          <path d={pathD} style={{ stroke: UI_EDGE }} strokeWidth={TRACK_THICKNESS + 2}
                strokeLinecap="round" fill="none" mask={`url(#${edgeMaskId})`} />
          <path d={pathD} style={{ stroke: UI_INTERIOR }} strokeWidth={TRACK_THICKNESS}
                strokeLinecap="round" fill="none" />
          <path d={pathD} style={{ stroke: UI_FILL }} strokeWidth={TRACK_THICKNESS}
                strokeLinecap="round" fill="none"
                strokeDasharray={`${dashLength} ${totalLength}`} strokeDashoffset={0} />
        </svg>
        <div style={{
          position: 'absolute',
          left: thumb.x, top: thumb.y,
          transform: 'translate(-50%, -50%)',
          width: THUMB_SIZE, height: THUMB_SIZE,
          borderRadius: '50%',
          background: UI_THUMB,
          boxShadow: `0 0 8px ${UI_THUMB_GLOW}`,
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  )
}

export default function SlidersDiagonal({ onLeft, onRight, leftRawRef, rightRawRef, shiftUp = 0 }) {
  const [leftRef, leftVal] = useTouchSlider(0, leftRawRef, 'diagonal-left')
  const [rightRef, rightVal] = useTouchSlider(1, rightRawRef, 'diagonal-right')

  useEffect(() => { onLeft(leftVal) }, [leftVal])
  useEffect(() => { onRight(rightVal) }, [rightVal])

  const exhaleLabelBottom = BOTTOM_INSET + (1 - P0_FRAC.y) * CURVE_BOX_H
    - TRACK_THICKNESS / 2 - EXHALE_LABEL_GAP

  return (
    <div style={{ position: 'absolute', inset: 0, transform: `translateY(-${shiftUp}px)` }}>
      <DiagonalTrack sliderRef={leftRef} value={leftVal} side="left" />
      <DiagonalTrack sliderRef={rightRef} value={rightVal} side="right" />
      <span style={{ ...labelStyle, color: 'var(--exhale-label-color, var(--live-tertiary-color, #276d8c))', opacity: 'var(--exhale-label-opacity, 0.5)', textShadow: 'var(--exhale-label-glow, none)', bottom: exhaleLabelBottom, left: '50%', transform: 'translate(-50%, 100%)' }}>
        exhale
      </span>
    </div>
  )
}
