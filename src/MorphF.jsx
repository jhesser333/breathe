import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

// Shape F: Hot Air Balloon (in-progress). Simplified balloon -- a small
// rounded basket cube with the envelope sphere parented to it. Driven by the
// right slider via `leftVal` (App passes breathRef: 0 exhale/bottom -> 1
// inhale/top). No pace art yet.
const BASKET_SIZE = 0.1
const BASKET_RADIUS = 0.02
const BALLOON_SCALE = 4    // scales the basket and, through it, the whole balloon
// Envelope sizes in the basket's local (unscaled) space; world size = value x BALLOON_SCALE
const ENVELOPE_RADIUS = 0.8 / 3
const ENVELOPE_GAP = 0.3 / 3   // basket top -> envelope bottom

// Exhale (slider bottom) -> Inhale (slider top)
const EXHALE_BASKET_Y = -3
const INHALE_BASKET_Y = 3
const EXHALE_ENVELOPE_SCALE = [0.2, 1, 0.2]
const INHALE_ENVELOPE_SCALE = [1, 1, 1]

export default function MorphF({ leftVal, palette }) {
  const basketRef = useRef()
  const envelopeRef = useRef()

  useFrame(() => {
    const lv = THREE.MathUtils.smoothstep(leftVal.current, 0, 1)
    const lerp = THREE.MathUtils.lerp
    basketRef.current.position.y = lerp(EXHALE_BASKET_Y, INHALE_BASKET_Y, lv)
    envelopeRef.current.scale.set(
      lerp(EXHALE_ENVELOPE_SCALE[0], INHALE_ENVELOPE_SCALE[0], lv),
      lerp(EXHALE_ENVELOPE_SCALE[1], INHALE_ENVELOPE_SCALE[1], lv),
      lerp(EXHALE_ENVELOPE_SCALE[2], INHALE_ENVELOPE_SCALE[2], lv),
    )
  })

  return (
    <RoundedBox ref={basketRef} args={[BASKET_SIZE, BASKET_SIZE, BASKET_SIZE]} radius={BASKET_RADIUS} position={[0, EXHALE_BASKET_Y, 0]} scale={BALLOON_SCALE}>
      <meshStandardMaterial color={palette.primaryColor} />
      {/* Envelope pivot sits at the sphere's bottom; scaling it scales the envelope from there */}
      <group ref={envelopeRef} position={[0, BASKET_SIZE / 2 + ENVELOPE_GAP, 0]} scale={EXHALE_ENVELOPE_SCALE}>
        <mesh position={[0, ENVELOPE_RADIUS, 0]}>
          <sphereGeometry args={[ENVELOPE_RADIUS, 64, 32]} />
          <meshStandardMaterial color={palette.primaryColor} emissive={palette.primaryColor} emissiveIntensity={0.25} />
        </mesh>
      </group>
    </RoundedBox>
  )
}
