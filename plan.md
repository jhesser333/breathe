# Breathe — First Prototype Plan

## What we're building
A mobile-first React Three Fiber scene with a single animated sphere (the Morph) controlled by two vertical thumb sliders:

| Slider | Shape effect | Color effect |
|--------|-------------|--------------|
| Left (0=down, 1=up) | Horizontal scale: narrow → wide | Diffuse color: green → blue |
| Right (0=down, 1=up) | Vertical scale: short → tall | Emissive intensity: 0 → bright glow |

**Key behavior examples:**
- Left down + Right up → thin and tall, green, glowing
- Left up + Right down → wide and short, blue, no glow
- Both up → wide AND tall (independent axes, not volume-preserving)

---

## Project setup

1. Scaffold with Vite + React:
   ```
   npm create vite@latest breathe -- --template react
   cd breathe
   npm install three @react-three/fiber @react-three/drei
   ```
2. Strip the Vite boilerplate (App.css, default JSX content)
3. Set `html, body, #root` to `width: 100%; height: 100%; overflow: hidden` for full-screen mobile

---

## File structure

```
src/
  App.jsx           — mounts Canvas + passes slider state down
  Morph.jsx         — the sphere mesh, receives leftVal/rightVal as props
  Sliders.jsx       — two full-height touch sliders (DOM overlay, not R3F)
  useTouchSlider.js — custom hook: touch position → normalized 0–1 value
```

---

## Component details

### `useTouchSlider.js`
- Attaches `touchstart` / `touchmove` listeners to a ref element
- Normalizes vertical touch position within the element's bounding rect to 0 (bottom) → 1 (top)
- Returns `[ref, value]`

### `Sliders.jsx`
- Two `<div>` tracks, absolutely positioned left and right edges, full screen height
- Each uses `useTouchSlider`
- Passes `leftVal` and `rightVal` up via callbacks / shared state in App

### `App.jsx`
- Holds `leftVal` and `rightVal` in state
- Renders `<Canvas>` (R3F, full screen) with `<Morph>` inside
- Renders `<Sliders>` as a DOM overlay on top of the canvas

### `Morph.jsx`
- `<mesh>` with `<sphereGeometry args={[1, 64, 64]}/>`
- Scale: `[hScale, vScale, hScale]`
  - `hScale`: lerp(0.3, 2.5, leftVal)
  - `vScale`: lerp(0.3, 2.5, rightVal)
- Material: `<meshStandardMaterial>`
  - `color`: THREE.Color lerp from `#22dd55` (green) to `#2255ff` (blue) by `leftVal`
  - `emissive`: same color as diffuse
  - `emissiveIntensity`: lerp(0, 4, rightVal)
- Wrap scale/color updates in `useFrame` so they animate smoothly each tick (no abrupt jumps)

### Scene setup (inside Canvas in App.jsx)
- `<ambientLight intensity={0.4} />`
- `<directionalLight position={[5, 5, 5]} />`
- Background: dark neutral (e.g. `#111111`) so the glow reads well
- Camera: slightly pulled back, centered on origin — `position={[0, 0, 5]}`

---

## Slider UI design
- Thin semi-transparent vertical track (e.g. 44px wide, ~80% screen height, centered vertically)
- A small circular thumb indicator that moves with the touch position
- No labels needed for prototype — position tells the story

---

## Verification checklist
- [ ] Scene renders a sphere centered on screen on mobile and desktop
- [ ] Dragging right slider up stretches sphere taller; dragging down squashes it short
- [ ] Dragging left slider up widens sphere; dragging down narrows it
- [ ] Left down + Right up → thin tall green glowing shape
- [ ] Left up + Right down → wide short blue unlit shape
- [ ] Color smoothly transitions green ↔ blue as left slider moves
- [ ] Emissive glow smoothly transitions off ↔ bright as right slider moves
- [ ] No jank — transitions feel smooth (lerped in useFrame)
- [ ] Works with touch on a real phone (not just mouse)
