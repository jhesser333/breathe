const btnStyle = {
  width: '100%', maxWidth: 320,
  padding: '20px 24px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 12,
  cursor: 'pointer', textAlign: 'left',
  color: '#ffffff', fontFamily: 'sans-serif',
}

export default function HomeScreen({ onPersonalize, onSelectMode, onSliderLayouts, palette }) {
  const items = [
    { label: 'Personalize', desc: 'Choose the shape and color of your experience', onClick: onPersonalize },
    { label: 'Select Mode', desc: 'Choose a breathing exercise to begin', onClick: onSelectMode },
    { label: 'Slider Layouts', desc: 'Choose vertical or diagonal sliders', onClick: onSliderLayouts },
  ]
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: palette.background,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 32,
      fontFamily: 'sans-serif',
    }}>
      {items.map(({ label, desc, onClick }) => (
        <button key={label} onClick={onClick} style={btnStyle}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>{label}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>{desc}</div>
        </button>
      ))}
    </div>
  )
}
