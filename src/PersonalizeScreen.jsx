const btnStyle = {
  width: '100%', maxWidth: 320,
  padding: '20px 24px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 12,
  cursor: 'pointer', textAlign: 'left',
  color: '#ffffff', fontFamily: 'sans-serif',
}

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

export default function PersonalizeScreen({ onShape, onColor, onBack, onContinue, palette }) {
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
        Personalize
      </h1>
      <button style={btnStyle} onClick={onShape}>
        <div style={{ fontSize: 17, fontWeight: 500 }}>Shapes</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>Choose the shape of the Morph and Gates</div>
      </button>
      <button style={btnStyle} onClick={onColor}>
        <div style={{ fontSize: 17, fontWeight: 500 }}>Colors</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 5 }}>Choose a color palette</div>
      </button>
      <div style={{
        position: 'absolute', bottom: 16, left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column',
        gap: 20, alignItems: 'center',
      }}>
        {[
          { label: 'Select Mode', onClick: onBack },
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
