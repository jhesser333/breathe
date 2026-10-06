import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { useBreathCountB, COUNT_INHALE_SCALE } from './breathCountB'
import { EXHALE_OPACITY } from './cubeMaterialB'

// Shape F: Hot Air Balloon (in-progress). Simplified balloon -- a small
// rounded basket cube with the envelope sphere parented to it. Driven by the
// right slider via `leftVal` (App passes breathRef: 0 exhale/bottom -> 1
// inhale/top). The cube Morph's 5-breath count (breathCountB) sits inside the
// envelope and travels/squashes with it.
const BASKET_SIZE = 0.1
const BASKET_RADIUS = 0.02
const BALLOON_SCALE = 9    // scales the basket and, through it, the whole balloon
// Envelope sizes in the basket's local (unscaled) space; world size = value x BALLOON_SCALE
const ENVELOPE_RADIUS = 0.8 / 3
const ENVELOPE_GAP = 0.3 / 3   // basket top -> envelope bottom
const ENVELOPE_OPACITY = EXHALE_OPACITY   // same as the cube Morph

// Exhale (slider bottom) -> Inhale (slider top)
const EXHALE_BASKET_Y = -8
const INHALE_BASKET_Y = 8
const EXHALE_ENVELOPE_SCALE = [0.4, 2, 0.4]
const INHALE_ENVELOPE_SCALE = [1.25, 1, 1.25]

// Count pieces: the cube's layouts (made for its Inhale box, half-extents
// COUNT_INHALE_SCALE / 2) scaled up uniformly by COUNT_FIT, the largest that
// keeps that box inside the Inhale envelope, with a small margin.
const ENVELOPE_INHALE_HALF = INHALE_ENVELOPE_SCALE.map((v) => v * ENVELOPE_RADIUS * BALLOON_SCALE)
const COUNT_FIT = 0.97 / Math.hypot(...COUNT_INHALE_SCALE.map((v, a) => (v / 2) / ENVELOPE_INHALE_HALF[a]))
// Local scale of the count group (inside basket x envelope), so pieces are
// the cube's layouts x COUNT_FIT at full Inhale and squash with the envelope.
const COUNT_GROUP_SCALE = COUNT_INHALE_SCALE.map((v, a) => COUNT_FIT * v / (BALLOON_SCALE * INHALE_ENVELOPE_SCALE[a]))

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
  useEffect(() => () => { basketMaterial.dispose(); envelopeMaterial.dispose() }, [basketMaterial, envelopeMaterial])

  const breathCount = useBreathCountB(palette)

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
    }
  })

  return (
    <RoundedBox ref={basketRef} args={[BASKET_SIZE, BASKET_SIZE, BASKET_SIZE]} radius={BASKET_RADIUS} position={[0, EXHALE_BASKET_Y, 0]} scale={BALLOON_SCALE} material={basketMaterial}>
      {/* Envelope pivot sits at the sphere's bottom; scaling it scales the envelope from there */}
      <group ref={envelopeRef} position={[0, BASKET_SIZE / 2 + ENVELOPE_GAP, 0]} scale={EXHALE_ENVELOPE_SCALE}>
        <mesh position={[0, ENVELOPE_RADIUS, 0]} material={envelopeMaterial}>
          <sphereGeometry args={[ENVELOPE_RADIUS, 64, 32]} />
        </mesh>
        <group position={[0, ENVELOPE_RADIUS, 0]} scale={COUNT_GROUP_SCALE}>
          {breathCount.elements}
        </group>
      </group>
    </RoundedBox>
  )
}
