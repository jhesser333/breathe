# Scene, Morph material, gates and ties (shared)

_Moved out of CLAUDE.md on 2026-11-10. Detail reference: read when working on this area._

## Morph material
- Base color: `palette.tertiaryColor` (active Teal Palette: `#276d8c` blue-teal)
- Emissive color: `palette.primaryColor` (active Teal Palette: `#8db1a1` sage green)
- Fresnel inner glow via `onBeforeCompile` shader injection — masks `totalEmissiveRadiance` using inverse Fresnel factor, creating a center glow that fades toward edges
- Bloom post-processing (luminanceThreshold 0.2, intensity 1.5)

## Gate behavior
- **Exhale Gate (A)** spawns at z=-20 and fades in over 1s. When it passes z=0 (Morph), it triggers the next Gate A + Gate B simultaneously.
- **Inhale Gate (B)** spawns at z=-30 at the same moment as each Gate A (symmetric default — see the Slowing Down dynamic-ratio note below, which is the only place this shifts). Hidden until z=-20, then fades in.
- Encounter order: Gate A first (at morph after full interval), Gate B second (half-interval later). Sequence: A, B, A, B…
- **Gate emissive ramp** (smoothstepped): 0 at z=-3 → 1 at z=-0.5 → 2 at z=0, holds at 2 after passing. Emissive color = `palette.primaryColor`.
- **Gate alpha fade-out**: starts at z=0, complete at z=2. Smoothstepped.
- Gate color: `palette.secondaryColor` (active Teal Palette: `#0f3261` dark navy)
- Gate position Y: 0.25 (matches Morph)
- **Shape Option C**: Inhale-style torus spawns at z=-20 (self-perpetuating, same emissive ramp/fade-out as above). Additionally, a small exhale sphere (radius=0.25, diameter=0.5) spawns simultaneously at z=-30 with the same speed, hidden until z=-20 then fading in — arrives at the Morph half an interval after the inhale torus, creating alternating Inhale→Exhale→Inhale→Exhale sequence. Exhale sphere: 0.25 alpha, no persistent emissive; pulses 0→1.5 emissive intensity via `calcEmissiveExhale` (stays 0 until z=−1, single smoothstep pulse at z=0). See `GatesC.jsx`.
- **Shape Option D has no visible Gates in Paced Breathing/Slowing Down**: `GatesHeadless.jsx` reuses GatesC's exact spawn/crossing timing (same pooled-slot simulation, same alternating inhale→exhale cadence) purely to drive `breathPhaseRef` — it renders no mesh, geometry, or material, returning `null`. The breath-pacing information that Gates+ties communicate for A/B/C is instead communicated entirely by `BackgroundA`, which is forced on for this option (see Background section below). **Box Breathing is the exception** — Option D uses `GatesBoxBreathingC.jsx` directly (same visible gates as Option C) with `BackgroundA` layered on top; see the Gate geometry section below.

## Road mesh (ties) — Shape Options A–C only
**Shape B hides its ties** (`SHOW_TIES = false` in `GatesB.jsx`): the landscape (`LandscapeB`) now conveys forward motion. The tie layout below still runs, so flipping the flag restores them unchanged. Box Breathing never had ties.

Every shape option except D and E scrolls thin railroad-tie markers along the track (Options D and E have no ties — neither `GatesHeadless.jsx` nor `GatesHeadlessE.jsx` contains any tie-rendering code): `RoundedBox`, line-thin (`TIE_HEIGHT_Y`/`TIE_DEPTH_Z`/`TIE_RADIUS` all small so each tie reads as a line, not a block), at `GATE_Y`. Material: `color` = `gateColor` (Shape B's `GatesB.jsx`: the primary color, `emissiveColor`), no emissive, opacity = `TIE_ALPHA` (0.15) × fade-*in* only (not fade-out, so ties don't dim when a gate fades out passing the Morph) — flat, no per-position gradient.

**Pre-seeding (ties before gates enable):** Each `Gates*.jsx` pre-seeds synthetic checkpoints while `gatesEnabledRef.current` is false, so ties appear from the very first frame of Paced Breathing and Slowing Down — before any real gate ever spawns. A `preSeedRef = { elapsed, needsInitial }` tracks timing: on the first frame it pushes one checkpoint (or two for dual-gate-type options), then pushes another each time `elapsed` accumulates a full `spawnIntervalRef.current`. When gates actually enable (rising edge), pre-seed checkpoints are cleared in the same frame that `spawnA()`/`spawn()` pushes the first real checkpoint — no flicker or speed change at the transition.

