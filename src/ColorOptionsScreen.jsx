const backBtnStyle = {
  position: 'absolute', top: 16, left: 16,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8, color: 'rgba(255,255,255,0.7)',
  padding: '8px 14px', fontSize: 13,
  cursor: 'pointer', fontFamily: 'sans-serif',
}

const continueBtnStyle = {
  position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.18)',
  borderRadius: 8, color: 'rgba(255,255,255,0.7)',
  padding: '8px 14px', fontSize: 13,
  cursor: 'pointer', fontFamily: 'sans-serif',
}

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

export default function ColorOptionsScreen({ selected, onSelect, onBack, onHome, onContinue, palette }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: palette.background,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 32,
      fontFamily: 'sans-serif',
    }}>
      <button style={backBtnStyle} onClick={onBack}>← Personalize</button>
      <button style={{ ...backBtnStyle, left: 'auto', right: 16 }} onClick={onHome}>Home</button>
      <h1 style={{ color: '#ffffff', fontSize: 24, fontWeight: 300, letterSpacing: '0.1em', margin: '0 0 16px' }}>
        Color Options
      </h1>
      <button style={optionBtn(selected === 'a')} onClick={() => onSelect('a')}>
        <div style={{ fontSize: 17, fontWeight: 500 }}>Palette A {selected === 'a' && '✓'}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>Teal · Pink glow · Warm orange gates</div>
      </button>
      <button style={optionBtn(selected === 'b')} onClick={() => onSelect('b')}>
        <div style={{ fontSize: 17, fontWeight: 500 }}>Palette B {selected === 'b' && '✓'}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>Deep blue · Teal glow · Purple gates</div>
      </button>
      <button style={continueBtnStyle} onClick={onContinue}>Continue Playing</button>
    </div>
  )
}
