import { MODE_LABELS } from './copy'

const OPTIONS = [
  {
    id: 'basic',
    label: MODE_LABELS.basic,
    desc: 'Move with your breath',
  },
  {
    id: 'timed',
    label: MODE_LABELS.timed,
    desc: 'Time your breath to fit through the gates',
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

export default function SelectModeScreen({ onSelect, onPersonalize, onSliderLayouts, onColor, palette }) {
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
        onClick={onColor}
        style={{ ...pillStyle, position: 'absolute', top: 16, right: 16 }}
      >
        Colors
      </button>
      <button
        onClick={onPersonalize}
        style={{ ...pillStyle, position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}
      >
        Personalize
      </button>
      <h1 style={{
        color: '#ffffff', fontSize: 32, fontWeight: 300,
        letterSpacing: '0.15em', margin: '0 0 8px',
      }}>
        HOME
      </h1>
      <h2 style={{
        color: '#ffffff', fontSize: 18, fontWeight: 300,
        letterSpacing: '0.12em', margin: '0 0 10px',
      }}>
        Modes
      </h2>
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
