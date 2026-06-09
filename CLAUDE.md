# Breathe

## What we're building
A mobile-first React Three Fiber app where two thumb sliders drive real-time animation of a central 3D form (the Morph) as it appears to travel through an environment full of Gates. Users choose from three modes on a home screen, each offering a different breathing experience. A Personalize screen lets users choose Shape Options and Color Palettes.

## Vocabulary

**Morph** — the central animated form, fixed at position [0, 0.25, 0]. Currently a sphere (Shape Option A) or rounded box (Shape Option B). Driven by both sliders — Y scale from the right slider, X/Z scale + Fresnel from the left slider.

**Inhale State** — left slider at top (lv=1), right slider at bottom (rv=0). Morph is tall and narrow with strong Fresnel inner glow.

**Exhale State** — left slider at bottom (lv=0), right slider at top (rv=1). Morph is wide and flat with dim emissive.

**Environment** — everything surrounding the Morph. Gates scroll past to create the illusion of forward movement.

**Road** — the invisible path along the Z-axis. Negative Z = forward (ahead of Morph); positive Z = behind (toward camera).

**Exhale Gate (Gate A)** — a single torus ring sized to frame the Morph at Exhale state (wide, flat ellipse). Spawns at z=-20.

**Inhale Gate (Gate B)** — a single torus ring sized to frame the Morph at Inhale state (narrow, tall ellipse). Spawns at z=-30 simultaneously with each Gate A, becomes visible at z=-20.

## Slider controls

| Slider | Label (top/bottom) | Controls |
|--------|-------------------|----------|
| Left (0=bottom=exhale, 1=top=inhale) | inhale / exhale | X/Z scale + Fresnel inner glow intensity |
| Right (0=bottom=inhale, 1=top=exhale) | exhale / inhale | Y scale + emissive intensity |

**Left slider (lv):**
- X scale: lerp(2.2, 1.2, lv) — wide at exhale, narrow at inhale
- Z scale: lerp(0.5, 1.2, lv)
- Fresnel intensity: lerp(0.3, 1.0, lv)

**Right slider (rv):**
- Y scale: lerp(3.5, 0.25, rv) — tall at inhale, flat at exhale
- Emissive intensity: lerp(1, 0.2, rv) — brightest at inhale

- Left slider starts at 0 (bottom / Exhale). Right slider starts at 1 (top / Exhale).
- Morph starts in Exhale state: wide flat disc.
- Slider values are refs (not state) to avoid re-renders. Updates happen in `useFrame`.
- Slider fill indicator shows progress from exhale toward inhale on both sliders.

## Morph material
- Base color: `palette.morphBase` (Palette A: `#2299aa` teal)
- Emissive color: `palette.morphEmissive` (Palette A: `#ff69b4` pink)
- Fresnel inner glow via `onBeforeCompile` shader injection — masks `totalEmissiveRadiance` using inverse Fresnel factor, creating a center glow that fades toward edges
- Bloom post-processing (luminanceThreshold 0.2, intensity 1.5)

## Gate behavior
- **Exhale Gate (A)** spawns at z=-20 and fades in over 1s. When it passes z=0 (Morph), it triggers the next Gate A + Gate B simultaneously.
- **Inhale Gate (B)** spawns at z=-30 at the same moment as each Gate A. Hidden until z=-20, then fades in.
- Encounter order: Gate A first (at morph after full interval), Gate B second (half-interval later). Sequence: A, B, A, B…
- **Gate emissive ramp** (smoothstepped): 0 at z=-3 → 1 at z=-0.5 → 2 at z=0, holds at 2 after passing. Emissive color = `palette.morphEmissive`.
- **Gate alpha fade-out**: starts at z=0, complete at z=2. Smoothstepped.
- Gate color: `palette.gateColor` (Palette A: `#9955dd` purple)
- Gate position Y: 0.25 (matches Morph)

## Gate geometry (Shape Option A — GatesA.jsx)
- Base torus: radius=1.0, tube=0.06, scaled non-uniformly to match morph shape
- Exhale Gate scale: [1.229, 0.153, 1] — wide flat ellipse
- Inhale Gate scale: [0.734, 1.954, 1] — narrow tall ellipse
- Pool: 3 slots each for Gate A and Gate B

## Modes

### Basic
- Morph + environment, no Gates.
- Tutorial text: *"Move the sliders up and down along with your breath"*

