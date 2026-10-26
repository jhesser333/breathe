import StartButton from './StartButton'

const pillStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8, color: 'rgba(255,255,255,0.7)',
  padding: '8px 14px', fontSize: 13,
  cursor: 'pointer', fontFamily: 'sans-serif',
  whiteSpace: 'nowrap',
}

// Bottom nav for the Art Options and Control Options screens: Home on the
// left, a small Start in the middle (launches the mode selected on Home, named
// in the caption above), and the other option screen on the right.
export default function OptionsNav({ onHome, onStart, otherLabel, onOther, modeLabel, palette }) {
  return (
    <div style={{
      position: 'absolute', bottom: 16, left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex', flexDirection: 'column',
      gap: 8, alignItems: 'center',
    }}>
      <div style={{ color: palette.textColor, opacity: 0.7, fontSize: 13, whiteSpace: 'nowrap' }}>
        {modeLabel}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={onHome} style={pillStyle}>Home: Mode Options</button>
        <StartButton onClick={onStart} palette={palette} size={72} fontSize={16} />
        <button onClick={onOther} style={pillStyle}>{otherLabel}</button>
      </div>
    </div>
  )
}
