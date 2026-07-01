export default function BreathLengthControl({ breathLength, onIncrease, onDecrease }) {
  const atMin = breathLength <= 4
  const atMax = breathLength >= 30

  const btnStyle = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 8,
    color: 'rgba(255,255,255,0.7)',
    cursor: 'pointer',
    fontFamily: 'sans-serif',
    fontSize: 18,
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  }

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: 16,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      pointerEvents: 'auto',
    }}>
      <span style={{
        color: 'rgba(255,255,255,0.55)',
        fontFamily: 'sans-serif',
        fontSize: 11,
        letterSpacing: '0.03em',
        textAlign: 'center',
        whiteSpace: 'nowrap',
      }}>
        Adjust Breath Length
      </span>
      <button onClick={onIncrease} disabled={atMax} style={{ ...btnStyle, opacity: atMax ? 0.3 : 1 }}>▲</button>
      <span style={{
        color: 'rgba(255,255,255,0.7)',
        fontFamily: 'sans-serif',
        fontSize: 15,
        letterSpacing: '0.03em',
        minWidth: 44,
        textAlign: 'center',
      }}>
        {breathLength.toFixed(1)}s
      </span>
      <button onClick={onDecrease} disabled={atMin} style={{ ...btnStyle, opacity: atMin ? 0.3 : 1 }}>▼</button>
    </div>
  )
}
