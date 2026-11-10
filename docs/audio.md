# Audio

_Moved out of CLAUDE.md on 2026-11-10. Detail reference: read when working on this area._

## Audio (`breathAudio.js`)
Two looping crossfade pairs, played with the Web Audio API (`createAudioEngine`; `audioRef` in App.jsx). Each file is a looping `AudioBufferSourceNode`, so loops are seamless, with its own gain. In each pair, a plays at full level all the time, and b's gain follows the breath value (0 exhale → 1 inhale): it fades in over the Inhale and out over the Exhale. This replaced the earlier equal-power a↔b crossfade.
- **Files:** `public/audio/<pair>_<group><a|b>.wav`.
  - `pair` = `slider` (user-driven) or `pace` (app-paced breath); `a` = exhale/default, `b` = inhale.
  - `group` = 1, 2, 3…; only complete a/b pairs are used.
  - The file list is read at build time (`vite.config.js` defines `__AUDIO_FILES__`), so new groups need no code change.
- **Slider pair:** follows the **left slider** (`setLeft` → `setSlider`, smoothstepped).
- **Paced pair:** currently off (`PACE_PAIR_ENABLED = false` in `breathAudio.js`; no `pace_*` files in `public/audio` either), so only the slider pair plays. When on, it follows `getPaceProgress` (App.jsx), fed every frame by `PaceAudioDriver`:
  - **Box Breathing** (from `startBoxArt`): the caption clock (`boxPhaseNow`). Values are Inhale eased 0→1, Hold-in 1, Exhale 1→0, Hold-out 0, so the holds keep looping b or a.
  - **Slowing Down** (from `startPacedArt`): `breathPhaseRef`, eased over each phase's `computePhaseDurations` length.
  - **Otherwise** (tutorial, Own Pace): `null`, which means silent. It fades in or out over `PACE_FADE_S` 2 s when the pace starts or stops.
- **Phase bells:** one-shot `bellkick_3s_a.wav` (`BELL_INHALE_EXHALE`; `bell_3s_a.wav` kept as the previous one) at the start of every paced Inhale and Exhale, and `bell_4s_a.wav` (`BELL_HOLD`) at the start of each Box Breathing Hold. App's `getBellPhase` (Box: caption clock; Slowing Down: `slowingPhaseNow`, from the first paced Inhale on) is checked every frame by `PaceAudioDriver`, which calls `playBell`/`stopBell`. Only one bell rings at a time: a new bell cuts the previous one with a `BELL_CUT_FADE_S` 0.1 s fade, so a Hold bell ends as the next phase's bell rings. No bells in the tutorial or Own Pace. Volume `BELL_GAIN` 1; the Inhale-start bell plays at × `BELL_INHALE_GAIN` 0.25 (Exhale and Hold bells at full).
- **Per-file volume:** `FILE_GAIN` in `breathAudio.js` scales individual files without re-exporting (currently slider_1a ×3, slider_3a ×0.32, slider_3b ×0.24).
- **Groups:** each 5-breath palette change (`handleBreathPaletteCycle` → `setCycle`) moves each pair to its next group, wrapping around, with a `GROUP_FADE_S` 2 s crossfade. `setCycle(index, fadeS)` takes an optional crossfade length (the Space Ship's docking passes its inhale time). `audioGroupIndexRef` resets on Start/Restart.
- **Home screen loop:** while Home (Select Mode) shows, slider group `HOME_GROUP` 3 loops with a and b both at full level (× their `FILE_GAIN`), the app's full-Inhale sound, so people can set their volume before starting (`startHome`/`stopHome`, `HOME_FADE_S` 1 s fades). It starts on passcode entry (`handleUnlock` calls `unlock()` + `startHome()`), or on the first tap on Home if the phone blocked that (`SelectModeScreen` `onAnyTap`). An App effect on `screen` turns it on for Home and off for every other screen; `start()` fades it out over 0.5 s as a mode's audio begins.
- **Start/stop:** the audio starts on the Start/Restart tap (`handleSelectMode` calls `unlock()` + `start(0)` inside the tap, as browser autoplay rules require) and fades out on Home (`handleBackFromExperience` → `stop()`).
- **Staying alive:** iOS puts the context in `'interrupted'` (other browsers use `'suspended'`) when the phone locks or the tab goes to the background. `ensureRunning()` resumes it from any state that isn't running; if it's still not running `RESUME_CHECK_MS` 300 ms later, or is `'closed'`, it rebuilds the context and restarts the current group's voices. Decoded buffers are reused. Any `touchend`/`pointerup`/`keydown` while playing calls it, so touching a slider after returning restores the sound; `visibilitychange` also tries a resume. Because iOS can report `'running'` after a lock while staying silent, any trip to the background (`visibilitychange` → hidden, or `pagehide`) marks the context `stale`. The next tap (including Start/Restart via `unlock()`) then rebuilds it outright instead of trusting its state.


