import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { planeLimits, groundY, BAR_W } from './planeCloudsG'

// Shape G (Paper Airplane): railroad-tie lines on the ground plane (the
// bottom of the gates' bar), scrolling toward the camera with the gates so
// the ground reads clearly. A steady, even scroll (not the cube's
// gate-anchored ties): evenly spaced from TIE_FAR_Z to TIE_NEAR_Z, wrapping
// back to the far end, fading in over the farthest TIE_FADE units.
const TIE_WIDTH = BAR_W
const TIE_HEIGHT = 0.04
const TIE_DEPTH = 0.08
const TIE_RADIUS = 0.01
const TIE_ALPHA = 0.15          // as the cube's ties
const TIE_SPACING = 2
const TIE_FAR_Z = -40
const TIE_NEAR_Z = 10
const TIE_FADE = 5
const TIE_COUNT = Math.round((TIE_NEAR_Z - TIE_FAR_Z) / TIE_SPACING)
// Speed follows the gates (LandscapeB's rule): distance a gate travels per
// spawn interval; Own Pace / Tutorial drift at a fixed interval.
const GATE_TRAVEL = { box: 6, other: 20 }
const OWN_PACE_INTERVAL = 12

export default function GroundTiesG({ mode, spawnIntervalRef, livePaletteRef, palette }) {
  const meshRefs = useRef([])
  const offsetRef = useRef(0)   // scroll distance, 0 -> TIE_SPACING

  const geometry = useMemo(() => new RoundedBoxGeometry(TIE_WIDTH, TIE_HEIGHT, TIE_DEPTH, 2, TIE_RADIUS), [])
  const materials = useMemo(() => Array.from({ length: TIE_COUNT }, () => new THREE.MeshBasicMaterial({
    color: palette.primaryColor, transparent: true, opacity: TIE_ALPHA, depthWrite: false,
  })), [palette])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials])

  useFrame((state, delta) => {
    const interval = mode === 'basic' || mode === 'tutorial' || !mode ? OWN_PACE_INTERVAL : spawnIntervalRef.current
    const speed = (mode === 'box' ? GATE_TRAVEL.box : GATE_TRAVEL.other) / Math.max(interval, 0.1)
    offsetRef.current = (offsetRef.current + speed * Math.min(delta, 0.1)) % TIE_SPACING
    const y = groundY(planeLimits(state.camera, state.size))
    const live = livePaletteRef && livePaletteRef.current

    for (let i = 0; i < TIE_COUNT; i++) {
      const m = meshRefs.current[i]
      if (!m) continue
      const z = TIE_FAR_Z + i * TIE_SPACING + offsetRef.current
      m.position.set(0, y, z)
      const mat = materials[i]
      mat.opacity = TIE_ALPHA * THREE.MathUtils.smoothstep(z, TIE_FAR_Z, TIE_FAR_Z + TIE_FADE)
      if (live) mat.color.copy(live.primary)
    }
  })

  return (
    <>
      {materials.map((mat, i) => (
        <mesh key={i} ref={(el) => { meshRefs.current[i] = el }} geometry={geometry} material={mat} />
      ))}
    </>
  )
}
