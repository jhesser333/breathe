import { RoundedBox } from '@react-three/drei'

// Shape F: Hot Air Balloon (in-progress). Simplified balloon -- a small
// rounded basket cube with the envelope sphere parented to it. No slider
// drive or pace art yet; slider props are accepted and ignored.
const BASKET_SIZE = 0.1
const BASKET_RADIUS = 0.02
const ENVELOPE_RADIUS = 0.1875
const ENVELOPE_GAP = 0.15  // basket top -> envelope bottom
const BALLOON_SCALE = 4    // scales the basket and, through it, the whole balloon

export default function MorphF({ palette }) {
  return (
    <RoundedBox args={[BASKET_SIZE, BASKET_SIZE, BASKET_SIZE]} radius={BASKET_RADIUS} position={[0, 0, 0]} scale={BALLOON_SCALE}>
      <meshStandardMaterial color={palette.primaryColor} />
      {/* Envelope pivot sits at the sphere's bottom */}
      <group position={[0, BASKET_SIZE / 2 + ENVELOPE_GAP, 0]}>
        <mesh position={[0, ENVELOPE_RADIUS, 0]}>
          <sphereGeometry args={[ENVELOPE_RADIUS, 64, 32]} />
          <meshStandardMaterial color={palette.primaryColor} emissive={palette.primaryColor} emissiveIntensity={0.25} />
        </mesh>
      </group>
    </RoundedBox>
  )
}
