import { TARGET_PACES } from './breathPace'

function optionBtn(selected) {
  return {
    width: '100%', maxWidth: 320,
    padding: '20px 24px',
    background: selected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
    border: selected ? '1px solid rgba(255,255,255,0.55)' : '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12,
    cursor: 'pointer', textAlign: 'left',
    color: '#ffffff', fontFamily: 'sans-serif',
  }
}

const OPTIONS = Object.entries(TARGET_PACES).map(([id, v]) => ({ id, label: v.label }))

export default function BreathPaceOptionsScreen({ selected, onSelect, onHome, palette }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: palette.background,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 32,
      fontFamily: 'sans-serif',
    }}>
      <h1 style={{ color: '#ffffff', fontSize: 24, fontWeight: 300, letterSpacing: '0.1em', margin: '0 0 16px' }}>
        Breath Pace Options
      </h1>
      {OPTIONS.map(opt => (
        <button key={opt.id} style={optionBtn(selected === opt.id)} onClick={() => onSelect(opt.id)}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>{opt.label} {selected === opt.id && '✓'}</div>
        </button>
      ))}

      <button
        onClick={onHome}
        style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 8, color: 'rgba(255,255,255,0.7)',
          padding: '8px 14px', fontSize: 13,
          cursor: 'pointer', fontFamily: 'sans-serif',
        }}
      >
        Back
      </button>
    </div>
  )
}
