export default function TutorialText({ text, visible, opacity, fadeMs = 2000 }) {
  const alpha = typeof opacity === 'number' ? opacity : (visible ? 1 : 0)
  const transition = typeof opacity === 'number' ? 'none' : `opacity ${fadeMs}ms ease`
  return (
    <div style={{
      position: 'absolute',
      top: '38%', left: 0, right: 0,
      transform: 'translateY(-50%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
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
        whiteSpace: 'pre-line',
        opacity: alpha,
        transition,
        margin: 0,
      }}>
        {text}
      </p>
    </div>
  )
}
