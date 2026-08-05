const OPTIONS = [
  {
    id: 'basic',
    label: 'Basic',
    desc: 'Move with your breath',
  },
  {
    id: 'timed',
    label: 'Paced Breathing',
    desc: 'Time your breath to fit through the gates',
  },
  {
    id: 'slowing',
    label: 'Slowing Down',
    desc: 'The app times your breathing then gently helps you slow down',
  },
  {
    id: 'box',
    label: 'Box Breathing',
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

export default function SelectModeScreen({ onSelect, onPersonalize, onSliderLayouts, palette }) {
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
        style={{ ...pillStyle, position: 'absolute', top: 16, left: 16 }}
      >
        Slider Layouts
      </button>
      <button
        onClick={onPersonalize}
        style={{ ...pillStyle, position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}
      >
        Personalize
      </button>
      <h1 style={{
        color: '#ffffff', fontSize: 28, fontWeight: 300,
        marginBottom: 16, letterSpacing: '0.12em', margin: '0 0 24px',
      }}>
        Modes
      </h1>
      {OPTIONS.map(opt => (
        <button
          key={opt.id}
          onClick={() => onSelect(opt.id)}
          style={{
            width: '100%', maxWidth: 320,
            padding: '20px 24px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 12,
            cursor: 'pointer', textAlign: 'left',
            color: '#ffffff', fontFamily: 'sans-serif',
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 500 }}>{opt.label}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>{opt.desc}</div>
        </button>
      ))}
    </div>
  )
}
