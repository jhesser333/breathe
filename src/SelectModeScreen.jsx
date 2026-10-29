import { MODE_LABELS } from './copy'
import StartButton from './StartButton'

// Breathe at Your Own Pace ('basic') and Paced Breathing ('timed') are hidden
// from the picker but still fully implemented.
const OPTIONS = [
  {
    id: 'tutorial',
    label: MODE_LABELS.tutorial,
    desc: 'Try this first to learn how things work',
  },
  {
    id: 'box',
    label: MODE_LABELS.box,
    desc: 'The app guides you through equal phases of Inhale, hold, Exhale, hold',
  },
  {
    id: 'slowing',
    label: MODE_LABELS.slowing,
    desc: 'The app gently helps you slow the pace of your breathing',
  },
]

const pillStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8, color: 'rgba(255,255,255,0.7)',
  padding: '8px 14px', fontSize: 13,
  cursor: 'pointer', fontFamily: 'sans-serif',
}

function modeBtnStyle(selected, palette) {
  return {
    width: '100%', maxWidth: 320,
    padding: '20px 24px',
    background: selected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
    border: selected ? '1px solid rgba(255,255,255,0.55)' : '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12,
    cursor: 'pointer', textAlign: 'left',
    color: palette.textColor, fontFamily: 'sans-serif',
  }
}

// Space Ship (j) runs only in the Tutorial for now.
const SPACE_SHIP_MODES = ['tutorial']

export default function SelectModeScreen({ onStart, onPersonalize, onSliderLayouts, palette, selectedMode, onSelectModeChange, onAnyTap, shapeOption }) {
  return (
    <div onPointerDown={onAnyTap} style={{
      position: 'fixed', inset: 0,
      background: palette.background,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 32,
      fontFamily: 'sans-serif',
    }}>
      <div style={{
        position: 'absolute', bottom: 16, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column',
        gap: 20, alignItems: 'center',
      }}>
        <StartButton onClick={() => onStart(selectedMode)} palette={palette} />
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onPersonalize} style={pillStyle}>
            Art Options
          </button>
          <button onClick={onSliderLayouts} style={pillStyle}>
            Control Options
          </button>
        </div>
      </div>
      <h1 style={{
        color: palette.tertiaryColor, fontSize: 32, fontWeight: 700,
        letterSpacing: '0.15em', margin: '0 0 8px',
        transform: 'translateY(-96px)',
      }}>
        HOME
      </h1>
      <div style={{ transform: 'translateY(-96px)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h2 style={{
          color: palette.textColor, fontSize: 24, fontWeight: 300,
          letterSpacing: '0.1em', margin: '0 0 12px',
        }}>
          MODES
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          {OPTIONS.map(opt => {
            const blocked = shapeOption === 'j' && !SPACE_SHIP_MODES.includes(opt.id)
            return (
              <button
                key={opt.id}
                onClick={blocked ? undefined : () => onSelectModeChange(opt.id)}
                style={{ ...modeBtnStyle(selectedMode === opt.id, palette), ...(blocked ? { opacity: 0.4, cursor: 'default' } : null) }}
              >
                <div style={{ fontSize: 17, fontWeight: 500 }}>{opt.label} {selectedMode === opt.id && '✓'}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>{blocked ? 'Not available with Space Ship yet.' : opt.desc}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
