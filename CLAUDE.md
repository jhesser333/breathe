# Breathe

## What we're building
A mobile-first React Three Fiber app where two thumb sliders drive real-time animation of a central 3D form (the Morph) as it appears to travel through an environment full of Gates. Users choose from three modes on a home screen, each offering a different breathing experience. A Personalize screen lets users choose Shape Options and Color Palettes.

## Vocabulary

**Morph** — the central animated form, fixed at position [0, 0.25, 0]. Currently a sphere (Shape Option A), rounded box (Shape Option B), dissolving sphere (Shape Option C), or dissolving rounded box (Shape Option D). Driven by both sliders — Y scale from the right slider, X/Z scale + Fresnel from the left slider.

**Inhale State** — left slider at top (lv=1), right slider at bottom (rv=0). Morph is tall and narrow with strong Fresnel inner glow.

**Exhale State** — left slider at bottom (lv=0), right slider at top (rv=1). Morph is wide and flat with dim emissive.

**Environment** — everything surrounding the Morph. Gates scroll past to create the illusion of forward movement.

**Road** — the invisible path along the Z-axis. Negative Z = forward (ahead of Morph); positive Z = behind (toward camera).

**Exhale Gate (Gate A)** — a single torus ring sized to frame the Morph at Exhale state (wide, flat ellipse). Spawns at z=-20.

**Inhale Gate (Gate B)** — a single torus ring sized to frame the Morph at Inhale state (narrow, tall ellipse). Spawns at z=-30 simultaneously with each Gate A, becomes visible at z=-20.

## Slider controls

**Convention: every value driven by a slider eases in and out by default.** Each Morph component reads `leftVal.current`/`rightVal.current` and immediately passes them through `THREE.MathUtils.smoothstep(v, 0, 1)` once at the top of `useFrame`, then uses those eased `lv`/`rv` for every derived lerp/scale/material property — rather than tracking the thumb's raw position 1:1. New slider-driven properties should build on the same eased `lv`/`rv`, not the raw ref values. (Detectors that need the raw, un-eased signal — e.g. `SlowingDownController`'s breath-cycle zigzag detection via `leftRawRef` — are an intentional exception, since they're reading input, not animating output.)

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
- Emissive intensity: piecewise — 2 at inhale (rv=0), dips to 1 at rv=0.85 (15% of the way from exhale to inhale), rises to 3 at exhale (rv=1)
- Roughness: lerp(0.3, 1, rv) — smoother at inhale, rougher at exhale

- Left slider starts at 0 (bottom / Exhale). Right slider starts at 1 (top / Exhale).
- Morph starts in Exhale state: wide flat disc.
- Slider values are refs (not state) to avoid re-renders. Updates happen in `useFrame`.
- Slider fill indicator shows progress from exhale toward inhale on both sliders.
- The left slider also exposes a raw (unclamped) ratio via `leftRawRef`, tracking the thumb's true position even past the slider's visual bounds — used by `SlowingDownController` for breath-cycle timing in "Slowing Down" mode.

## Morph material
- Base color: `palette.morphBase` (Palette A: `#0a0a6e` blue)
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
- **Shape Option C is the exception**: it has no Exhale Gate at all. A single Inhale-style torus spawns at z=-20, self-triggers the next spawn when it passes z=0 (same self-perpetuating mechanism Gate A uses elsewhere), and uses the same emissive ramp/fade-out/color rules above. See `GatesC.jsx`.
- **Shape Option D is the same exception**: no Exhale Gate. A single Inhale-style pair of cubes (left/right, copied from GatesB's inhale gate) spawns at z=-20 and self-triggers the next spawn, same mechanism as Option C. See `GatesD.jsx`.

## Gate geometry (Shape Option A — GatesA.jsx)
- Base torus: radius=1.0, tube=0.06, scaled non-uniformly to match morph shape
- Exhale Gate scale: [1.229, 0.245, 1] — wide flat ellipse
- Inhale Gate scale: [0.734, 1.954, 1] — narrow tall ellipse
- Pool: 3 slots each for Gate A and Gate B

## Gate geometry (Shape Option B — GatesB.jsx)
- **Exhale Gate (A)**: two RoundedBox bars at X=0, args [2.8, 0.25, 0.5] — one above the morph (Y=0.65), one below (Y=-0.15)
- **Inhale Gate (B)**: two RoundedBox pillars at Y=0.25, args [0.4, 4.5, 0.5] — one left (X=-0.9), one right (X=0.9)
- Pool: 3 slots each for Gate A and Gate B

## Gate geometry (Shape Option C — GatesC.jsx)
- No Exhale Gate — only a single recurring Inhale-style torus.
- Base torus: radius=1.0, tube=0.06, sized to clear MorphC's Inhale-state half-extents (X=2.25, Y=3.5 scale → half-extents 1.125 × 1.75 on a radius-0.5 sphere)
- Gate scale: `[1.376, 1.955, 1]` — narrow tall ellipse, same clearance ratios as GatesA's Inhale Gate
- Pool: 3 slots, single type

## Gate geometry (Shape Option D — GatesD.jsx)
- No Exhale Gate — only a single recurring Inhale-style pair of cubes (left/right), copied from GatesB's inhale gate.
- Cubes: RoundedBox args [0.5, 0.5, 0.5], radius 0.1, at X=±0.9, Y=0.25
- MorphD reuses MorphB's scale curve, so its Inhale-state X half-extent (0.6) matches MorphB's exactly — the X=0.9 clearance carries over unchanged from GatesB's inhale gate
- Pool: 3 slots, single type

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
- **Option C**: "Disappearing Morph" — sphere Morph that dissolves into a particle cloud (MorphC) + a single recurring Inhale-style torus Gate, no Exhale Gate (GatesC)
- **Option D**: "Disappearing Cube Morph" — rounded-box Morph that dissolves into a particle cloud (MorphD, same particle/dissolve mechanics as MorphC but box-shaped and using MorphB's scale curve) + a single recurring Inhale-style cube-pair Gate, no Exhale Gate (GatesD)

**Color Palettes:**
- **Palette A** (default): morphBase=#0a0a6e, morphEmissive=#ff69b4, gateColor=#9955dd, background=#1a1028
- **Palette B**: morphBase=#03455e, morphEmissive=#12ffdb, gateColor=#5e4972, background=#002748
- All UI screens (Home, Personalize, Shape Options, Color Options) use `palette.background` so the active palette's background color is consistent everywhere

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
  MorphC.jsx                — Shape C: sphere that dissolves into a particle cloud (metaball-style dissolve shader + two particle systems)
  MorphD.jsx                — Shape D: rounded box that dissolves into a particle cloud (same shaders as MorphC, box-sampled particles, MorphB's scale curve)
  GatesA.jsx                — Shape A: torus exhale/inhale gates with emissive ramp
  GatesB.jsx                — Shape B: cube-style gates with same emissive ramp logic
  GatesC.jsx                — Shape C: single recurring torus gate (no exhale gate), sized for MorphC's Inhale scale
  GatesD.jsx                — Shape D: single recurring cube-pair gate (no exhale gate), copied from GatesB's inhale gate
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
