import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const RING_COUNT = 5
const RADIUS_MIN = 0.15
const RADIUS_MAX = 0.6
const TUBE = 0.035

// Index convention: ascending radius, so index RING_COUNT-1 is the
// outermost ring, RING_COUNT-2 the second-outermost.
const RADII = Array.from({ length: RING_COUNT }, (_, i) =>
  THREE.MathUtils.lerp(RADIUS_MIN, RADIUS_MAX, RING_COUNT > 1 ? i / (RING_COUNT - 1) : 0)
)

export default function MorphE({ leftVal, rightVal, palette }) {
  const ringMeshRefs = useRef([])

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.morphBase),
    roughness: 1,
    metalness: 0,
  }), [palette.morphBase])

  // Exhale pose: every ring flat on the horizontal (XZ) plane. Default
  // TorusGeometry lies in XY (normal +Z, per Gates* convention of never
  // rotating the torus), so -90deg about X lays it flat.
  const exhaleQuat = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    []
  )

  // Inhale pose per ring: fixed, chosen once at mount.
  const inhaleQuats = useMemo(() => {
    const quats = Array.from({ length: RING_COUNT }, () => new THREE.Quaternion())
    const outerIdx = RING_COUNT - 1
    const secondOuterIdx = RING_COUNT - 2
    quats[outerIdx].setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))   // normal -> X
    quats[secondOuterIdx].setFromEuler(new THREE.Euler(0, 0, 0))       // normal -> Z (default)
    for (let i = 0; i < RING_COUNT; i++) {
      if (i === outerIdx || i === secondOuterIdx) continue
      quats[i].setFromEuler(new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      ))
    }
    return quats
  }, [])

  // Per-ring wobble params, fixed once at mount.
  const ringParams = useMemo(() => Array.from({ length: RING_COUNT }, () => ({
    axis: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize(),
    freq: THREE.MathUtils.lerp(0.6, 1.4, Math.random()),
    phase: Math.random() * Math.PI * 2,
    amplitude: THREE.MathUtils.lerp(0.4, 0.9, Math.random()),
  })), [])

  // Reused scratch quaternions (avoid per-frame allocation).
  const scratch = useRef({ base: new THREE.Quaternion(), wobble: new THREE.Quaternion(), final: new THREE.Quaternion() })

  useFrame((state) => {
    const lv = THREE.MathUtils.smoothstep(leftVal.current, 0, 1)
    const rv = THREE.MathUtils.smoothstep(rightVal.current, 0, 1)
    const elapsed = state.clock.elapsedTime
    const wobbleStrength = Math.sin(Math.PI * lv)
    const { base, wobble, final } = scratch.current

    for (let i = 0; i < RING_COUNT; i++) {
      const mesh = ringMeshRefs.current[i]
      if (!mesh) continue
      const p = ringParams[i]
      base.slerpQuaternions(exhaleQuat, inhaleQuats[i], lv)
      const wobbleAngle = wobbleStrength * p.amplitude * Math.sin(elapsed * p.freq + p.phase)
      wobble.setFromAxisAngle(p.axis, wobbleAngle)
      final.multiplyQuaternions(base, wobble)
      mesh.quaternion.copy(final)
    }

    material.roughness = THREE.MathUtils.lerp(0.3, 1, rv)
  })

  return (
    <group position={[0, 0.25, 0]}>
      {RADII.map((r, i) => (
        <mesh key={i} ref={el => { ringMeshRefs.current[i] = el }}>
          <torusGeometry args={[r, TUBE, 16, 48]} />
          <primitive object={material} attach="material" />
        </mesh>
      ))}
    </group>
  )
}