Each `Gates*.jsx` keeps an independent "checkpoint" list (one entry per gate spawn — both types, for the two-gate-type options — sorted by z regardless of type, decoupled from the gate-mesh pool's own recycling) and renders three tie groups from it:
  - **Real-to-real** (`lerpRefs`/`lerpMaterials`, up to `LERP_SEGMENTS_MAX` segments × `TIES_PER_SEGMENT` (6) ties): between two consecutive real checkpoints — 1 tie at the leading gate + 5 more evenly filling the gap (frac = i/6). Both ends are real and move at their own checkpoint speed, so as gate spacing changes (e.g. Slowing Down's ramp) the tie *count* stays fixed at 6 while spacing stretches/shrinks, with no anchor-swap discontinuity.
  - **Preview** (`previewRefs`/`previewMaterials`, `TIES_PER_SEGMENT` ties): owned by the frontmost (no real gate yet ahead of it) checkpoint. Fixed offsets *ahead* of it (`frontmost.z - i * TIE_SPACING`, i=0..5), so every tie scrolls at exactly that checkpoint's own speed — no stretching toward a fixed point, hence no speed-up/jerk when the next real gate eventually spawns there and this same stretch hands off to a real-to-real segment (positions and velocities already match at that instant).
  - **Trailing filler** (`trailingRefs`/`trailingMaterials`, `TIES_PER_SEGMENT` ties): owned by the backmost (no real gate yet behind it) checkpoint. Fixed offsets *behind* it (`backmost.z + i * TIE_SPACING`); ties past `DESPAWN_Z` are hidden (so typically only 1-2 are ever visible). Skips its own i=0 (at-gate) tie when the backmost checkpoint is also the frontmost (only one real gate alive), since Preview already drew it.

  `TIE_SPACING` = the option's standard real-gate-to-real-gate distance ÷ `TIES_PER_SEGMENT`: **20/6** for the checkpoint-single option (C — ties track inhale checkpoints only; the exhale sphere doesn't push checkpoints), **10/6** for the dual-gate-type options (A, B — Exhale+Inhale spawn together 10 units apart, at `SPAWN_Z`/`GATE_B_Z`, and alternate at that steady spacing thereafter). `TIE_WIDTH_X` is sized per option below to clear the narrowest gate opening ties must pass through, inset by `TIE_GAP` so they just touch (not overlap) that edge.
  - `TIE_SPACING` stays a fixed constant even during Slowing Down's asymmetric-pace ramp (see Gate geometry sections below), even though the real `GATE_B_Z` spawn position drifts ±6.7% off -30 at the 4-6 target. Only the Preview/Trailing filler tie groups use `TIE_SPACING`; the real-to-real segment always recomputes its own spacing live from the actual gap between two real checkpoints, so this is a deliberate, visually negligible approximation on thin line-marker ties, not an oversight.


## Current scene setup
- **Camera**: per-shape, via the `CAMERA_BY_SHAPE` map in `App.jsx` (keyed by `shapeOption`, falling back to `DEFAULT_CAMERA` = Option A's entry). Shape Options A/B/C: position `[0, 3.5, 5]`, fov 50, **no `rotation` key** — R3F's default look-at-origin supplies the ~35° downward angle (dropping the key is what produces the tilt, so don't add `rotation: [0, 0, 0]` back). Shape Option D: position `[0, 0, 10]`, `rotation: [0, 0, 0]`, fov 50 — level and pulled back, plus `CameraVerticalShift` (D-only shift-lens crop, see below). Shape Option E: position `[0, 0, 5]`, `rotation: [0, 0, 0]`, fov 50 — level. R3F applies the camera prop at Canvas mount; `shapeOption` only changes from the Art Options screen, which unmounts the Canvas, so each option always gets a fresh camera.
- **`CameraVerticalShift.jsx`** (Shape Option D only): shift-lens vertical crop via `camera.setViewOffset` — renders a frame `EXTRA_HEIGHT_FRACTION` (0.6) taller than the viewport and shows a sub-window offset downward by `SHIFT_FRACTION` (0.65) of that headroom plus `EXTRA_SHIFT_PX` (24px ≈ ¼"), so the scene sits higher in frame without rotating or moving the camera in world space.
- **Background**: from active palette (Teal Palette: `#1a1a3a` dark blue)
- **Lights**: ambientLight 0.4 + directionalLight at `[5, 5, 5]` intensity 1
- **Morph**: sphere radius 0.5, position [0, 0.25, 0], scaled via group
- **Bloom**: `@react-three/postprocessing` v2, luminanceThreshold=0.2, luminanceSmoothing=0.9, intensity=1.5

## Axis orientation
- **X** — width (left/right)
- **Y** — height (up/down)
- **Z** — depth along road (negative Z = ahead; positive Z = toward camera)
- Morph at [0, 0.25, 0]; gates spawn at z=-20 (A) or z=-30 (B), travel toward z=0


