const OPTIONS = [
  {
    id: 'basic',
    label: 'Basic',
    desc: 'Move freely with your breath, no pressure',
  },
  {
    id: 'timed',
    label: 'Timed Breathing',
    desc: 'Time your breath to fit through the gates',
  },
  {
    id: 'slowing',
    label: 'Slowing Down',
    desc: 'The app learns your breath and gently guides you deeper',
  },
]

export default function HomeScreen({ onSelect }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#111111',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16, padding: 32,
      fontFamily: 'sans-serif',
    }}>
      <h1 style={{
        color: '#ffffff', fontSize: 28, fontWeight: 300,
        marginBottom: 16, letterSpacing: '0.12em', margin: '0 0 24px',
      }}>
        Breathe
      </h1>
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
