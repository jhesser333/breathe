# Breathe

## What we're building
A mobile-first React Three Fiber app where two thumb sliders drive real-time animation of a central 3D form (the Morph) as it appears to travel through an environment full of Gates. Users choose from three modes on a home screen, each offering a different breathing experience.

## Vocabulary

**Morph** — the central animated form, always fixed at the origin. Currently a rounded cube. Follows squash-and-stretch principles. Both sliders control its shape, color, and glow live.

**Environment** — everything surrounding the Morph. Scrolls past the Morph to create the illusion of forward movement (like driving, with the Morph in front of you).

**Road** — the invisible path the Morph travels along. Runs along the Z-axis. Negative Z = forward (ahead of Morph); positive Z = behind (toward camera). No geometry yet — just a conceptual line in space.

**Gate** — an invisible plane perpendicular to the Road that the Morph passes through. Visualized by two egg-shaped objects on either side of the Road. Gates fade in over 1 second when they spawn. The next gate always spawns the moment the current gate passes through the Morph (z=0), so there is always a gate visible.

## Slider controls

| Slider | Shape | Color / Glow | Label (top / bottom) |
|--------|-------|--------------|----------------------|
| Left (0=bottom, 1=top) | Horizontal scale: lerp(0.6, 2.5) | Diffuse color: green → blue | inhale / exhale |
| Right (0=bottom, 1=top) | Vertical scale: lerp(0.6, 2.0) | Emissive intensity: lerp(0, 4) | exhale / inhale |

- Left slider starts at 0 (bottom). Right slider starts at 1 (top) — Morph launches as a tall rectangular form.
- Slider values are stored as refs (not state) to avoid re-renders. Updates happen in `useFrame`.

## Modes

### Basic
- Morph + environment, no Gates.
- Tutorial text: *"Move the sliders up and down along with your breath"*

### Paced Breathing
- Full experience with Gates at a fixed 12-second interval.
- Tutorial text: *"Move the sliders up and down with your breath. Time your breathing so the object fits through the gates"*

### Slowing Down
- **Phase 1 (learning)**: No Gates. App tracks breath cycles on the left slider (bottom → peak → bottom = one cycle). After 3 complete breath cycles, Phase 2 begins.
- **Phase 2 (gates)**: Gates spawn at an interval equal to the user's average breath length, then linearly ramp to 2× that interval over 60 seconds — gates slow down as if the Morph is decelerating.
- Tutorial text phase 1: *"Move the sliders up and down along with your breath"*
- Tutorial text phase 2: *"Now begin to time your breath so the object fits through the gates"* (force-shown for 5 seconds even if sliders are moving)

Breath detection uses the left slider only. A cycle is: slider falls below 0.15 (bottom), rises above 0.5 (peak), returns below 0.15 (bottom). Minimum cycle duration: 1.5 seconds.

## Tutorial text rules
- Text is always visible for exactly **5 seconds** then fades out.
- If sliders move while text is showing, text hides immediately (unless force-shown).
- Once hidden, text reappears only after **10 consecutive seconds** of no slider movement.
- **Force-show**: when new instructions appear mid-session (e.g. Phase 2 start in Slowing Down), text shows for 5 seconds regardless of slider movement, then reverts to normal rules.

## Current scene setup
- **Camera**: position `[0, 2.9, 5]`, fov 50 — ~30° downward angle, shows road ahead
- **Background**: `#1a1028` (dark desaturated purple)
- **Lights**: ambientLight 0.4 + directionalLight at `[5, 5, 5]`
- **Morph**: RoundedBox args=`[2,2,2]`, radius=0.3, smoothness=4
- **Gates**: pool of 3, egg shapes (scaled sphere 0.35r × [1,1.5,1]) at x=±1.2, color `#c89070` (light desaturated orange). Event-based spawning: speed = 20 / interval. Despawn at z=+6.

## File structure
```
src/
  App.jsx                   — Canvas + slider refs + mode state + tutorial logic
  Morph.jsx                 — RoundedBox, scale/color driven by leftVal/rightVal refs
  Gates.jsx                 — gate pool: event-based spawning, fade-in, egg shapes
  Sliders.jsx               — DOM overlay, two vertical touch sliders with inhale/exhale labels
  useTouchSlider.js         — touch hook with identifier tracking (supports multi-touch)
  HomeScreen.jsx            — mode selection screen (Basic, Paced Breathing, Slowing Down)
  TutorialText.jsx          — fade-in/out tutorial overlay, positioned near top of screen
  SlowingDownController.jsx — R3F component: breath cycle detection + dynamic gate interval
  main.jsx                  — entry point
```

## Tech stack
- React Three Fiber (Three.js)
- @react-three/drei (RoundedBox, etc.)
- Custom GLSL shaders/materials (planned)
- Touch/slider input → live parameter control

## Workflow
1. Describe what you want
2. Claude builds it in React Three Fiber
3. Iterate via phone testing / descriptions
4. `git push` → Vercel auto-deploys → https://breathe-omega-ivory.vercel.app/
