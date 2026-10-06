import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { useBreathCountF } from './breathCountF'
import { EXHALE_OPACITY } from './cubeMaterialB'

// Shape F: Hot Air Balloon (in-progress). Simplified balloon -- a small
// rounded basket cube with the envelope sphere parented to it. Driven by the
// right slider via `leftVal` (App passes breathRef: 0 exhale/bottom -> 1
// inhale/top). The balloon's own 5-breath count (breathCountF) sits inside the
// envelope and travels/squashes with it.
const BASKET_SIZE = 0.1
const BASKET_RADIUS = 0.02
const BALLOON_SCALE = 9    // scales the basket and, through it, the whole balloon
// Envelope sizes in the basket's local (unscaled) space; world size = value x BALLOON_SCALE
const ENVELOPE_RADIUS = 0.8 / 3
const ENVELOPE_GAP = 0.3 / 3   // basket top -> envelope bottom
const ENVELOPE_OPACITY = EXHALE_OPACITY   // same as the cube Morph
// Inner shell: an opaque, back-faces-only sphere sharing the envelope's
// bottom pivot, SHELL_EXTRA world units larger in radius, so through the
// see-through envelope you see the inside of the shell's far half.
const SHELL_EXTRA = 0.1
const SHELL_RADIUS = ENVELOPE_RADIUS + SHELL_EXTRA / BALLOON_SCALE

// Exhale (slider bottom) -> Inhale (slider top)
const EXHALE_BASKET_Y = -8
const INHALE_BASKET_Y = 6
const EXHALE_ENVELOPE_SCALE = [0.3, 2, 0.3]
const INHALE_ENVELOPE_SCALE = [1.5, 1, 1.25]

// Count pieces (breathCountF) are laid out in world units at full Inhale,
// inside the envelope's Inhale ellipsoid (world half-extents below). The
// count group's local scale cancels the basket and Inhale envelope scales, so
// its local units are those world units at Inhale; at Exhale the pieces
// squash with the envelope.
const ENVELOPE_INHALE_HALF = INHALE_ENVELOPE_SCALE.map((v) => v * ENVELOPE_RADIUS * BALLOON_SCALE)
const COUNT_GROUP_SCALE = INHALE_ENVELOPE_SCALE.map((v) => 1 / (BALLOON_SCALE * v))

export default function MorphF({ leftVal, rightVal, palette, breathCountingEnabledRef, breathCountSourceRef, livePaletteRef, onBreathPaletteCycle, onBreathCountEvent, landscapeIndexRef }) {
  const basketRef = useRef()
  const envelopeRef = useRef()

  const basketMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: palette.primaryColor }), [palette])
  const envelopeMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: palette.primaryColor,
    emissive: palette.primaryColor,
    emissiveIntensity: 0.25,
    transparent: true,
    opacity: ENVELOPE_OPACITY,
    depthWrite: false,
  }), [palette])
  const shellMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: palette.primaryColor,
    emissive: palette.primaryColor,
    emissiveIntensity: 0.25,
    side: THREE.BackSide,
  }), [palette])
  useEffect(() => () => { basketMaterial.dispose(); envelopeMaterial.dispose(); shellMaterial.dispose() }, [basketMaterial, envelopeMaterial, shellMaterial])

  const breathCount = useBreathCountF(palette, ENVELOPE_INHALE_HALF)

  useFrame((state) => {
    const now = state.clock.elapsedTime
    const lv = THREE.MathUtils.smoothstep(leftVal.current, 0, 1)
    const lerp = THREE.MathUtils.lerp
    basketRef.current.position.y = lerp(EXHALE_BASKET_Y, INHALE_BASKET_Y, lv)
    envelopeRef.current.scale.set(
      lerp(EXHALE_ENVELOPE_SCALE[0], INHALE_ENVELOPE_SCALE[0], lv),
      lerp(EXHALE_ENVELOPE_SCALE[1], INHALE_ENVELOPE_SCALE[1], lv),
      lerp(EXHALE_ENVELOPE_SCALE[2], INHALE_ENVELOPE_SCALE[2], lv),
    )

    // 5-breath count, same as MorphB: from the right slider (0 exhale -> 1
    // inhale) unless App.jsx supplies a paced source.
    const countSource = breathCountSourceRef && breathCountSourceRef.current
    const countRaw = countSource ? countSource.current : 1 - rightVal.current
    const countingEnabled = !!(breathCountingEnabledRef && breathCountingEnabledRef.current)
    breathCount.update(now, countRaw, countingEnabled, onBreathPaletteCycle, livePaletteRef, landscapeIndexRef, onBreathCountEvent, !countSource)

    // Follow the app-wide breath-cycle palette (App.jsx owns the lerp).
    if (livePaletteRef && livePaletteRef.current) {
      const live = livePaletteRef.current
      basketMaterial.color.copy(live.primary)
      envelopeMaterial.color.copy(live.primary)
      envelopeMaterial.emissive.copy(live.primary)
      shellMaterial.color.copy(live.primary)
      shellMaterial.emissive.copy(live.primary)
    }
  })

  return (
    <RoundedBox ref={basketRef} args={[BASKET_SIZE, BASKET_SIZE, BASKET_SIZE]} radius={BASKET_RADIUS} position={[0, EXHALE_BASKET_Y, 0]} scale={BALLOON_SCALE} material={basketMaterial}>
      {/* Envelope pivot sits at the sphere's bottom; scaling it scales the envelope from there */}
      <group ref={envelopeRef} position={[0, BASKET_SIZE / 2 + ENVELOPE_GAP, 0]} scale={EXHALE_ENVELOPE_SCALE}>
        <mesh position={[0, ENVELOPE_RADIUS, 0]} material={envelopeMaterial}>
          <sphereGeometry args={[ENVELOPE_RADIUS, 64, 32]} />
        </mesh>
        <mesh position={[0, SHELL_RADIUS, 0]} material={shellMaterial}>
          <sphereGeometry args={[SHELL_RADIUS, 64, 32]} />
        </mesh>
        <group position={[0, ENVELOPE_RADIUS, 0]} scale={COUNT_GROUP_SCALE}>
          {breathCount.elements}
        </group>
      </group>
    </RoundedBox>
  )
}
