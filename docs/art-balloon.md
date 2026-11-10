# Art H: Balloon

_Moved out of CLAUDE.md on 2026-11-10. Detail reference: read when working on this area._

## Shape Option H — Balloon (in-progress, `MorphH.jsx`, `BalloonCourseH.jsx`, `balloonH.js`)
Art Options card "Balloon (in-progress)" (id `'h'`, after the Paper Airplane). Camera = the airplane's (`CAMERA_BY_SHAPE.h` `[0, 7, 10]`, fov 50). Design: `Concepts_Reference/10_28_26_BalloonStoryboard_a.png` and `10_28_26_BalloonStates_a.png`. Unlike every other art, nothing scrolls on a clock. The course stands still while the user inhales, and it moves toward the camera only once the app sees the user start to exhale through an open door: one `SEGMENT_LEN` (17) per exhale, arriving in the pace's exhale time.
- **Balloon (`MorphH`):** gray-box sphere, radius `BALLOON_R` 0.7 (diameter = the airplane's wingspan), with a small cone knot under it. Pivot at the sphere's center. Breath (eased `breathRef`) drives:
  - Scale, in the balloon's own axes: `EXHALE_SCALE` [0.18, 1.6, 0.18] (tall and thin, the start state) → [1, 1, 1] (round).
  - Height: `restY` → `flightY`.
  - Phone side tilt moves it like the airplane.
- **Overrides** (`balloonStateRef`, written by the course):
  - `'travel'`: tips 90° (top toward −Z) and holds the height it left at until the last 20% of the exhale (`DROP_START`), then drops and turns upright. It stays tipped until the course is `TIP_HOLD_P` 0.85 along.
  - `'deflate'`: back to full Exhale over ~0.6 s, ignoring the controls (unused now: a miss leaves the balloon following the controls).
  - `bounceStart`: forward to the door/wall face, squashed flat, sprung back (~1.15 s).
  - MorphH writes `planePosRef` and `balloonStateRef.bottom`.
- **Heights (`balloonLimits`):**
  - The rest bottom sits where the plane's bottom sits at full Inhale.
  - The ground is under the short barrier (`SHORT_H` 0.2); walls are `WALL_H` 3 tall.
  - `flightY` = the airplane's `topY`, or just high enough to clear the walls.
  - The door reaches `DOOR_CLEAR` above the balloon's top at flight height.
- **Segment** (from its start, the short barrier under the balloon):
  - A door (live primary base) standing on the first wall's front edge, pivoting on its back-bottom edge.
  - Walls `WALL_HEIGHTS` [1, 1, 1, 0.75, 0.5, 0.25] × `WALL_H`, every `WALL_STEP` 2.3.
  - Rings (the airplane's ring look, judging and burst) at `flightY` over walls 1–5, all on one random side (`RING_SIDE_FRAC` 0.58 × spanX).
  - Barriers (walls, short barrier) are the airplane bar material with no emissive and no reactions; the short barrier glows only in its Box Hold-out pulse. Each wall is as wide as it is tall (`WALL_H` 3 wide, the stepped ones scaled down in X and Y together); the short barrier and the door are a full wall's width (3). The door keeps `GATE_EMISSIVE` 0.2.
  - 4 slots (segments cur−1 … cur+2), new ones fading in over 1 s.
- **Pace phases** (`balloonPaceRef.phase`; paced = `gatesEnabledRef`). Exhale/inhale starts use a `DEADBAND` 0.05 turn from the last peak/trough.
  - `inhale`:
    - Paced: lasts the inhale time (Inhale bell), and an exhale bumps the balloon into the door/wall.
    - Before the pace (free travel: Tutorial Part 2, Own Pace, Slowing Down's recording): no limit, no bells. Any exhale starts a `FREE_EXHALE_S` 6 s trip if the balloon's bottom clears the wall top; otherwise it bumps the wall.
  - `hold-in` (Box): the door pulses on each of the 4 counts.
  - `door-open`: Exhale bell, the door swings down over 0.5 s.
    - An exhale within `DOOR_WINDOW_S` 3 s starts the trip if the balloon clears the wall. Otherwise it bumps the wall and it's a miss.
    - No exhale is a miss.
  - `retry`: door closed and `TEXTS.balloonRetry` fades in. The balloon isn't deflated; it keeps following the controls.
    - The next inhale start hides the text.
    - Full inhale after that reopens the door with a new Exhale bell (`bellSeq`).
  - `exhale`: the trip, at a trapezoid speed (`TRAVEL_RAMP` 0.15 ease in/out).
  - `hold-out` (Box): the short barrier under the balloon pulses on each count.
- **App wiring:** `balloonPhaseNow()` makes `getBellPhase` (Exhale key `exhale:<bellSeq>`; `PaceAudioDriver` strips the suffix), `getLabelPhase`, `getHoldPhase` and `getQuietRate` follow the course instead of the box/slowing clocks.
  - Box captions for `'h'` are plain Inhale/Hold/Exhale/Hold text following the phases for `BALLOON_CAPTION_CYCLES` 4 box cycles, with no timed fades.
  - The course is mounted under `showBackgroundArt` (Tutorial Part 1 shows only the balloon) and there are no Gates components.
  - In `isAmbientArt`: no 5-breath count, so Tutorial Part 2 doesn't advance with this art (as with the airplane).


