# Breathe — Living State Doc

## What's built

### Home Screen
- Three mode buttons: Basic, Paced Breathing, Slowing Down
- Dark desaturated purple background (`#1a1028`) matching the experience
- `← Home` button (top-left corner) appears in all modes to return to home screen

### Morph
- RoundedBox (2×2×2, radius 0.3) centered at origin
- Left slider → horizontal scale lerp(0.6, 2.5) + color green→blue
- Right slider → vertical scale lerp(0.6, 2.0) + emissive glow lerp(0, 4)
- Starts as a tall rectangle (right slider initialized at top)
- Scale and color updated every frame in `useFrame` via refs (no re-renders)

### Sliders
- Two DOM overlay sliders, left and right edges of screen
- Labels: left = inhale (top) / exhale (bottom); right = exhale (top) / inhale (bottom)
- Left slider starts at 0 (bottom); right slider starts at 1 (top)
- Multi-touch: each slider tracks its own touch identifier — both thumbs work simultaneously
- Mouse fallback for desktop testing

### Gates
- Pool of 3 gate instances (recycled, no allocation mid-session)
- **Event-based spawning**: next gate spawns the moment current gate passes z=0 (through Morph) — there is always a gate in view
- Each gate's speed = 20 / interval → arrival at Morph is always on time
- Gates fade in over 1 second from transparent (no pop-in)
- Each gate = 2 egg shapes (sphere r=0.35, scale [1,1.5,1]) at x=±1.2, y=0, color `#c89070`
- Despawn at z=+6

### Modes

**Basic** — Morph + environment only, no Gates.

**Paced Breathing** — Gates at fixed 12-second interval.

**Slowing Down** — Two phases:
- Phase 1: No gates, app records breath cycles via left slider (bottom→peak→bottom, min 1.5s)
- After 3 breath cycles: Phase 2 begins
- Phase 2: Gates at `avgBreath` interval, linearly ramping to `avgBreath × 2` over 60 seconds
- SlowingDownController.jsx handles all breath tracking and interval updates

### Tutorial Text
- Positioned near top of screen (above the Morph), bold 20px
- Visible for 5 seconds, then fades out
- Hides immediately when sliders move (unless force-shown)
- Reappears after 10 consecutive seconds of no slider movement
- Force-show (5s, ignores slider movement): used for mid-session instruction changes

### Scene
- Camera at [0, 2.9, 5], ~30° down, fov 50
- Background `#1a1028` (dark desaturated purple)
- Ambient + directional lighting

**Axis orientation**
- **X** — width (left/right)
- **Y** — height (up/down)
- **Z** — depth along the road (negative Z = ahead/into screen; positive Z = behind/toward camera)
- Morph sits at origin `[0, 0, 0]`; gates spawn at z=−20 and travel toward z=0

---

## Ideas / next iterations

### Morph
- Try particle-based Morph
- Add smooth easing/lerp to slider response (not instant)
- Volume-preserving squash and stretch option
- Morph reacts on gate pass-through (flash, pulse, color pop)

### Gates
- Animate gate eggs on pass-through (flash, scale pop, color change)
- Add a ground plane or road surface to give more spatial context
- Gate patterns / rhythm variations
- Vary gate size based on breath quality or mode

### Environment
- Add a ground plane (Road surface)
- Background color / gradient that reacts to slider values
- Ambient particles in the environment

### Camera
- Experiment with FOV changes driven by sliders
- Subtle camera sway or bob

### Polish
- Transition/intro animation on load
- Sound (stretch/squash feedback, gate pass-through chime)
- Progress indicator for Slowing Down phase 1 (show breath count)
- Onboarding / first-time tutorial flow
