import OptionsNav from './OptionsNav'

function optionBtn(selected, palette) {
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

export default function PersonalizeScreen({ shapeOption, onSelectShape, onSelectMode, onStart, onControlOptions, modeLabel, palette }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: palette.background,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'flex-start',
      gap: 16, padding: 32, paddingTop: 60, paddingBottom: 150,
      fontFamily: 'sans-serif',
    }}>
      <h1 style={{ color: palette.primaryColor, fontSize: 24, fontWeight: 300, letterSpacing: '0.1em', margin: '0 0 16px' }}>
        ART OPTIONS
      </h1>
      <div style={{
        width: '100%', maxWidth: 320,
        height: 380,
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <button style={optionBtn(shapeOption === 'b', palette)} onClick={() => onSelectShape('b')}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Morphing Cube with Targets {shapeOption === 'b' && '✓'}</div>
        </button>
        <button style={optionBtn(shapeOption === 'd', palette)} onClick={() => onSelectShape('d')}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Morphing Sphere that Disappears {shapeOption === 'd' && '✓'}</div>
        </button>
        <button style={optionBtn(shapeOption === 'f', palette)} onClick={() => onSelectShape('f')}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Hot Air Balloon (in-progress) {shapeOption === 'f' && '✓'}</div>
        </button>
        <button style={optionBtn(shapeOption === 'g', palette)} onClick={() => onSelectShape('g')}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Paper Airplane (in-progress) {shapeOption === 'g' && '✓'}</div>
        </button>
        <button style={optionBtn(shapeOption === 'h', palette)} onClick={() => onSelectShape('h')}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Balloon (in-progress) {shapeOption === 'h' && '✓'}</div>
        </button>
        <button style={optionBtn(shapeOption === 'i', palette)} onClick={() => onSelectShape('i')}>
          <div style={{ fontSize: 17, fontWeight: 500 }}>Input Test {shapeOption === 'i' && '✓'}</div>
        </button>
      </div>

      <OptionsNav
        onHome={onSelectMode}
        onStart={onStart}
        otherLabel="Control Options"
        onOther={onControlOptions}
        modeLabel={modeLabel}
        palette={palette}
      />
    </div>
  )
}
