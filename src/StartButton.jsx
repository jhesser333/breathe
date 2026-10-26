import { useState } from 'react'

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// The round Start button: translucent primary fill (brighter while pressed),
// primary outline and label. Home uses the full size; the option screens a
// smaller one.
export default function StartButton({ onClick, palette, size = 110, fontSize = 20 }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: hexToRgba(palette.primaryColor, pressed ? 0.75 : 0.25),
        border: `2px solid ${palette.primaryColor}`,
        color: palette.primaryColor, fontSize, fontWeight: 700,
        fontFamily: 'sans-serif', cursor: 'pointer',
      }}
    >
      Start
    </button>
  )
}
