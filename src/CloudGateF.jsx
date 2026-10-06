import { useMemo, useEffect } from 'react'
import * as THREE from 'three'

// Shape F (Hot Air Balloon): first look at a cloud gate -- one static cloud,
// randomized once per mount (Restart shows a new one). No movement or timing yet.
// A parent sphere with CHILD_COUNT child spheres centered on the camera-facing
// half of its surface, half of them on -X and half on +X. Scale lives on each
// mesh (not the group), so children don't inherit the parent's scale.
const SCALE_RANGE = [1, 2]     // radius along each axis (unit-radius sphere geometry)
const CHILD_COUNT = 4
const EMISSIVE_INTENSITY = 4
const OPACITY = 0.5

function randScale() {
  const r = () => SCALE_RANGE[0] + Math.random() * (SCALE_RANGE[1] - SCALE_RANGE[0])
  return [r(), r(), r()]
}

// Random unit direction with z > 0 (faces the camera) and the given X sign.
function facingDirection(xSign) {
  let x, y, z, len
  do {
    x = Math.random() * 2 - 1
    y = Math.random() * 2 - 1
    z = Math.random() * 2 - 1
    len = Math.hypot(x, y, z)
  } while (len < 1e-3 || len > 1)
  return [xSign * Math.abs(x) / len, y / len, Math.abs(z) / len]
}

export default function CloudGateF({ palette }) {
  const cloud = useMemo(() => {
    const parentScale = randScale()
    const children = Array.from({ length: CHILD_COUNT }, (_, i) => {
      const d = facingDirection(i < CHILD_COUNT / 2 ? -1 : 1)
      return {
        position: [d[0] * parentScale[0], d[1] * parentScale[1], d[2] * parentScale[2]],
        scale: randScale(),
      }
    })
    return { parentScale, children }
  }, [])

  // One material shared by all spheres in the cloud
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: palette.textColor,
    emissive: palette.secondaryColor,
    emissiveIntensity: EMISSIVE_INTENSITY,
    transparent: true,
    opacity: OPACITY,
  }), [palette])
  useEffect(() => () => material.dispose(), [material])

  return (
    <group position={[0, 0, 0]}>
      <mesh scale={cloud.parentScale} material={material}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      {cloud.children.map((c, i) => (
        <mesh key={i} position={c.position} scale={c.scale} material={material}>
          <sphereGeometry args={[1, 32, 16]} />
        </mesh>
      ))}
    </group>
  )
}
