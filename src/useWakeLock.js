import { useEffect } from 'react'

// Keeps the screen awake while active (a breathing session), so hands-free
// controls (Blow on the Mic, Tilt Your Phone) and long holds don't let the
// phone dim and lock. Uses the Screen Wake Lock API where the browser has it
// (iOS Safari 16.4+, Chrome); elsewhere the phone sleeps as usual. The phone
// drops the lock when the page is hidden, so it's re-requested on return and
// on any tap.
export function useWakeLock(active) {
  useEffect(() => {
    const wl = typeof navigator !== 'undefined' ? navigator.wakeLock : undefined
    if (!active || !wl) return
    let lock = null
    let pending = false
    let done = false

    const acquire = () => {
      if (done || pending || (lock && !lock.released) || document.visibilityState !== 'visible') return
      pending = true
      wl.request('screen').then((l) => {
        if (done) l.release().catch(() => {})
        else lock = l
      }).catch(() => {}).finally(() => { pending = false })
    }
    const onVisible = () => { if (document.visibilityState === 'visible') acquire() }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pointerup', acquire, { passive: true })
    return () => {
      done = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pointerup', acquire)
      lock?.release().catch(() => {})
    }
  }, [active])
}
