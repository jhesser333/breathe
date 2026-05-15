# Breathe

## What we're building
A mobile-first React Three Fiber app where two thumb sliders drive real-time animation of a central 3D form (the Morph) as it appears to travel through an environment full of Gates.

## Vocabulary

**Morph** — the central animated form, always fixed at the origin. Currently a rounded cube. Follows squash-and-stretch principles. Both sliders control its shape, color, and glow live.

**Environment** — everything surrounding the Morph. Scrolls past the Morph to create the illusion of forward movement (like driving, with the Morph in front of you).

**Road** — the invisible path the Morph travels along. Runs along the Z-axis. Negative Z = forward (ahead of Morph); positive Z = behind (toward camera). No geometry yet — just a conceptual line in space.

**Gate** — an invisible plane perpendicular to the Road that the Morph passes through periodically. Visualized by placing objects on either side of the Road so the Morph travels between them. Currently: two gray boxes, one on each side.

## Slider controls

| Slider | Shape | Color / Glow |
|--------|-------|--------------|
| Left (0=bottom, 1=top) | Horizontal scale: lerp(0.6, 2.5) | Diffuse color: green → blue |
| Right (0=bottom, 1=top) | Vertical scale: lerp(0.6, 2.0) | Emissive intensity: lerp(0, 4) |

Slider values are stored as refs (not state) to avoid re-renders. Updates happen in `useFrame`.

## Current scene setup
- **Camera**: position `[0, 2.9, 5]`, fov 50 — ~30° downward angle, shows road ahead
- **Background**: `#111111`
- **Lights**: ambientLight 0.4 + directionalLight at `[5, 5, 5]`
- **Morph**: RoundedBox args=`[2,2,2]`, radius=0.3, smoothness=4
- **Gates**: pool of 3, spawn every 8s at z=-20, speed 5 units/sec, despawn at z=+8. Box pairs at x=±1.2, size 0.6×0.6×0.6, gray #888.

## File structure
```
src/
  App.jsx           — Canvas + slider refs + scene root
  Morph.jsx         — RoundedBox, scale/color driven by leftVal/rightVal refs
  Gates.jsx         — gate pool: spawns box pairs that travel along the Road
  Sliders.jsx       — DOM overlay, two vertical touch sliders
  useTouchSlider.js — touch hook with identifier tracking (supports multi-touch)
  main.jsx          — entry point
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