### Paced Breathing
- Full experience with Gates at a fixed 12-second interval.
- Tutorial text: *"Move the sliders up and down with your breath. Time your breathing so the object fits through the gates"*

### Slowing Down
- **Phase 1 (learning)**: No Gates. Tracks breath cycles via left slider (bottom→peak→bottom = one cycle). After 3 cycles, Phase 2 begins.
- **Phase 2 (gates)**: Gates spawn at avg breath length interval, ramping to 2× over 60 seconds.
- Tutorial text phase 1: *"Move the sliders up and down along with your breath"*
- Tutorial text phase 2: *"Now begin to time your breath so the object fits through the gates"* (force-shown 5s)

## Tutorial text rules
- Visible for 5 seconds, then fades out.
- Hides immediately when sliders move (unless force-shown).
- Reappears after 10 consecutive seconds of no slider movement.
- Force-show: used for Phase 2 start in Slowing Down.

## Personalization system
- **Personalize** button on Home screen (top left)
- Navigation: Home → Personalize → Shape Options or Color Options
- Back navigation goes one level up; Shape/Color screens also have a "Home" button (top right) to jump to root
- Selections persisted to localStorage

**Shape Options:**
- **Option A** (default): sphere Morph + torus Gates (GatesA)
- **Option B**: rounded-box Morph + cube-style Gates (GatesB)

**Color Palettes:**
- **Palette A** (default): morphBase=#2299aa, morphEmissive=#ff69b4, gateColor=#9955dd, background=#1a1028
- **Palette B**: morphBase=#ff8800, morphEmissive=#4499ff, gateColor=#ffd700, background=#0d1f1a

## Current scene setup
- **Camera**: position `[0, 3.5, 5]`, fov 50 — ~35° downward angle
- **Background**: from active palette (Palette A: `#1a1028` dark desaturated purple)
- **Lights**: ambientLight 0.4 + directionalLight at `[5, 5, 5]` intensity 1
- **Morph**: sphere radius 0.5, position [0, 0.25, 0], scaled via group
- **Bloom**: `@react-three/postprocessing` v2, luminanceThreshold=0.2, luminanceSmoothing=0.9, intensity=1.5

## Axis orientation
- **X** — width (left/right)
- **Y** — height (up/down)
- **Z** — depth along road (negative Z = ahead; positive Z = toward camera)
- Morph at [0, 0.25, 0]; gates spawn at z=-20 (A) or z=-30 (B), travel toward z=0

## File structure
```
src/
  App.jsx                   — screen routing, palette/shape state, tutorial logic, localStorage
  MorphA.jsx                — Shape A: sphere, Fresnel inner glow via onBeforeCompile
  MorphB.jsx                — Shape B: RoundedBox, same Fresnel approach
  GatesA.jsx                — Shape A: torus exhale/inhale gates with emissive ramp
  GatesB.jsx                — Shape B: cube-style gates with same emissive ramp logic
  Sliders.jsx               — DOM overlay sliders (top 63% to 16px from bottom), fill indicator
  useTouchSlider.js         — touch hook with identifier tracking (multi-touch)
  HomeScreen.jsx            — mode selection + Personalize button (top left)
  PersonalizeScreen.jsx     — hub: Shape Options + Color Options
  ShapeOptionsScreen.jsx    — A/B shape selection, selected state indicated
  ColorOptionsScreen.jsx    — Palette A/B selection, selected state indicated
  TutorialText.jsx          — fade-in/out tutorial overlay (top of screen)
  SlowingDownController.jsx — breath cycle detection + dynamic gate interval
  palettes.js               — PALETTES object: morphBase, morphEmissive, gateColor, background
  copy.js                   — tutorial text strings (TEXTS object, edit here to change wording)
  Track.jsx                 — wave track lines (not currently rendered, kept for reference)
  Morph.jsx                 — legacy, superseded by MorphA/MorphB
  Gates.jsx                 — legacy, superseded by GatesA/GatesB
  main.jsx                  — entry point
```

## Tech stack
- React Three Fiber + Three.js
- @react-three/drei (RoundedBox, etc.)
- @react-three/postprocessing v2 (Bloom)
- Custom GLSL via `onBeforeCompile` (Fresnel inner glow on Morph)
- Touch/slider input → live parameter control via refs

## Workflow
1. Describe what you want
2. Claude builds it in React Three Fiber
3. Iterate via phone testing / descriptions
4. `git add -A && git commit -m "..." && git push` → Vercel auto-deploys → https://breathe-omega-ivory.vercel.app/
