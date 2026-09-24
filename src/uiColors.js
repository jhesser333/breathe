// Shared live-palette colors for experience-screen controls, so buttons and
// sliders always match: a thin primary-color edge around a darker, mostly
// transparent primary-color interior. --live-primary-rgb is written every
// frame by App.jsx's PaletteLerpDriver (Teal primary as the fallback).
export const livePrimary = (alpha) => `rgba(var(--live-primary-rgb, 141, 177, 161), ${alpha})`
export const UI_EDGE = livePrimary(0.8)       // 1px outline
export const UI_INTERIOR = livePrimary(0.25)  // background inside the outline
export const UI_FILL = livePrimary(0.45)      // slider progress fill
export const UI_THUMB = livePrimary(0.9)
export const UI_THUMB_GLOW = livePrimary(0.5)
