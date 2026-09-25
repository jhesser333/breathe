import { useState } from 'react'
import { PASSCODE } from './passcode'

// Full-screen passcode gate shown before anything else (see passcode.js).
// Styled to match the Home screen (SelectModeScreen.jsx): title like "HOME",
// entry box like a mode card, message like a card's description.
export default function PasscodeScreen({ palette, onUnlock }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)

  const handleChange = (e) => {
    const next = e.target.value.slice(0, PASSCODE.length)
    setValue(next)
    setError(false)
    if (next.length === PASSCODE.length) {
      if (next.toLowerCase() === PASSCODE.toLowerCase()) {
        onUnlock()
      } else {
        setError(true)
        setValue('')
      }
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: palette.background,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'sans-serif', padding: '0 16px',
    }}>
      <h1 style={{
        color: palette.tertiaryColor, fontSize: 32, fontWeight: 700,
        letterSpacing: '0.15em', margin: '0 0 24px',
      }}>
        PASSCODE
      </h1>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        maxLength={PASSCODE.length}
        autoFocus
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="Passcode"
        style={{
          width: 160, padding: '16px 0',
          textAlign: 'center', fontSize: 24, fontWeight: 500, letterSpacing: '0.4em',
          color: palette.textColor,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12, outline: 'none',
          fontFamily: 'sans-serif',
        }}
      />
      <p style={{
        color: 'rgba(255,255,255,0.45)', fontSize: 13, height: 20,
        margin: '16px 0 0', opacity: error ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}>
        Incorrect code
      </p>
    </div>
  )
}
