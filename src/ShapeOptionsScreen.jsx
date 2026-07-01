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

export default function ShapeOptionsScreen({ selected, onSelect, onBack, onHome, onContinue, palette }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: palette.background,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-start',
      gap: 16, padding: 32, paddingTop: 60, paddingBottom: 150,
      fontFamily: 'sans-serif',
    }}>
      <h1 style={{ color: '#ffffff', fontSize: 24, fontWeight: 300, letterSpacing: '0.1em', margin: '0 0 16px' }}>
        Shape Options
      </h1>
      <div style={{
        width: '100%', maxWidth: 320,
        height: 380,
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <button style={optionBtn(selected === 'a')} onClick={() => onSelect('a')}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Option A {selected === 'a' && '✓'}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>Sphere Morph</div>
        </button>
        <button style={optionBtn(selected === 'b')} onClick={() => onSelect('b')}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Option B {selected === 'b' && '✓'}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>Rounded cube Morph</div>
        </button>
        <button style={optionBtn(selected === 'c')} onClick={() => onSelect('c')}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Option C {selected === 'c' && '✓'}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>Disappearing Morph</div>
        </button>
        <button style={optionBtn(selected === 'd')} onClick={() => onSelect('d')}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Option D {selected === 'd' && '✓'}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>Disappearing Cube Morph</div>
        </button>
        <button style={optionBtn(selected === 'e')} onClick={() => onSelect('e')}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Option E {selected === 'e' && '✓'}</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>Disappearing Morph</div>
        </button>
      </div>
      <div style={{
        position: 'absolute', bottom: 16, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column',
        gap: 20, alignItems: 'center',
      }}>
        {[
          { label: 'Personalize', onClick: onBack },
          { label: 'Select Mode', onClick: onHome },
          { label: 'Resume Breathing', onClick: onContinue },
        ].map(({ label, onClick }) => (
          <button key={label} onClick={onClick} style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 8, color: 'rgba(255,255,255,0.7)',
            padding: '8px 14px', fontSize: 13,
            cursor: 'pointer', fontFamily: 'sans-serif',
            whiteSpace: 'nowrap',
          }}>{label}</button>
        ))}
      </div>
    </div>
  )
}
