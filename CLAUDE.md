@./.mv/MobileVibe.md

# Breathe

A mobile-first React Three Fiber breathing app. The user's breath (via sliders, touch, tilt or the mic) drives a central 3D form, the **Morph**, as it seems to travel through an environment of **Gates** (targets) that pace the breath. Home (Select Mode) offers the modes; Art Options picks the art (shape); Control Options picks the input.

Deployed: https://breathe-omega-ivory.vercel.app/ (Vercel auto-deploys on push to `main`).

## Detail docs (read the relevant one before working on an area)
| Doc | Covers |
|---|---|
| `docs/controls.md` | Slider value semantics, Diagonal slider geometry, Control Options, driven controls (single/touch/tilt), Blow on the Mic detector + mic check, Input Test |
| `docs/audio.md` | `breathAudio.js`: slider/pace pairs, bells, groups, home loop, iOS resume |
| `docs/modes.md` | Tutorial, Box Breathing, Slowing Down (recording, ramp, target pace), hidden Own Pace / Paced Breathing |
| `docs/tutorial-text.md` | All tutorial/caption text rules, fades, 5-count tutorial, idle re-show |
| `docs/screens.md` | Passcode, Home, option screens, nav, palettes and live UI colors, background derivation |
| `docs/scene-and-gates.md` | Morph material, shared gate behavior, road ties, camera/lights/bloom, axes |
| `docs/art-cube.md` | B — Morphing Cube: gates, target reactions, 5-breath count, landscape |
| `docs/art-sphere.md` | D — Morphing Sphere: headless gates, pace rings, silhouette ring, count sets |
| `docs/art-hot-air-balloon.md` | F — Hot Air Balloon |
| `docs/art-paper-airplane.md` | G — Paper Airplane |
| `docs/art-balloon.md` | H — Balloon |
| `docs/art-spaceship.md` | J — Space Ship |
| `docs/art-hidden-a-c-e.md` | A, C, E — hidden art options |
| `docs/file-structure.md` | What every file in `src/` does |

When behavior changes, update the matching doc (and this file only if the overview changes).

## Vocabulary
- **Morph** — the central animated form at [0, 0.25, 0].
- **Inhale State** — breath value 1: Morph tall and narrow, strong inner glow. **Exhale State** — breath value 0: Morph wide and flat, dim.
- **Gates / targets** — shapes that scroll toward the Morph to pace the breath; judged as they reach z = 0.
- **Environment** — everything around the Morph. **Road** — the path along Z.
- **Axes** — X width, Y height, Z depth: negative Z is ahead, positive Z toward the camera.
- **Hold-in / Hold-out** — Box Breathing's holds after Inhale / after Exhale.

## Core rules
- **The right slider drives everything.** App exposes it as `breathRef` (`1 − rightVal`, 0 exhale → 1 inhale) and `breathRawRef`, passed wherever "left slider" used to go. The left slider only drives the slider audio pair. Left slider starts at 0, right at 1 (Exhale).
- **Slider-driven values ease in and out**: Morphs smoothstep the breath value once per frame and build every lerp on that. Detectors that read input (breath-cycle detection) use the raw value.
- Slider values are refs, not state; updates happen in `useFrame`.
- **5-breath cycle**: every 5 counted breaths the palette (`BREATH_CYCLE_PALETTES`: Teal, Burnt Sienna, Pink) and the slider audio group change. Menus stay on the fixed Teal Palette.
- **Palette naming**: `primaryColor` / `secondaryColor` / `tertiaryColor` (scene), `background`, `textColor` / `headerColor` / `subheaderColor` (UI).

## Modes (picker order)
- **Guided Breathing: Tutorial** (`'tutorial'`, default) — 3 parts with Continue: slider practice, 5-breath counting, then a paced 6-6 start.
- **Guided Breathing: Box Breathing** (`'box'`) — Inhale, Hold, Exhale, Hold; 6 s each, 4 counts.
- **Guided Breathing: Slowing Down** (`'slowing'`) — records the user's pace, then ramps it to the target pace (6-6 default, 5-5, 4-6) over 60 s.
- Hidden but still in the code: **Breathe at Your Own Pace** (`'basic'`, a saved one moves to Tutorial), **Paced Breathing** (`'timed'`).

## Art options (Art Options card order)
- **B — Morphing Cube with Targets** — rounded-box Morph, cube targets, landscape.
- **D — Morphing Sphere that Disappears** (default) — dissolving sphere (`MorphC`), no visible gates except in Box Breathing; pacing via pace rings and background.
- **F — Hot Air Balloon** (in progress) — balloon with count pieces in the envelope, cloud gates.
- **G — Paper Airplane** (in progress) — plane flown by breath and side tilt; bar and ring targets.
- **H — Balloon** (in progress) — the course moves only when the user exhales through an open door.
- **J — Space Ship** (in progress) — Blow on the Mic only; blow to fly to a sphere and dock.
- **I — Input Test** — no art, a readout of tilt and mic values.
- Hidden but still in the code: **A** (sphere + torus gates), **C** (dissolving sphere + torus/sphere gates), **E** (Rotating Rings; a saved `'e'` moves to D).

## Controls (Control Options)
Double Sliders (`'diagonal'`, default), Single Slider, Touch the Screen, Tilt Your Phone, Blow on the Mic. The driven controls write the same slider refs, so everything downstream is unchanged. If tilt or the mic fails, the app falls back to Double Sliders. Hidden but still in the code: Vertical sliders (`'vertical'`, a saved one moves to Diagonal).

## Testing defaults
`src/passcode.js`: passcode `DEMO`. While `RESET_ON_UNLOCK` is true, entering it resets everyone to `TESTING_DEFAULTS` (Tutorial, Shape D, Double Sliders, 6-6).

## Tech stack
- React Three Fiber + Three.js, @react-three/drei, @react-three/postprocessing v2 (Bloom)
- Custom GLSL via `onBeforeCompile`
- Web Audio API for sound; touch, motion and mic input via refs

## Workflow
1. Describe what you want
2. Claude builds it in React Three Fiber
3. Iterate via phone testing / descriptions
4. `git add -A && git commit -m "..." && git push` → Vercel auto-deploys → https://breathe-omega-ivory.vercel.app/
