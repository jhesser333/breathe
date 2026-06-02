export default function TutorialText({ text, visible }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
      padding: '0 48px',
    }}>
      <p style={{
        color: 'rgba(255,255,255,0.85)',
        fontSize: 17,
        textAlign: 'center',
        fontFamily: 'sans-serif',
        fontWeight: 300,
        lineHeight: 1.6,
        maxWidth: 260,
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.5s ease',
        margin: 0,
      }}>
        {text}
      </p>
    </div>
  )
}
