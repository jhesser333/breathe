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
- Fresnel intensity: constant 1.0
- Fresnel power: lerp(0.2, 1.5, lv) — exhale has a much narrower, more concentrated glow (almost fully dark except a small center spot); inhale uses the wider/brighter glow that was previously the exhale mask

**Right slider (rv):**
- Y scale: lerp(3.5, 0.4, rv) — tall at inhale, flat at exhale
- Emissive intensity: lerp(1.5, 2, rv) — brightest at exhale
- Roughness: lerp(0.3, 1, rv) — smoother at inhale, rougher at exhale

- Left slider starts at 0 (bottom / Exhale). Right slider starts at 1 (top / Exhale).
- Morph starts in Exhale state: wide flat disc.
- Slider values are refs (not state) to avoid re-renders. Updates happen in `useFrame`.
- Slider fill indicator shows progress from exhale toward inhale on both sliders.
- The left slider also exposes a raw (unclamped) ratio via `leftRawRef`, tracking the thumb's true position even past the slider's visual bounds — used by `SlowingDownController` for breath-cycle timing in "Slowing Down" mode.

## Morph material
- Base color: `palette.morphBase` (Palette A: `#1717a6` blue)
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
- Exhale Gate scale: [1.229, 0.245, 1] — wide flat ellipse
- Inhale Gate scale: [0.734, 1.954, 1] — narrow tall ellipse
- Pool: 3 slots each for Gate A and Gate B

## Gate geometry (Shape Option B — GatesB.jsx)
- **Exhale Gate (A)**: two RoundedBox bars at X=0, args [2.8, 0.25, 0.5] — one above the morph (Y=0.65), one below (Y=-0.15)
- **Inhale Gate (B)**: two RoundedBox pillars at Y=0.25, args [0.4, 4.5, 0.5] — one left (X=-0.9), one right (X=0.9)
- Pool: 3 slots each for Gate A and Gate B

## Modes

### Basic
- Morph + environment, no Gates.

### Paced Breathing
- Full experience with Gates at a fixed 12-second interval.

### Slowing Down
- **Phase 1 (learning)**: No Gates. Tracks breath cycles using the left thumb's raw (unclamped) screen position, not the slider's clamped 0-1 value — so swinging the thumb past the slider's visual top/bottom edges still counts correctly. A zigzag/deadband reversal detector (`DEADBAND = 0.08`, i.e. 8% of slider height) finds local min/max reversals; a full breath cycle = min→max→min (inhale + exhale), and must last at least `MIN_BREATH_SECONDS = 1.5`. After 5 cycles are recorded (`MIN_BREATHS = 5`), Phase 2 begins using the average of the **last 2** recorded cycles as the spawn interval.
- **Phase 2 (gates)**: Gates spawn at that avg breath interval, ramping to 2× over 60 seconds. Exhale gates (A) are one full breath cycle apart; inhale gates (B) spawn halfway between exhale gates (an inherent result of Gate A spawning at z=-20 and Gate B at z=-30 with the same speed).

## Tutorial text rules
Universal A/B/C sequence, the same across every mode (defined in `src/copy.js`):

- **Text A** — "Move the sliders in opposite directions." Shown at mode start. Stays visible until the sliders start moving, then waits 2 seconds before fading out. If the user never moves the sliders, Text A stays up indefinitely (no movement → no timer starts).
- **Text B** — "Move the sliders with your breath." Fades in once Text A fades out. Stays visible for 3 seconds, then fades out.
- **Text C** — "Time your breath with the gates." Fades in whenever gates are about to start spawning (immediately at mode start for Paced Breathing; at the start of Phase 2 for Slowing Down). If Text A/B is still showing when gates are about to spawn, Text C waits until the A/B sequence finishes, then fades in. Stays visible for 5 seconds, then fades out.
- **Idle re-show**: if the sliders are still for 10 seconds, the most recently shown text (A, B, or C — whichever was last) reappears and stays until 2 seconds after the sliders start moving again, then fades out (does not restart the A/B/C sequence).
- Fade transitions take 1.5 seconds (`FADE_TRANSITION_MS` in `App.jsx`, must match the CSS transition in `TutorialText.jsx`).

## Personalization system
- **Personalize** button on Home screen (top left)
- Navigation: Home → Personalize → Shape Options or Color Options
- Back navigation goes one level up; Shape/Color screens also have a "Home" button (top right) to jump to root
- Selections persisted to localStorage

**Shape Options:**
- **Option A** (default): sphere Morph + torus Gates (GatesA)
- **Option B**: rounded-box Morph + cube-style Gates (GatesB)

**Color Palettes:**
- **Palette A** (default): morphBase=#1717a6, morphEmissive=#ff69b4, gateColor=#9955dd, background=#1a1028
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
  copy.js                   — tutorial text strings (TEXT_A, TEXT_B, TEXTS.gates — edit here to change wording)
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
