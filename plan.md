# Breathe — Living State Doc

## What's built

### Home Screen
- Three mode buttons: Basic, Paced Breathing, Slowing Down
- **Personalize** button (top left) → navigates to personalization screens
- Dark desaturated purple background (`#1a1028`)

### Personalization System
- **Personalize → Shape Options**: Option A (sphere) / Option B (rounded box). Option A default.
- **Personalize → Color Options**: Palette A (teal/pink/purple) / Palette B (orange/blue/yellow). Palette A default.
- Selections persisted to localStorage. Back button goes one level up. Shape/Color screens also have a "Home" button (top right).

### Morph
- **Shape A**: sphere (radius 0.5), positioned at [0, 0.25, 0]
- **Shape B**: RoundedBox (args=[1,1,1], radius=0.15)
- Scaled via group: X = lerp(2.2, 1.2, lv), Y = lerp(3.5, 0.4, rv), Z = lerp(0.5, 1.2, lv)
- **Inhale State** (lv=1, rv=0): tall, narrow, bright inner glow
- **Exhale State** (lv=0, rv=1): wide, flat, dim emissive
- Emissive intensity: lerp(1, 0.2, rv) — right slider drives brightness
- **Fresnel inner glow**: custom GLSL via `onBeforeCompile` masks `totalEmissiveRadiance` by inverse Fresnel factor. Intensity: lerp(0.3, 1.0, lv). Power: 4.0. Creates center-bright, edge-dark glow.
- Colors from active palette: morphBase + morphEmissive
- Bloom via `@react-three/postprocessing` (threshold 0.2, intensity 1.5)

### Sliders
- Two DOM overlay sliders, lower half of screen (top: 63%, bottom: 16px fixed)
- Labels: left = inhale (top) / exhale (bottom); right = exhale (top) / inhale (bottom)
- Left starts at 0 (exhale); right starts at 1 (exhale) — Morph launches in Exhale state
- Fill indicator: grows from exhale end toward inhale end as slider moves
- Large thumb (52px), track 62px wide, thumb stays within track bounds
- Multi-touch, mouse fallback
- Left slider also tracks raw (unclamped) thumb position via `leftRawRef`, used by Slowing Down breath timing

### Gates (Shape Option A — GatesA)
- **Exhale Gate (A)**: single torus at center, scaled as wide flat ellipse to frame exhale morph
- **Inhale Gate (B)**: single torus at center, scaled as narrow tall ellipse to frame inhale morph
- Gate A spawns at z=-20; Gate B spawns at z=-30 simultaneously (hidden until z=-20)
- Sequence: first encounter is Gate A, then alternates A→B→A→B
- Gate Y position: 0.25 (matches Morph)
- **Emissive ramp** (smoothstepped): 0 at z=-3, 1 at z=-0.5, 2 (max) at z=0, holds at max
- **Alpha fade-out** (smoothstepped): fades 1→0 from z=0 to z=2, then despawn
- Emissive color = palette.morphEmissive; gate color = palette.gateColor

### Gates (Shape Option B — GatesB)
- Same spawning/timing logic as GatesA
- Different mesh: Gate A = two RoundedBox bars at X=0 (one above morph at Y=0.65, one below at Y=-0.15); Gate B = two RoundedBox pillars at Y=0.25 (one left at X=-0.9, one right at X=0.9)
- Same emissive ramp and alpha fade rules

### Modes

**Basic** — Morph only, no Gates.

**Paced Breathing** — Gates at fixed 12-second interval.

**Slowing Down** — Two phases:
- Phase 1: No gates. Records breath cycles from the left thumb's raw (unclamped) position — a zigzag/deadband detector (8% of slider height) finds min→max→min reversals, each one a full breath cycle (min 1.5s). Needs 5 cycles; spawn interval = avg of the last 2 cycles.
- Phase 2: Gates at that avg breath interval, ramping to 2× over 60s. Inhale gates (B) land halfway between exhale gates (A) automatically, since B spawns at z=-30 vs A's z=-20 at the same speed.

### Tutorial Text
- Universal A/B/C sequence, same across all modes:
  - **Text A** ("Move the sliders in opposite directions.") — shown at level start, stays until 2s after sliders start moving, then fades out. Stays up indefinitely if sliders never move.
  - **Text B** ("Move the sliders with your breath.") — fades in after Text A, visible 3s, fades out.
  - **Text C** ("Time your breath with the gates.") — fades in when gates are about to spawn (immediately for Paced Breathing, at Phase 2 for Slowing Down); waits for A/B to finish if still showing. Visible 5s, fades out.
  - Idle re-show: after 10s of no movement, the most recent text reappears until 2s after movement resumes.
- Strings in `src/copy.js` — edit that file to change wording

### Scene
- Camera at [0, 3.5, 5], ~35° down, fov 50
- Background from palette (Palette A: `#1a1028` dark purple)
- Ambient 0.4 + directional [5,5,5] intensity 1

**Axis orientation**
- **X** — width (left/right)
- **Y** — height (up/down)
- **Z** — depth along the road (negative Z = ahead; positive Z = toward camera)
- Morph at [0, 0.25, 0]; Gate A spawns at z=−20; Gate B spawns at z=−30

---

## Known open issue
- Screen goes black at full Exhale on phone — addressed by changing exhale scale from [2.2, 0.25, 0.5] to [2.2, 0.4, 0.5] and raising the morph base color visibility (Palette A morphBase now `#2266cc` blue). Pending phone verification.

---

## Ideas / next iterations

### Morph
- Verify black-screen-at-exhale fix on phone
- Investigate Fresnel `onBeforeCompile` reliability on all mobile devices
- Add smooth easing/lerp to slider response
- Morph reacts on gate pass-through (flash, pulse)
- Particle-based Morph option

### Gates
- Animate gates on pass-through
- Vary gate size per mode or breath quality
- Gate patterns / rhythm variations
- More Shape Options (Option C, D, etc.)

### Personalization
- More Color Palettes
- More Shape Options
- Preview swatches on palette buttons

### Environment
- Ground plane / road surface
- Background gradient reacting to slider values
- Ambient particles

### Camera
- FOV changes driven by sliders
- Subtle camera sway

### Polish
- Transition/intro animation on load
- Sound (gate chime, breath feedback)
- Progress indicator for Slowing Down phase 1
- Onboarding / first-time tutorial flow
