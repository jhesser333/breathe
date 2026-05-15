# Breathe — Living State Doc

## What's built

### Morph
- RoundedBox (2×2×2, radius 0.3) centered at origin
- Left slider → horizontal scale lerp(0.6, 2.5) + color green→blue
- Right slider → vertical scale lerp(0.6, 2.0) + emissive glow lerp(0, 4)
- Scale and color updated every frame in `useFrame` via refs (no re-renders)

### Sliders
- Two DOM overlay sliders, left and right edges of screen
- Multi-touch: each slider tracks its own touch by identifier — both thumbs work simultaneously
- Mouse fallback for desktop testing

### Gates
- Pool of 3 gate instances (recycled, no allocation mid-session)
- Spawn every 8 seconds at z=-20, travel at 5 units/sec, despawn at z=+8
- Each gate = 2 gray boxes (0.6×0.6×0.6) at x=±1.2, y=0
- Morph passes between them at z=0

### Scene
- Camera at [0, 2.9, 5], ~30° down, fov 50
- Dark background #111111
- Ambient + directional lighting

---

## Ideas / next iterations

### Morph
- Try particle-based Morph
- Add smooth easing/lerp to slider response (not instant)
- Volume-preserving squash and stretch option

### Gates
- Vary gate box size, height, or shape
- Animate gate boxes on pass-through (flash, scale pop, color change)
- Add a ground plane or road surface to give more spatial context
- Gate patterns / rhythm variations

### Environment
- Add a ground plane (Road surface)
- Background color / gradient that reacts to slider values
- Ambient particles in the environment
- Obstacles (separate from Gates)

### Camera
- Experiment with FOV changes driven by sliders
- Subtle camera sway or bob

### Polish
- Transition/intro animation on load
- Sound (stretch/squash feedback)
