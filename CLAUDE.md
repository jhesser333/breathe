# Breathe

## What we're building
A React Three Fiber mobile app where two thumb sliders drive real-time animation of a central 3D form (the Morph) as it appears to travel through an environment.

## Core concepts

**The Morph** — the central animated form. Can be a simple 3D shape, a composition of meshes, or a particle system. Always stays fixed on screen. Follows squash-and-stretch animation principles. Both sliders control its shape/state live.

**The Environment** — surrounds the Morph. Includes Obstacles. Scrolls past the Morph to create the illusion of forward movement (like driving, with the Morph in front of you).

## Tech stack
- React Three Fiber (Three.js)
- Real-time particle systems
- Custom GLSL shaders/materials
- Touch/slider input → live parameter control (two sliders, one per thumb)

## Workflow
1. User describes what they want
2. Claude builds it in React Three Fiber
3. Iterate via screenshots/descriptions
4. Push to GitHub → auto-deploys to Vercel → share URL
