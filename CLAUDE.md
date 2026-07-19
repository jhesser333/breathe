# Breathe

## What we're building
A mobile-first React Three Fiber app where two thumb sliders drive real-time animation of a central 3D form (the Morph) as it appears to travel through an environment full of Gates. Users choose from three modes on a home screen, each offering a different breathing experience. A Personalize screen lets users choose Shape Options, Color Palettes, and Background options.

## Vocabulary

**Morph** — the central animated form, fixed at position [0, 0.25, 0]. Currently a sphere (Shape Option A), rounded box (Shape Option B), or dissolving sphere (Shape Options C and D — D reuses MorphC exactly but pairs it with no visible Gates/ties, see below). Driven by both sliders — Y scale from the right slider, X/Z scale + Fresnel from the left slider.

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
- **Slider Layout**: a persisted preference (`sliderLayout`, localStorage key `sliderLayout`, values `'vertical'`/`'horizontal'`/`'diagonal'`, default `'vertical'`), chosen on the **Slider Layouts** screen (see Personalization system below). `'vertical'` renders `Sliders.jsx` (unchanged, described above); `'horizontal'` renders `SlidersHorizontal.jsx` — two tracks side by side splitting the screen width, meeting at the horizontal midpoint, positioned lower on screen (`top: '70%'`) instead of hugging the left/right edges; `'diagonal'` renders `SlidersDiagonal.jsx` — two angled capsule tracks converging toward bottom-center ("\" on the left, "/" on the right), each track's outer/upper end is "inhale" and its inner/lower end (near center) is "exhale", with Home/Restart nav pinned to the bottom corners like the horizontal layout. Slider *value* semantics are identical regardless of layout (0/1 mean the same thing for `lv`/`rv` either way) — only the on-screen orientation changes. `useTouchSlider.js` takes a 3rd `orientation` param (`'vertical'` default, `'horizontal'`, `'diagonal-left'`, `'diagonal-right'`) that changes how the ratio is computed from a drag point: `'horizontal'`/`'vertical'` use the same single-axis `1 - (coord - start)/size` formula as before (on `clientX`/`rect.left`/`rect.width` or `clientY`/`rect.top`/`rect.height`); the two diagonal orientations project the raw `(clientX, clientY)` point onto the track element's own corner-to-corner diagonal (top-left→bottom-right for `'diagonal-left'`, top-right→bottom-left for `'diagonal-right'`) via a standard line-segment vector projection, so it generalizes to any track width/height.

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
- **Shape Option C**: Inhale-style torus spawns at z=-20 (self-perpetuating, same emissive ramp/fade-out as above). Additionally, a small exhale sphere (radius=0.25, diameter=0.5) spawns simultaneously at z=-30 with the same speed, hidden until z=-20 then fading in — arrives at the Morph half an interval after the inhale torus, creating alternating Inhale→Exhale→Inhale→Exhale sequence. Exhale sphere: 0.25 alpha, no persistent emissive; pulses 0→1.5 emissive intensity via `calcEmissiveExhale` (stays 0 until z=−1, single smoothstep pulse at z=0). See `GatesC.jsx`.
- **Shape Option D has no visible Gates in Paced Breathing/Slowing Down**: `GatesHeadless.jsx` reuses GatesC's exact spawn/crossing timing (same pooled-slot simulation, same alternating inhale→exhale cadence) purely to drive `breathPhaseRef` — it renders no mesh, geometry, or material, returning `null`. The breath-pacing information that Gates+ties communicate for A/B/C is instead communicated entirely by `BackgroundA`, which is forced on for this option (see Background section below). **Box Breathing is the exception** — Option D uses `GatesBoxBreathingC.jsx` directly (same visible gates as Option C) with `BackgroundA` layered on top; see the Gate geometry section below.

## Road mesh (ties) — Shape Options A–C only
Every shape option except D scrolls thin railroad-tie markers along the track (Option D has no ties — `GatesHeadless.jsx` contains no tie-rendering code at all): `RoundedBox`, line-thin (`TIE_HEIGHT_Y`/`TIE_DEPTH_Z`/`TIE_RADIUS` all small so each tie reads as a line, not a block), at `GATE_Y`. Material: `color` = `gateColor`, no emissive, opacity = `TIE_ALPHA` (0.15) × fade-*in* only (not fade-out, so ties don't dim when a gate fades out passing the Morph) — flat, no per-position gradient.

**Pre-seeding (ties before gates enable):** Each `Gates*.jsx` pre-seeds synthetic checkpoints while `gatesEnabledRef.current` is false, so ties appear from the very first frame of Paced Breathing and Slowing Down — before any real gate ever spawns. A `preSeedRef = { elapsed, needsInitial }` tracks timing: on the first frame it pushes one checkpoint (or two for dual-gate-type options), then pushes another each time `elapsed` accumulates a full `spawnIntervalRef.current`. When gates actually enable (rising edge), pre-seed checkpoints are cleared in the same frame that `spawnA()`/`spawn()` pushes the first real checkpoint — no flicker or speed change at the transition.

Each `Gates*.jsx` keeps an independent "checkpoint" list (one entry per gate spawn — both types, for the two-gate-type options — sorted by z regardless of type, decoupled from the gate-mesh pool's own recycling) and renders three tie groups from it:
  - **Real-to-real** (`lerpRefs`/`lerpMaterials`, up to `LERP_SEGMENTS_MAX` segments × `TIES_PER_SEGMENT` (6) ties): between two consecutive real checkpoints — 1 tie at the leading gate + 5 more evenly filling the gap (frac = i/6). Both ends are real and move at their own checkpoint speed, so as gate spacing changes (e.g. Slowing Down's ramp) the tie *count* stays fixed at 6 while spacing stretches/shrinks, with no anchor-swap discontinuity.
  - **Preview** (`previewRefs`/`previewMaterials`, `TIES_PER_SEGMENT` ties): owned by the frontmost (no real gate yet ahead of it) checkpoint. Fixed offsets *ahead* of it (`frontmost.z - i * TIE_SPACING`, i=0..5), so every tie scrolls at exactly that checkpoint's own speed — no stretching toward a fixed point, hence no speed-up/jerk when the next real gate eventually spawns there and this same stretch hands off to a real-to-real segment (positions and velocities already match at that instant).
  - **Trailing filler** (`trailingRefs`/`trailingMaterials`, `TIES_PER_SEGMENT` ties): owned by the backmost (no real gate yet behind it) checkpoint. Fixed offsets *behind* it (`backmost.z + i * TIE_SPACING`); ties past `DESPAWN_Z` are hidden (so typically only 1-2 are ever visible). Skips its own i=0 (at-gate) tie when the backmost checkpoint is also the frontmost (only one real gate alive), since Preview already drew it.

  `TIE_SPACING` = the option's standard real-gate-to-real-gate distance ÷ `TIES_PER_SEGMENT`: **20/6** for the checkpoint-single option (C — ties track inhale checkpoints only; the exhale sphere doesn't push checkpoints), **10/6** for the dual-gate-type options (A, B — Exhale+Inhale spawn together 10 units apart, at `SPAWN_Z`/`GATE_B_Z`, and alternate at that steady spacing thereafter). `TIE_WIDTH_X` is sized per option below to clear the narrowest gate opening ties must pass through, inset by `TIE_GAP` so they just touch (not overlap) that edge.

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
- **Inhale Gate (torus)**: base radius=1.0, tube=0.06, scale `[1.376, 1.955, 1]` — narrow tall ellipse sized to clear MorphC's Inhale-state half-extents. Spawns at z=−20, self-triggers next spawn when it passes z=0. Standard emissive ramp (`calcEmissive`): 0→1→2 from z=−3 to z=0.
- **Exhale Gate (sphere)**: `SPHERE_RADIUS = 0.25` (diameter 0.5, matching Option B cube block width). Spawns at z=−30 simultaneously with each inhale torus, same speed — arrives at Morph half an interval later (alternating Inhale→Exhale pattern). Hidden until z=−20, then fades in. Material: `gateColor`, 0.25 alpha, `depthWrite: false`. Emissive: `calcEmissiveExhale(z)` — stays 0 until z=−1, smoothstep pulse to peak 1.5 at z=0 (×0.75 multiplier applied in loop).
- Pool: 3 inhale slots + 3 exhale slots (independent pools)
- Ties: tracks inhale checkpoints only (exhale spheres don't push checkpoints); width sized to torus inner-hole half-width (`BASE_INNER * GATE_SCALE[0]`)

## Gate geometry (Shape Option D — GatesHeadless.jsx, except Box Breathing)
- Morph reused directly from Option C (`MorphC.jsx`); no separate Morph file.
- **Paced Breathing, Slowing Down**: `GatesHeadless.jsx` renders no geometry at all (returns `null`) — same pooled inhale/exhale timing simulation as `GatesC.jsx` (3 inhale slots + 3 exhale slots, `SPAWN_Z=-20`/`EXHALE_SPAWN_Z=-30`, paired spawn on inhale crossing), stripped of meshes, materials, and the entire tie system. Writes `breathPhaseRef.current = 'inhale'|'exhale'` on the same z≥0 crossings GatesC would. The breath-pacing cue normally carried by visible Gates + ties is instead carried entirely by `BackgroundA` (forced on for this option — see Background section).
- **Box Breathing is the exception**: Option D uses `GatesBoxBreathingC.jsx` directly — identical visible torus/sphere gates to Option C's Box Breathing, no headless substitute. `BackgroundA` still renders alongside (it's gated only on shape, not mode), so Box Breathing for Option D shows both the visible gates and the ambient background together. `breathPhaseRef` during Box Breathing is driven by `App.jsx`'s `handleBBFirstGate`/`handleBBLastGate` (via the `onFirstGate`/`onLastGate` callbacks every `GatesBoxBreathing*` component calls) rather than by the Gates component itself, so this works with zero Gates-side changes.

## Modes

### Basic
- Morph + environment, no Gates.

### Paced Breathing
- Full experience with Gates at a fixed 12-second interval.
- **BreathLengthControl**: a small slider + value + label at top-left (`BreathLengthControl.jsx`) that lets the user adjust the breath interval. Hidden (opacity 0) until 2 seconds after Text D fades in, then fades in over 2 seconds. Resets to 12s and hides again when the user returns to this mode. (Also used in Slowing Down post-ramp — see that section.)
- **Gate spawn timing**: gates start disabled (`gatesEnabledRef.current = false`). They enable only when `showGatesText` fires (i.e., when Text C appears — after Text A and B complete, or immediately if the user skips past them). This means the road shows ties but no gate rings until Text C.

### Box Breathing
- 4-phase box breath: Inhale → Hold-in → Exhale → Hold-out. Each phase duration = `spawnIntervalRef.current` seconds (default 4s).
- **Gate mechanics**: `spawnSeries(type)` spawns N=4 gates simultaneously at `SPAWN_Z=−6` with even spacing. Speed = `Math.abs(SPAWN_Z) / spawnIntervalRef.current` u/s (default 1.5 u/s). Last gate (`isLast=true`) triggers the next series when it crosses z=0; type alternates inhale↔exhale. First gate (`isFirst=true`) fires `onFirstGate(type)`; last gate fires `onLastGate(type)` — both pre-triggered at z=−speed×2 so text can start fading before the gate reaches z=0.
- **Gate files**: `GatesBoxBreathingA.jsx` (torus rings), `GatesBoxBreathingB.jsx` (cube-style), `GatesBoxBreathingC.jsx` (torus + sphere) — matched to shape options A, B, and C respectively (pool: 28 slots per file). Shape option D also uses `GatesBoxBreathingC.jsx` (same visible gates as Option C) — Box Breathing is the one mode where Option D shows visible Gates, see Gate geometry section above.
- **No road ties** — Box Breathing does not render railroad ties.
- **Tutorial coaching sequence**: 2 full box-breath cycles then text hides. Managed by `bbCycleRef` (counts completed exhale-phase "last gate" events) and `bbTutorialActiveRef` in App.jsx. Uses `BB_TEXT_LEAD_MS = 1600ms` for `transitionBoxText` timeout (vs `FADE_TRANSITION_MS = 2000ms` used elsewhere) — ensures text starts appearing when the gate is at z=−0.6, just before the steep emissive ramp at z=−0.5 to z=0.

### Slowing Down
- **Text C** fires automatically after Text B (queued via `pendingGatesFnRef` thunk in `App.jsx`). Copy: "Breathe at your own pace for 5 breaths". No auto-dismiss timer — stays visible until Initial Pace is set.
- **Recording phases** (managed by `SlowingDownController.jsx`):
  - `idle` — returns early until `recordingEnabledRef.current` is true (set by `showSlowingTextC` in App.jsx when Text C appears)
  - `warmup` — counts 3 full breath cycles (min→max→min, each ≥ `MIN_BREATH_SECONDS = 1.5`); not recorded
  - `recording` — records next 2 cycles, averages them → **Initial Pace** (`avgBreathRef`); calls `onGatesReady()` callback
  - `gates` — ramps spawn interval from Initial Pace → 2× over 60 seconds (`RAMP_SECONDS`); counts post-gate cycles for Text D/E and post-ramp cycles for Text F/G/slider
- **Gate phase-locking**: when recording ends, gates are NOT enabled immediately. A delay `d` is computed so the first gate arrives at the Morph on the user's next inhale peak:
  - `lastMaxTimeRef` (ref passed from App.jsx) stores the exact timestamp of the last confirmed inhale peak
  - Single-gate shapes (C, D — GatesHeadless mirrors GatesC's timing, spawn z=−20, travel time = 1 interval): `d = P − elapsed_since_max`
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

- **Text A** — "Move the sliders / in opposite directions / with your thumbs" (3 lines via `\n`). Shown at mode start. Stays visible until the **right slider** has completed **2 full up+down oscillations** (4 direction reversals detected with an 8% deadband, tracked in `rightStrokeCountRef`), then fades out over 2 seconds. If the user never moves the right slider, Text A stays up indefinitely.
- **Text B** — "The transforming object is named Morph. / Sync your breathing to Morph." (line break after "Morph." via `\n`). Fades in once Text A fades out. Stays visible until the right slider completes **3 more full oscillations** (6 reversals, same deadband logic, counters reset when B begins), then fades out over 2 seconds.
- **Text C (Paced Breathing)** — "Fit Morph through the oncoming targets to pace your breath." Queued via `pendingGatesFnRef` thunk when Paced Breathing mode starts. Fires after Text B finishes (or immediately if A/B already done). Enables gates. Fades out after **2 breath cycles** (`spawnIntervalRef × 2` seconds, captured at Text C fire time).
- **Text D (Paced Breathing)** — "Adjust the pace of the targets with the slider on the left." Fades in 2 seconds after Text C fades (FADE_TRANSITION_MS gap). `BreathLengthControl` fades in 2 seconds after Text D appears. Fades out after **3 breath cycles** (`spawnIntervalRef × 3` seconds).
- **Shape Option D ambient copy**: since Option D has no visible targets, `showGatesText` (Paced Breathing Text C/D) and `showSlowingTextD`/`showSlowingTextE` (Slowing Down Text D/E) branch on `shapeRef.current === 'd'` in `App.jsx` and substitute `TEXTS.gatesTimedAmbient` / `TEXTS.gatesTimedDAmbient` / `TEXTS.slowingTextDAmbient` / `TEXTS.slowingTextEAmbient` (in `copy.js`), which reference the background's rhythm instead of targets. All other tutorial text (A, B, Slowing Down C/F/G, Box Breathing C–F) is shape-agnostic and unchanged for Option D.
- **Text C (Slowing Down)** — "Breathe at your own pace for 5 breaths" Queued via `pendingGatesFnRef` thunk when Slowing Down mode starts. Fires after Text B finishes. Sets `recordingEnabledRef.current = true` to start the warmup/recording flow in `SlowingDownController`. No auto-dismiss timer — stays until `SlowingDownController` calls `onGatesReady()` (recording complete), which triggers Text C fade-out.
- **Text D (Slowing Down only)** — "Good Job! The oncoming targets will begin at your pace and slow down over the next minute." (Option D: "Good Job! The background will begin pulsing at your pace and slow down over the next minute.") Shown 2 seconds after Text C fades out (after FADE_TRANSITION_MS gap). No auto-dismiss timer — stays until `SlowingDownController` calls `onTextDone()` after 3 post-gate breath cycles, then fades.
- **Text E (Slowing Down only)** — "Keep Morph aligned with the targets to slow down your breathing." (Option D: "Keep Morph in sync with the background to slow down your breathing.") Shown 2 seconds after Text D fades. No auto-dismiss timer — stays until `SlowingDownController` calls `onTextEDone()` after 4 more post-gate breath cycles, then fades.
- **Text F (Slowing Down only)** — "Good job! Your breaths are now twice as long." Shown 2 seconds after the 60s ramp completes (interrupts Text D/E if still visible). No auto-dismiss timer — stays until `SlowingDownController` calls `onTextFDone()` after 2 post-ramp breath cycles, then fades.
- **Text G (Slowing Down only)** — "You can use the slider on the left to slow down further or speed back up." Shown 2 seconds after Text F fades. No auto-dismiss timer — stays until `SlowingDownController` calls `onTextGDone()` after 2 more post-ramp cycles, then fades. The BreathLengthControl slider fades in at 3 total post-ramp cycles (1 cycle after Text G appears).
- **Text C (Box Breathing)** — "Inhale slowly". Queued via `pendingGatesFnRef` thunk. Fires after Text B, simultaneously enables gates and shows this text via `showBoxText`. No fade gap — appears immediately using `showBoxText` (not `transitionBoxText`).
- **Text D (Box Breathing)** — "Hold". Pre-triggered when the first gate of an inhale series reaches z=−speed×2; `transitionBoxText` hides current text then shows "Hold" after `BB_TEXT_LEAD_MS=1600ms` — text starts at gate z≈−0.6, coinciding with the steep emissive ramp.
- **Text E (Box Breathing)** — "Exhale slowly". Pre-triggered when the last gate of an inhale series reaches z=−speed×2.
- **Text F (Box Breathing)** — "Hold". Pre-triggered when the last gate of an exhale series reaches z=−speed×2. After 2 complete cycles (`bbCycleRef` reaches 2), `bbTutorialActiveRef` is set false and text hides permanently.
- **Idle re-show**: if the sliders are still for 10 seconds, the most recently shown text (A, B, C, D, E, F, or G — whichever was last) reappears and stays until 2 seconds after the sliders start moving again, then fades out (does not restart the sequence).
- Fade transitions take 2 seconds (`FADE_TRANSITION_MS = 2000` in `App.jsx`, must match the CSS transition in `TutorialText.jsx`). Box Breathing uses `BB_TEXT_LEAD_MS = 1600` instead for its `transitionBoxText` calls.
- `TutorialText.jsx` is positioned at `top: '38%'` with `transform: 'translateY(-50%)'` — centered in front of the Morph. Uses `whiteSpace: 'pre-line'` so `\n` in copy strings renders as actual line breaks.

## Personalization system
- **Home screen** (`HomeScreen.jsx`) is a 3-button hub, centered on screen: **Personalize** (→ Personalize screen), **Select Mode** (→ Select Mode screen), **Slider Layouts** (→ Slider Layouts screen). It holds no other content — the mode-picker card list that used to live directly on Home now lives on its own screen.
- **Select Mode screen** (`SelectModeScreen.jsx`) — the "Modes" heading + 4 mode cards (Basic / Paced Breathing / Slowing Down / Box Breathing), same content/behavior the old Home screen had. Single **Home** nav button (bottom center) returns to the hub.
- **Slider Layouts screen** (`SliderLayoutsScreen.jsx`) — 3 selectable cards, **Vertical** / **Horizontal** / **Diagonal** (checkmark on the active one), same `optionBtn(selected)` pattern as Shape/Color Options. Persisted via `sliderLayout` (see Slider controls section). Single **Home** nav button (bottom center) returns to the hub.
- Navigation from the hub: Home → Personalize → Shapes or Colors; Home → Select Mode → (starts an experience); Home → Slider Layouts.
- All nav buttons are consolidated into stacked bottom-center groups — no top-corner buttons on any screen (except the Horizontal experience-screen nav, see below). Gap between buttons: 20px. Positioned at `bottom: 16, left: '50%', transform: 'translateX(-50%)'`.
  - **Experience/breathing screen** (App.jsx overlay), **Vertical slider layout**: stacked center — **Home** / **Restart**. **Home** calls `handleBackFromExperience` (`setMode(null); setScreen('home')`), returning to the hub.
  - **Experience/breathing screen, Horizontal or Diagonal slider layout**: not stacked — **Home** pinned bottom-left (`bottom:16, left:16`), **Restart** pinned bottom-right (`bottom:16, right:16`), matching the paintover reference.
  - **Personalize screen**: **Select Mode** / **Resume Breathing**
  - **Shape Options / Color Options screens**: **Personalize** / **Select Mode** / **Resume Breathing**
  - On Personalize/Shape/Color screens, the **Select Mode** button (prop `onSelectMode`, was `onBack`/`onHome`) always jumps straight to the Select Mode screen, not the Home hub — preserves its one-tap "pick a mode" semantic now that Home and Select Mode are separate screens. These screens have no direct one-tap path back to the Home hub (Select Mode → Home is 2 taps); this is an intentional trade-off since Home is a rarely-visited settings hub, not a mid-flow bounce point.
- Shape/Color Options screens use a scrollable cards container (`height: 380, overflowY: 'auto'`) — shows ~4 cards at a time; scroll to reveal more. Layout is `justifyContent: 'flex-start'` with `paddingTop: 60, paddingBottom: 150` so cards don't slide under the bottom button group.
- Selections persisted to localStorage. There is no manual Background picker — background is fully derived from the shape choice (see Background section below).

**Shape Options:**
- **Option A** (default): sphere Morph + torus Gates (GatesA)
- **Option B**: rounded-box Morph + cube-style Gates (GatesB)
- **Option C**: "Disappearing Morph" — sphere Morph that dissolves into a particle cloud (MorphC) + alternating Inhale torus / Exhale sphere gates (GatesC); exhale sphere pulses emissive as it crosses the Morph
- **Option D**: "Disappearing Morph — ambient background" — reuses MorphC exactly, with no visible Gates or ties in Paced Breathing/Slowing Down (`GatesHeadless.jsx` renders nothing; breath pacing communicated entirely by `BackgroundA`, forced on for this option). **Box Breathing is the exception**: uses the same visible gates as Option C (`GatesBoxBreathingC.jsx`) plus `BackgroundA` layered on top.

**Color Palettes:**
- **Palette A** (default): morphBase=#0a0a6e, morphEmissive=#ff69b4, gateColor=#9955dd, background=#1a1028
- **Palette B**: morphBase=#03455e, morphEmissive=#12ffdb, gateColor=#5e4972, background=#002748
- All UI screens (Home, Personalize, Shape Options, Color Options) use `palette.background` so the active palette's background color is consistent everywhere

**Background:**
- No user-facing picker — `backgroundOption` is a derived constant in `App.jsx`, not stored state: `shapeOption === 'd' ? 'a' : 'none'`. Shape Options A/B/C always render no background; Shape Option D always renders `BackgroundA`, in every mode including Box Breathing (the derivation is shape-only, not mode-dependent). This exists because A/B/C already communicate breath pacing via visible Gates + ties, and layering the animated background on top of those was judged too visually noisy — Option D removes the Gates/ties in Paced Breathing/Slowing Down and relies on the background as its sole pacing cue there; in Box Breathing, Option D restores the visible gates (see Gate geometry section) and the background layers on top as a supplementary cue.
- **`BackgroundA`**: 30 scattered RoundedBox cubes (same geometry as GatesB inhale cubes, args [0.5, 0.5, 0.5], radius 0.1) randomly distributed across X∈[−8, 8], Y∈[−10, −4], Z∈[−30, 5]. Material: `gateColor` / `morphEmissive`, transparent. Animate between **State A** (opacity=0, emissiveIntensity=0, Y offset −5 from spawn) and **State B** (opacity=0.1, emissiveIntensity=1, at spawn Y) driven by `breathPhaseRef` + `gatesEnabledRef`: State B during exhale phase (exhale gate crosses z=0), State A during inhale phase. Animation uses linear progress over `spawnIntervalRef/2` seconds (one half-interval per direction) with smoothstep easing, so the transition fills exactly the time between consecutive gate crossings. Cubes remain hidden while `gatesEnabledRef.current` is false — invisible in Basic mode and before Text C in other modes.

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
  App.jsx                   — screen routing (home/selectMode/sliderLayouts/personalize/shape/color, else falls through to the experience screen), palette/shape/sliderLayout state, tutorial logic, localStorage; tutorial architecture uses pendingGatesFnRef (function thunk) for mode-specific Text C; key refs: recordingEnabledRef, lastMaxTimeRef, gateEnableTimerRef, shapeRef, bbCycleRef, bbTutorialActiveRef, breathPhaseRef (owned here, written by gate files on Z=0 crossings, read by BackgroundA); backgroundOption is a derived constant (not stored state): `shapeOption === 'd' ? 'a' : 'none'`; handleBBFirstGate sets breathPhaseRef.current before tutorial guard so BackgroundA responds during Box Breathing post-tutorial; showTimedText / showSlowingTextC–G / handleSlowingRecordingDone / handleSlowingTextDDone–GDone / handleSlowingRampDone / handleSlowingShowSlider / showBoxText / transitionBoxText / handleBBFirstGate / handleBBLastGate; showGatesText/showSlowingTextD/showSlowingTextE branch on shapeRef.current === 'd' to pick ambient copy variants
  MorphA.jsx                — Shape A: sphere, Fresnel inner glow via onBeforeCompile
  MorphB.jsx                — Shape B: RoundedBox, same Fresnel approach
  MorphC.jsx                — Shape C and D: sphere that dissolves into a particle cloud (metaball-style dissolve shader + two particle systems); reused directly for Option D, no separate Morph file
  GatesA.jsx                — Shape A: torus exhale/inhale gates with emissive ramp; accepts breathPhaseRef — writes 'exhale' when Gate A crosses z=0, 'inhale' when Gate B crosses z=0
  GatesB.jsx                — Shape B: cube-style gates with same emissive ramp logic; accepts breathPhaseRef — same z=0 crossing callbacks as GatesA
  GatesC.jsx                — Shape C: alternating inhale torus (z=-20) + exhale sphere (z=-30, r=0.25, 0.25 alpha, emissive pulse at z=0); 3 slots each; accepts breathPhaseRef — writes 'inhale' when torus crosses z=0, 'exhale' when sphere crosses z=0
  GatesHeadless.jsx         — Shape D, Paced Breathing/Slowing Down only: same pooled inhale/exhale timing simulation as GatesC, stripped of all meshes/materials/ties; renders null; writes breathPhaseRef on the same crossings. Box Breathing uses GatesBoxBreathingC instead (see below) — no headless variant needed there.
  GatesBoxBreathingA.jsx    — Box Breathing, Shape A: torus rings (inhale=narrow tall, exhale=wide flat), POOL_SIZE=28, SPAWN_Z=−6; onFirstGate/onLastGate pre-triggered at z=−speed×2
  GatesBoxBreathingB.jsx    — Box Breathing, Shape B: cube-style gates, same pool/spawn/callback pattern as A
  GatesBoxBreathingC.jsx    — Box Breathing, Shape C and D: inhale torus + exhale sphere, same pattern; no road ties in any box breathing file; Shape D pairs this with BackgroundA also rendering
  Sliders.jsx               — Vertical slider layout: DOM overlay sliders (top 63% to 16px from bottom), fill indicator
  SlidersHorizontal.jsx     — Horizontal slider layout: two tracks side by side splitting screen width, meeting at midpoint (top ~70%); same value semantics/props as Sliders.jsx, drop-in swap based on sliderLayout
  SlidersDiagonal.jsx       — Diagonal slider layout: two angled capsule tracks converging toward bottom-center ("\" left, "/" right), thumb positioned via a straight lerp between the track's two known corners; same value semantics/props as Sliders.jsx, drop-in swap based on sliderLayout
  useTouchSlider.js         — touch hook with identifier tracking (multi-touch); 3rd param `orientation` ('vertical' default, 'horizontal', 'diagonal-left', 'diagonal-right') controls how a drag point maps to a ratio — single-axis clientY/rect.top/rect.height or clientX/rect.left/rect.width for vertical/horizontal, 2D line-segment projection onto the track's own corner-to-corner diagonal for the two diagonal orientations
  HomeScreen.jsx            — 3-button hub: Personalize / Select Mode / Slider Layouts (centered, no nav bar of its own)
  SelectModeScreen.jsx      — mode selection ("Modes" heading, 4 mode cards), single Home nav button (bottom center)
  SliderLayoutsScreen.jsx   — Vertical/Horizontal/Diagonal selectable cards (persisted via sliderLayout), single Home nav button (bottom center)
  PersonalizeScreen.jsx     — hub: Shapes + Colors
  ShapeOptionsScreen.jsx    — shape selection (A–D), scrollable card list (height 380, overflowY auto), stacked nav buttons at bottom
  ColorOptionsScreen.jsx    — palette selection (A–B), scrollable card list (height 380, overflowY auto), stacked nav buttons at bottom
  BackgroundA.jsx           — 30 scattered RoundedBox cubes (args [0.5,0.5,0.5], gateColor/emissiveColor); positions randomized in useMemo (X∈[−8,8], Y∈[−10,−4], Z∈[−30,5]); animates between State A (opacity=0, emissiveIntensity=0, Y−5) and State B (opacity=0.1, emissiveIntensity=1, spawn Y) via linear progress over spawnIntervalRef/2 seconds with smoothstep easing; driven by breathPhaseRef+gatesEnabledRef; props: gateColor, emissiveColor, breathPhaseRef, gatesEnabledRef, spawnIntervalRef; rendered only when shapeOption === 'd', in every mode including Box Breathing
  TutorialText.jsx          — fade-in/out tutorial overlay (top of screen); `whiteSpace: 'pre-line'` on `<p>` so `\n` in copy strings renders as line breaks
  BreathLengthControl.jsx   — top-left slider + value + label for adjusting breath interval in Paced Breathing; fades in 2s after Text D (Paced Breathing) or Text F (Slowing Down)
  SlowingDownController.jsx — breath cycle detection + dynamic gate interval; phases: idle→warmup(3)→recording(2)→gates; captures lastMaxTimeRef (inhale peak time) for gate phase-locking; calls onGatesReady when Initial Pace is set, onTextDone/EFDone/GDone after respective post-gate/post-ramp cycle counts, onRampDone when 60s ramp t=1, onShowSlider 1 cycle into Text G period
  palettes.js               — PALETTES object: morphBase, morphEmissive, gateColor, background
  copy.js                   — tutorial text strings (TEXT_A, TEXT_B, TEXTS.gatesTimed / TEXTS.gatesTimedD / TEXTS.gatesSlowing / TEXTS.slowingTextD–G / TEXTS.boxInhale / TEXTS.boxHold / TEXTS.boxExhale, plus Shape Option D's ambient variants TEXTS.gatesTimedAmbient / TEXTS.gatesTimedDAmbient / TEXTS.slowingTextDAmbient / TEXTS.slowingTextEAmbient — edit here to change wording); TEXT_A and TEXT_B use `\n` for multi-line layout
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
