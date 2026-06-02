export default function TutorialText({ text, visible }) {
  return (
    <div style={{
      position: 'absolute',
      top: 72, left: 0, right: 0,
      display: 'flex', justifyContent: 'center',
      pointerEvents: 'none',
      padding: '0 80px',
    }}>
      <p style={{
        color: 'rgba(255,255,255,0.9)',
        fontSize: 20,
        textAlign: 'center',
        fontFamily: 'sans-serif',
        fontWeight: 700,
        lineHeight: 1.5,
        maxWidth: 280,
        opacity: visible ? 1 : 0,
        transition: 'opacity 1.5s ease',
        margin: 0,
      }}>
        {text}
      </p>
    </div>
  )
}
