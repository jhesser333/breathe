import OptionsNav from './OptionsNav'

function optionBtn(selected, palette) {
  return {
    width: '100%', maxWidth: 320,
    padding: '12px 20px',
    background: selected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
    border: selected ? '1px solid rgba(255,255,255,0.55)' : '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12,
    cursor: 'pointer', textAlign: 'left',
    color: palette.textColor, fontFamily: 'sans-serif',
  }
}

// Control Options. The Vertical sliders ('vertical': sliders on the left and
// right edges of the screen) are hidden but still implemented.
const OPTIONS = [
  { id: 'diagonal', label: 'Double Sliders', desc: 'Simultaneously move two sliders up when you inhale and down when you exhale.' },
  { id: 'single', label: 'Single Slider', desc: 'When you inhale, slide a finger up anywhere on the screen. Slide it down when you exhale.' },
  { id: 'touch', label: 'Touch the Screen', desc: 'Touch the screen when you inhale, and lift your finger when you exhale.' },
  { id: 'tilt', label: 'Tilt Your Phone', desc: 'When you inhale, tilt your phone up toward vertical. When you exhale, tilt it back toward flat.' },
  { id: 'blow', label: 'Blow on the Mic', desc: 'When you exhale, tilt your phone toward flat while blowing gently through pursed lips toward it. When you inhale, tilt it back up toward vertical.' },
]

export default function SliderLayoutsScreen({ selected, onSelect, onHome, onStart, onArtOptions, modeLabel, palette, tiltFailed = false, micFailed = false }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: palette.background,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: 32, paddingBottom: 150,
      fontFamily: 'sans-serif',
    }}>
      <h1 style={{ color: palette.primaryColor, fontSize: 24, fontWeight: 300, letterSpacing: '0.1em', margin: '0 0 16px' }}>
        CONTROL OPTIONS
      </h1>
      {OPTIONS.map(opt => (
        <button key={opt.id} style={optionBtn(selected === opt.id, palette)} onClick={() => onSelect(opt.id)}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>{opt.label} {selected === opt.id && '✓'}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>{opt.desc}</div>
          {opt.id === 'tilt' && tiltFailed && (
            <div style={{ fontSize: 13, color: palette.primaryColor, marginTop: 3 }}>Motion access is off, so Double Sliders will be used.</div>
          )}
          {opt.id === 'blow' && (micFailed || tiltFailed) && (
            <div style={{ fontSize: 13, color: palette.primaryColor, marginTop: 3 }}>{micFailed ? 'Microphone' : 'Motion'} access is off, so Double Sliders will be used.</div>
          )}
        </button>
      ))}

      <OptionsNav
        onHome={onHome}
        onStart={onStart}
        otherLabel="Art Options"
        onOther={onArtOptions}
        modeLabel={modeLabel}
        palette={palette}
      />
    </div>
  )
}
