# Breathe

## What we're building
A mobile-first React Three Fiber app where two thumb sliders drive real-time animation of a central 3D form (the Morph) as it appears to travel through an environment full of Gates. Users choose from three modes on a home screen, each offering a different breathing experience. A Personalize screen lets users choose Shape Options and Color Palettes.

## Vocabulary

**Morph** — the central animated form, fixed at position [0, 0.25, 0]. Currently a sphere (Shape Option A), rounded box (Shape Option B), dissolving sphere (Shape Option C), dissolving rounded box (Shape Option D), or a duplicate of Option C (Shape Option E). Driven by both sliders — Y scale from the right slider, X/Z scale + Fresnel from the left slider.

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
- **Shape Option E is an exact duplicate of Option C** (`MorphE.jsx` / `GatesE.jsx`, copied verbatim from `MorphC.jsx` / `GatesC.jsx` with only the component names and `customProgramCacheKey` renamed). Same no-Exhale-Gate exception applies.

## Road mesh (ties) — all Shape Options (A–E)
Every shape option scrolls thin railroad-tie markers along the track: `RoundedBox`, line-thin (`TIE_HEIGHT_Y`/`TIE_DEPTH_Z`/`TIE_RADIUS` all small so each tie reads as a line, not a block), at `GATE_Y`. Material: `color` = `gateColor`, no emissive, opacity = `TIE_ALPHA` (0.15) × fade-*in* only (not fade-out, so ties don't dim when a gate fades out passing the Morph) — flat, no per-position gradient.

**Pre-seeding (ties before gates enable):** Each `Gates*.jsx` pre-seeds synthetic checkpoints while `gatesEnabledRef.current` is false, so ties appear from the very first frame of Paced Breathing and Slowing Down — before any real gate ever spawns. A `preSeedRef = { elapsed, needsInitial }` tracks timing: on the first frame it pushes one checkpoint (or two for dual-gate-type options), then pushes another each time `elapsed` accumulates a full `spawnIntervalRef.current`. When gates actually enable (rising edge), pre-seed checkpoints are cleared in the same frame that `spawnA()`/`spawn()` pushes the first real checkpoint — no flicker or speed change at the transition.

Each `Gates*.jsx` keeps an independent "checkpoint" list (one entry per gate spawn — both types, for the two-gate-type options — sorted by z regardless of type, decoupled from the gate-mesh pool's own recycling) and renders three tie groups from it:
  - **Real-to-real** (`lerpRefs`/`lerpMaterials`, up to `LERP_SEGMENTS_MAX` segments × `TIES_PER_SEGMENT` (6) ties): between two consecutive real checkpoints — 1 tie at the leading gate + 5 more evenly filling the gap (frac = i/6). Both ends are real and move at their own checkpoint speed, so as gate spacing changes (e.g. Slowing Down's ramp) the tie *count* stays fixed at 6 while spacing stretches/shrinks, with no anchor-swap discontinuity.
  - **Preview** (`previewRefs`/`previewMaterials`, `TIES_PER_SEGMENT` ties): owned by the frontmost (no real gate yet ahead of it) checkpoint. Fixed offsets *ahead* of it (`frontmost.z - i * TIE_SPACING`, i=0..5), so every tie scrolls at exactly that checkpoint's own speed — no stretching toward a fixed point, hence no speed-up/jerk when the next real gate eventually spawns there and this same stretch hands off to a real-to-real segment (positions and velocities already match at that instant).
  - **Trailing filler** (`trailingRefs`/`trailingMaterials`, `TIES_PER_SEGMENT` ties): owned by the backmost (no real gate yet behind it) checkpoint. Fixed offsets *behind* it (`backmost.z + i * TIE_SPACING`); ties past `DESPAWN_Z` are hidden (so typically only 1-2 are ever visible). Skips its own i=0 (at-gate) tie when the backmost checkpoint is also the frontmost (only one real gate alive), since Preview already drew it.

  `TIE_SPACING` = the option's standard real-gate-to-real-gate distance ÷ `TIES_PER_SEGMENT`: **20/6** for the single-gate-type options (C, D, E — one spawn point at `SPAWN_Z`), **10/6** for the dual-gate-type options (A, B — Exhale+Inhale spawn together 10 units apart, at `SPAWN_Z`/`GATE_B_Z`, and alternate at that steady spacing thereafter). `TIE_WIDTH_X` is sized per option below to clear the narrowest gate opening ties must pass through, inset by `TIE_GAP` so they just touch (not overlap) that edge.

## Gate geometry (Shape Option A — GatesA.jsx)
- Base torus: radius=1.0, tube=0.06, scaled non-uniformly to match morph shape
- Exhale Gate scale: [1.229, 0.245, 1] — wide flat ellipse
- Inhale Gate scale: [0.734, 1.954, 1] — narrow tall ellipse
- Pool: 3 slots each for Gate A and Gate B
- Ties: width sized to the narrower Inhale gate's interior inner-hole half-width (`BASE_INNER * INHALE_SCALE[0]` ≈ 0.69), since the wider Exhale opening isn't the binding constraint

## Gate geometry (Shape Option B — GatesB.jsx)
- **Exhale Gate (A)**: two RoundedBox bars at X=0, args [2.8, 0.25, 0.5] — one above the morph (Y=0.65), one below (Y=-0.15)
- **Inhale Gate (B)**: two RoundedBox pillars at Y=0.25, args [0.4, 4.5, 0.5] — one left (X=-0.9), one right (X=0.9)
- Pool: 3 slots each for Gate A and Gate B
- Ties: width sized to the Inhale pillars' inner-facing edges (`GATE_B_X - CUBE_ARGS[0]/2` = 0.65) — the Exhale bars span the full X width so they don't constrain it

## Gate geometry (Shape Option C — GatesC.jsx)
- No Exhale Gate — only a single recurring Inhale-style torus.
- Base torus: radius=1.0, tube=0.06, sized to clear MorphC's Inhale-state half-extents (X=2.25, Y=3.5 scale → half-extents 1.125 × 1.75 on a radius-0.5 sphere)
- Gate scale: `[1.376, 1.955, 1]` — narrow tall ellipse, same clearance ratios as GatesA's Inhale Gate
- Pool: 3 slots, single type
- Ties: width sized to the gate's interior inner-hole half-width (`BASE_INNER * GATE_SCALE[0]`)

## Gate geometry (Shape Option D — GatesD.jsx)
- No Exhale Gate — only a single recurring Inhale-style pair of cubes (left/right), copied from GatesB's inhale gate.
- Cubes: RoundedBox args [0.5, 0.5, 0.5], radius 0.1, at X=±0.9, Y=0.25
- MorphD reuses MorphB's scale curve, so its Inhale-state X half-extent (0.6) matches MorphB's exactly — the X=0.9 clearance carries over unchanged from GatesB's inhale gate
- Pool: 3 slots, single type
- Ties: width sized to the cubes' inner-facing edges (`GATE_X - CUBE_ARGS[0]/2` = 0.65)

## Gate geometry (Shape Option E — GatesE.jsx)
- Identical to Shape Option C's gate geometry — exact duplicate, no Exhale Gate, same torus sized for MorphE's (= MorphC's) Inhale scale.
- Pool: 3 slots, single type
- Ties: identical to Option C's (same torus geometry, same `TIE_WIDTH_X`/`TIE_SPACING`)

## Modes

### Basic
- Morph + environment, no Gates.

### Paced Breathing
- Full experience with Gates at a fixed 12-second interval.
- **BreathLengthControl**: a small slider + value + label at top-left (`BreathLengthControl.jsx`) that lets the user adjust the breath interval. Hidden (opacity 0) until 2 seconds after Text C fades in, then fades in over 2 seconds. Resets to 12s and hides again when the user returns to this mode. (Also used in Slowing Down post-ramp — see that section.)
- **Gate spawn timing**: gates start disabled (`gatesEnabledRef.current = false`). They enable only when `showGatesText` fires (i.e., when Text C appears — after Text A and B complete, or immediately if the user skips past them). This means the road shows ties but no gate rings until Text C.

### Slowing Down
- **Text C** fires automatically after Text B (queued via `pendingGatesFnRef` thunk in `App.jsx`). Copy: "Breathe at your own pace for 5 breaths". No auto-dismiss timer — stays visible until Initial Pace is set.
- **Recording phases** (managed by `SlowingDownController.jsx`):
  - `idle` — returns early until `recordingEnabledRef.current` is true (set by `showSlowingTextC` in App.jsx when Text C appears)
  - `warmup` — counts 3 full breath cycles (min→max→min, each ≥ `MIN_BREATH_SECONDS = 1.5`); not recorded
  - `recording` — records next 2 cycles, averages them → **Initial Pace** (`avgBreathRef`); calls `onGatesReady()` callback
  - `gates` — ramps spawn interval from Initial Pace → 2× over 60 seconds (`RAMP_SECONDS`); counts post-gate cycles for Text D/E and post-ramp cycles for Text F/G/slider
- **Gate phase-locking**: when recording ends, gates are NOT enabled immediately. A delay `d` is computed so the first gate arrives at the Morph on the user's next inhale peak:
  - `lastMaxTimeRef` (ref passed from App.jsx) stores the exact timestamp of the last confirmed inhale peak
  - Single-gate shapes (C/D/E, spawn z=−20, travel time = 1 interval): `d = P − elapsed_since_max`
  - Dual-gate shapes (A/B, Gate B spawn z=−30, travel time = 1.5 intervals): `d ≈ 0` (Gate B naturally aligns)
  - `gateEnableTimerRef` fires after `d` seconds to set `gatesEnabledRef.current = true`
  - `phase2StartRef` is set to gate-enable time so the 60s ramp clock starts from the first visible gate
- **Text D** fades in 2 seconds after Text C fades. Copy: "Good Job! The oncoming targets will begin at your pace and slow down over the next minute." No auto-dismiss — stays until user completes `TEXT_D_CYCLES = 3` post-gate breath cycles, then fades. `SlowingDownController` calls `onTextDone()` callback.
- **Text E** fades in 2 seconds after Text D fades. Copy: "Keep Morph aligned with the targets to slow down your breathing." No auto-dismiss — stays until user completes `TEXT_E_CYCLES = 4` more post-gate breath cycles, then fades. `SlowingDownController` calls `onTextEDone()` callback.
- **Ramp**: spawn interval increases linearly from Initial Pace → 2× Initial Pace over 60 seconds. At t=1, `rampDoneFiredRef` is set and the controller stops writing to `spawnIntervalRef` — BreathLengthControl takes over.
- **Text F** fades in 2 seconds after the ramp completes (interrupts any text still visible). Copy: "Good job! Your breaths are now twice as long." No auto-dismiss — stays until `TEXT_F_CYCLES = 2` post-ramp breath cycles, then fades. `SlowingDownController` calls `onTextFDone()` callback.
- **Text G** fades in 2 seconds after Text F fades. Copy: "You can use the slider on the left to slow down further or speed back up." No auto-dismiss — stays until `TEXT_G_CYCLES = 2` cycles after Text F (4 total post-ramp), then fades. `SlowingDownController` calls `onTextGDone()` callback.
- **BreathLengthControl (Slowing Down)**: fades in at `TEXT_F_CYCLES + TEXT_G_SLIDER_CYCLE = 3` post-ramp cycles (approximately 1 cycle after Text G appears). Initialized to `round(avgBreathRef * 2, 0.5)` — the doubled pace rounded to nearest 0.5s. Works identically to Paced Breathing — `onChange → setBreathLength → spawnIntervalRef` via useEffect. Resets hidden when mode restarts.
- Constants in `SlowingDownController.jsx`: `DEADBAND=0.08`, `MIN_BREATH_SECONDS=1.5`, `SLACK_FACTOR=1.15`, `WARMUP_CYCLES=3`, `RECORD_CYCLES=2`, `TEXT_D_CYCLES=3`, `TEXT_E_CYCLES=4`, `TEXT_F_CYCLES=2`, `TEXT_G_CYCLES=2`, `TEXT_G_SLIDER_CYCLE=1`, `RAMP_SECONDS=60`

## Tutorial text rules
Universal A/B sequence, then mode-specific C/D (defined in `src/copy.js`):

- **Text A** — "Move the sliders in opposite directions with your thumbs" Shown at mode start. Stays visible until the **right slider** has completed **2 full up+down oscillations** (4 direction reversals detected with an 8% deadband, tracked in `rightStrokeCountRef`), then fades out over 2 seconds. If the user never moves the right slider, Text A stays up indefinitely.
- **Text B** — "Sync your breathing to the morphing object" Fades in once Text A fades out. Stays visible until the right slider completes **3 more full oscillations** (6 reversals, same deadband logic, counters reset when B begins), then fades out over 2 seconds.
- **Text C (Paced Breathing)** — "Use the oncoming targets to pace your breath. Adjust the pace with the slider on the left." Queued via `pendingGatesFnRef` thunk when Paced Breathing mode starts. Fires after Text B finishes (or immediately if A/B already done). Enables gates and starts the 5-second display timer; fades out after 5 seconds. `BreathLengthControl` fades in 2 seconds after Text C appears.
- **Text C (Slowing Down)** — "Breathe at your own pace for 5 breaths" Queued via `pendingGatesFnRef` thunk when Slowing Down mode starts. Fires after Text B finishes. Sets `recordingEnabledRef.current = true` to start the warmup/recording flow in `SlowingDownController`. No auto-dismiss timer — stays until `SlowingDownController` calls `onGatesReady()` (recording complete), which triggers Text C fade-out.
- **Text D (Slowing Down only)** — "Good Job! The oncoming targets will begin at your pace and slow down over the next minute." Shown 2 seconds after Text C fades out (after FADE_TRANSITION_MS gap). No auto-dismiss timer — stays until `SlowingDownController` calls `onTextDone()` after 3 post-gate breath cycles, then fades.
- **Text E (Slowing Down only)** — "Keep Morph aligned with the targets to slow down your breathing." Shown 2 seconds after Text D fades. No auto-dismiss timer — stays until `SlowingDownController` calls `onTextEDone()` after 4 more post-gate breath cycles, then fades.
- **Text F (Slowing Down only)** — "Good job! Your breaths are now twice as long." Shown 2 seconds after the 60s ramp completes (interrupts Text D/E if still visible). No auto-dismiss timer — stays until `SlowingDownController` calls `onTextFDone()` after 2 post-ramp breath cycles, then fades.
- **Text G (Slowing Down only)** — "You can use the slider on the left to slow down further or speed back up." Shown 2 seconds after Text F fades. No auto-dismiss timer — stays until `SlowingDownController` calls `onTextGDone()` after 2 more post-ramp cycles, then fades. The BreathLengthControl slider fades in at 3 total post-ramp cycles (1 cycle after Text G appears).
- **Idle re-show**: if the sliders are still for 10 seconds, the most recently shown text (A, B, C, D, E, F, or G — whichever was last) reappears and stays until 2 seconds after the sliders start moving again, then fades out (does not restart the sequence).
- Fade transitions take 2 seconds (`FADE_TRANSITION_MS = 2000` in `App.jsx`, must match the CSS transition in `TutorialText.jsx`).
- `TutorialText.jsx` is positioned at `top: '38%'` with `transform: 'translateY(-50%)'` — centered in front of the Morph.

## Personalization system
- **Personalize** button on Home screen (bottom center)
- Navigation: Home → Personalize → Shapes or Colors
- All nav buttons are consolidated into stacked bottom-center groups — no top-corner buttons on any screen. Gap between buttons: 20px. Positioned at `bottom: 16, left: '50%', transform: 'translateX(-50%)'`.
  - **Experience/breathing screen** (App.jsx overlay): **Personalize** / **Select Mode** / **Restart**
  - **Personalize screen**: **Select Mode** / **Resume Breathing**
  - **Shape Options / Color Options screens**: **Personalize** / **Select Mode** / **Resume Breathing**
- Shape/Color Options screens use a scrollable cards container (`height: 380, overflowY: 'auto'`) — shows ~4 cards at a time; scroll to reveal more. Layout is `justifyContent: 'flex-start'` with `paddingTop: 60, paddingBottom: 150` so cards don't slide under the bottom button group.
- Selections persisted to localStorage

**Shape Options:**
- **Option A** (default): sphere Morph + torus Gates (GatesA)
- **Option B**: rounded-box Morph + cube-style Gates (GatesB)
- **Option C**: "Disappearing Morph" — sphere Morph that dissolves into a particle cloud (MorphC) + a single recurring Inhale-style torus Gate, no Exhale Gate (GatesC)
- **Option D**: "Disappearing Cube Morph" — rounded-box Morph that dissolves into a particle cloud (MorphD, same particle/dissolve mechanics as MorphC but box-shaped and using MorphB's scale curve) + a single recurring Inhale-style cube-pair Gate, no Exhale Gate (GatesD)
- **Option E**: exact duplicate of Option C — same "Disappearing Morph" sphere + particle cloud (MorphE) and single recurring torus Gate (GatesE)

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
  App.jsx                   — screen routing, palette/shape state, tutorial logic, localStorage; tutorial architecture uses pendingGatesFnRef (function thunk) for mode-specific Text C; key refs: recordingEnabledRef, lastMaxTimeRef, gateEnableTimerRef, shapeRef; showTimedText / showSlowingTextC–G / handleSlowingRecordingDone / handleSlowingTextDDone–GDone / handleSlowingRampDone / handleSlowingShowSlider
  MorphA.jsx                — Shape A: sphere, Fresnel inner glow via onBeforeCompile
  MorphB.jsx                — Shape B: RoundedBox, same Fresnel approach
  MorphC.jsx                — Shape C: sphere that dissolves into a particle cloud (metaball-style dissolve shader + two particle systems)
  MorphD.jsx                — Shape D: rounded box that dissolves into a particle cloud (same shaders as MorphC, box-sampled particles, MorphB's scale curve)
  MorphE.jsx                — Shape E: exact duplicate of MorphC
  GatesA.jsx                — Shape A: torus exhale/inhale gates with emissive ramp
  GatesB.jsx                — Shape B: cube-style gates with same emissive ramp logic
  GatesC.jsx                — Shape C: single recurring torus gate (no exhale gate), sized for MorphC's Inhale scale
  GatesD.jsx                — Shape D: single recurring cube-pair gate (no exhale gate), copied from GatesB's inhale gate
  GatesE.jsx                — Shape E: exact duplicate of GatesC
  Sliders.jsx               — DOM overlay sliders (top 63% to 16px from bottom), fill indicator
  useTouchSlider.js         — touch hook with identifier tracking (multi-touch)
  HomeScreen.jsx            — mode selection ("Modes" heading) + Personalize button (bottom center)
  PersonalizeScreen.jsx     — hub: Shapes + Colors
  ShapeOptionsScreen.jsx    — shape selection (A–E), scrollable card list (height 380, overflowY auto), stacked nav buttons at bottom
  ColorOptionsScreen.jsx    — palette selection (A–B), scrollable card list (height 380, overflowY auto), stacked nav buttons at bottom
  TutorialText.jsx          — fade-in/out tutorial overlay (top of screen)
  BreathLengthControl.jsx   — top-left slider + value + label for adjusting breath interval in Paced Breathing; fades in 2s after Text C
  SlowingDownController.jsx — breath cycle detection + dynamic gate interval; phases: idle→warmup(3)→recording(2)→gates; captures lastMaxTimeRef (inhale peak time) for gate phase-locking; calls onGatesReady when Initial Pace is set, onTextDone/EFDone/GDone after respective post-gate/post-ramp cycle counts, onRampDone when 60s ramp t=1, onShowSlider 1 cycle into Text G period
  palettes.js               — PALETTES object: morphBase, morphEmissive, gateColor, background
  copy.js                   — tutorial text strings (TEXT_A, TEXT_B, TEXTS.gatesTimed / TEXTS.gatesSlowing / TEXTS.slowingTextD–G — edit here to change wording)
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
