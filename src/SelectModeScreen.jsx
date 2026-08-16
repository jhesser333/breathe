import { MODE_LABELS } from './copy'

const OPTIONS = [
  {
    id: 'basic',
    label: MODE_LABELS.basic,
    desc: 'Move with your breath',
  },
  {
    id: 'slowing',
    label: MODE_LABELS.slowing,
    desc: 'The app times your breathing then gently helps you slow down',
  },
  {
    id: 'box',
    label: MODE_LABELS.box,
    desc: 'Inhale, hold, exhale, hold — equal phases guided by the gates',
  },
]

const pillStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8, color: 'rgba(255,255,255,0.7)',
  padding: '8px 14px', fontSize: 13,
  cursor: 'pointer', fontFamily: 'sans-serif',
}

function modeBtnStyle(selected) {
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

export default function SelectModeScreen({ onStart, onPersonalize, onSliderLayouts, palette, selectedMode, onSelectModeChange }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: palette.background,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 32,
      fontFamily: 'sans-serif',
    }}>
      <button
        onClick={onSliderLayouts}
        style={{
          position: 'absolute', top: 16, left: 16,
          width: 28, height: 28, padding: 0,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6,
          cursor: 'pointer',
        }}
      />
      <div style={{
        position: 'absolute', bottom: 16, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column',
        gap: 20, alignItems: 'center',
      }}>
        <button
          onClick={() => onStart(selectedMode)}
          style={{
            transform: 'translateY(-24px)',
            width: 110, height: 110, borderRadius: '50%',
            background: '#ff69b4', border: 'none',
            color: '#ffffff', fontSize: 20, fontWeight: 700,
            fontFamily: 'sans-serif', cursor: 'pointer',
          }}
        >
          Start
        </button>
        <button onClick={onPersonalize} style={pillStyle}>
          Change the Art
        </button>
      </div>
      <h1 style={{
        color: '#ff69b4', fontSize: 32, fontWeight: 700,
        letterSpacing: '0.15em', margin: '0 0 8px',
        transform: 'translateY(-72px)',
      }}>
        HOME
      </h1>
      <div style={{ transform: 'translateY(-48px)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <h2 style={{
          color: '#ffffff', fontSize: 24, fontWeight: 300,
          letterSpacing: '0.1em', margin: '0 0 16px',
        }}>
          Modes
        </h2>
        {OPTIONS.map(opt => (
          <button
            key={opt.id}
            onClick={() => onSelectModeChange(opt.id)}
            style={modeBtnStyle(selectedMode === opt.id)}
          >
            <div style={{ fontSize: 17, fontWeight: 500 }}>{opt.label} {selectedMode === opt.id && '✓'}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>{opt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
