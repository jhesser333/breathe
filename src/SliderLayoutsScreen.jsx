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

const OPTIONS = [
  { id: 'vertical', label: 'Vertical', desc: 'Sliders on the left and right edges of the screen' },
  { id: 'horizontal', label: 'Horizontal', desc: 'Sliders side by side near the bottom of the screen' },
  { id: 'diagonal', label: 'Diagonal', desc: 'Sliders angled inward near the bottom of the screen' },
]

export default function SliderLayoutsScreen({ selected, onSelect, onHome, palette }) {
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
        Slider Layouts
      </h1>
      {OPTIONS.map(opt => (
        <button key={opt.id} style={optionBtn(selected === opt.id)} onClick={() => onSelect(opt.id)}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>{opt.label} {selected === opt.id && '✓'}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>{opt.desc}</div>
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
        Home
      </button>
    </div>
  )
}
