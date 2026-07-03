import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'

const POOL_SIZE = 28
const SPAWN_Z = -20
const DESPAWN_Z = 6
const GATE_Y = 0.25
const FADE_DURATION = 1.0

const TORUS_ARGS = [1.0, 0.06, 16, 64]
const GATE_SCALE = [1.376, 1.955, 1]
const SPHERE_RADIUS = 0.25
const SPHERE_ARGS = [SPHERE_RADIUS, 16, 8]

const TIES_PER_SEGMENT = 6
const LERP_SEGMENTS_MAX = 14
const TIE_ALPHA = 0.15
const TIE_GAP = 0.1
const TIE_HEIGHT_Y = 0.02
const TIE_DEPTH_Z = 0.03
const TIE_RADIUS = 0.005
const TIE_SPACING = Math.abs(SPAWN_Z) / TIES_PER_SEGMENT
const BASE_INNER = 1.0 - 0.06
const GATE_INNER_HALF_X = BASE_INNER * GATE_SCALE[0]
const TIE_WIDTH_X = 2 * (GATE_INNER_HALF_X - TIE_GAP)
const TIE_ARGS = [TIE_WIDTH_X, TIE_HEIGHT_Y, TIE_DEPTH_Z]

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

function calcEmissive(z) {
  if (z < -3) return 0
  if (z < -0.5) return smoothstep((z + 3) / 2.5)
  if (z < 0) return 1 + smoothstep((z + 0.5) / 0.5)
  return 2
}

function makeSlot() {
  return { z: 0, speed: 0, active: false, type: 'inhale', isLast: false, fadeElapsed: 0, hasTriggeredNext: false }
}
function createTieMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.5, metalness: 0.1,
    transparent: true, opacity: 0, depthWrite: false,
  })
}
function makeTieRefArray() {
  return Array.from({ length: TIES_PER_SEGMENT }, () => null)
}

export default function GatesBoxBreathingC({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const wasEnabled = useRef(false)

  const gateGroupRefs = useRef([])
  const torusMeshRefs = useRef([]);  const torusMatRefs = useRef([])
  const sphereMeshRefs = useRef([]); const sphereMatRefs = useRef([])

  const previewMaterials = useMemo(() => Array.from({ length: TIES_PER_SEGMENT }, () => createTieMaterial(gateColor)), [gateColor])
  const previewRefs = useRef(makeTieRefArray())
  const trailingMaterials = useMemo(() => Array.from({ length: TIES_PER_SEGMENT }, () => createTieMaterial(gateColor)), [gateColor])
  const trailingRefs = useRef(makeTieRefArray())
  const lerpMaterials = useMemo(() => Array.from({ length: LERP_SEGMENTS_MAX }, () => Array.from({ length: TIES_PER_SEGMENT }, () => createTieMaterial(gateColor))), [gateColor])
  const lerpRefs = useRef(Array.from({ length: LERP_SEGMENTS_MAX }, makeTieRefArray))
  const checkpoints = useRef([])
  const preSeedRef = useRef({ elapsed: 0, needsInitial: true })

  useFrame((_, delta) => {
    const ss = slots.current
    const enabled = gatesEnabledRef.current

    function spawnSeries(type) {
      const N = Math.max(1, Math.round(spawnIntervalRef.current))
      const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      const spacing = N > 1 ? Math.abs(SPAWN_Z) / (N - 1) : 0
      for (let i = 0; i < N; i++) {
        const spawnZ = SPAWN_Z - i * spacing
        checkpoints.current.push({ z: spawnZ, speed, fadeElapsed: 0 })
        const idx = ss.findIndex(s => !s.active)
        if (idx === -1) continue
        const s = ss[idx]
        s.z = spawnZ; s.speed = speed; s.active = true
        s.type = type; s.isLast = (i === N - 1)
        s.fadeElapsed = 0; s.hasTriggeredNext = false
      }
    }

    if (!enabled) {
      const pre = preSeedRef.current
      if (pre.needsInitial) {
        pre.needsInitial = false
        const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
        checkpoints.current.push({ z: SPAWN_Z, speed, fadeElapsed: 0 })
      } else {
        pre.elapsed += delta
        if (pre.elapsed >= spawnIntervalRef.current) {
          pre.elapsed -= spawnIntervalRef.current
          const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
          checkpoints.current.push({ z: SPAWN_Z, speed, fadeElapsed: 0 })
        }
      }
      wasEnabled.current = false
    }

    if (enabled) {
      if (!wasEnabled.current) {
        checkpoints.current = []
        spawnSeries('inhale')
      }
      wasEnabled.current = true

      for (let i = 0; i < POOL_SIZE; i++) {
        const s = ss[i]
        const g = gateGroupRefs.current[i]
        if (!g) continue

        if (!s.active) { g.position.z = 1000; continue }

        s.z += s.speed * delta
        s.fadeElapsed += delta

        if (s.z > DESPAWN_Z) { s.active = false; g.position.z = 1000; continue }

        if (s.z >= 0 && !s.hasTriggeredNext && s.isLast) {
          s.hasTriggeredNext = true
          spawnSeries(s.type === 'inhale' ? 'exhale' : 'inhale')
        }

        const fadeIn = smoothstep(Math.min(s.fadeElapsed / FADE_DURATION, 1))
        const fadeOut = s.z > 0 ? 1 - smoothstep(Math.min(s.z / 2, 1)) : 1
        const opacity = fadeIn * fadeOut
        const emissive = calcEmissive(s.z)
        const isInhale = s.type === 'inhale'

        g.position.z = s.z

        const tm = torusMeshRefs.current[i], tmat = torusMatRefs.current[i]
        const sm = sphereMeshRefs.current[i], smat = sphereMatRefs.current[i]

        if (tm) tm.visible = isInhale
        if (sm) sm.visible = !isInhale

        if (isInhale) {
          if (tmat) { tmat.opacity = opacity; tmat.emissiveIntensity = emissive }
        } else {
          if (smat) { smat.opacity = opacity; smat.emissiveIntensity = emissive }
        }
      }
    }

    // Ties — run regardless of enabled state
    checkpoints.current.forEach(cp => { cp.z += cp.speed * delta; cp.fadeElapsed += delta })
    checkpoints.current = checkpoints.current.filter(cp => cp.z <= DESPAWN_Z)
    checkpoints.current.sort((a, b) => a.z - b.z)

    const cps = checkpoints.current
    const frontmost = cps[0]
    const backmost = cps[cps.length - 1]

    for (let i = 0; i < TIES_PER_SEGMENT; i++) {
      const mesh = previewRefs.current[i]
      if (!mesh) continue
      if (!frontmost) { mesh.visible = false; continue }
      mesh.position.z = frontmost.z - i * TIE_SPACING
      mesh.visible = true
      previewMaterials[i].opacity = TIE_ALPHA * smoothstep(Math.min(frontmost.fadeElapsed / FADE_DURATION, 1))
    }

    const trailingStart = cps.length <= 1 ? 1 : 0
    for (let i = 0; i < TIES_PER_SEGMENT; i++) {
      const mesh = trailingRefs.current[i]
      if (!mesh) continue
      const z = backmost ? backmost.z + i * TIE_SPACING : 0
      if (!backmost || i < trailingStart || z > DESPAWN_Z) { mesh.visible = false; continue }
      mesh.position.z = z
      mesh.visible = true
      trailingMaterials[i].opacity = TIE_ALPHA * smoothstep(Math.min(backmost.fadeElapsed / FADE_DURATION, 1))
    }

    for (let s = 0; s < LERP_SEGMENTS_MAX; s++) {
      const a = cps[s], b = cps[s + 1]
      const depth = a && b ? b.z - a.z : 0
      const fadeIn = a && b ? Math.min(
        smoothstep(Math.min(a.fadeElapsed / FADE_DURATION, 1)),
        smoothstep(Math.min(b.fadeElapsed / FADE_DURATION, 1))
      ) : 0
      for (let i = 0; i < TIES_PER_SEGMENT; i++) {
        const mesh = lerpRefs.current[s][i]
        if (!mesh) continue
        if (!a || !b) { mesh.visible = false; continue }
        mesh.position.z = a.z + (i / TIES_PER_SEGMENT) * depth
        mesh.visible = true
        lerpMaterials[s][i].opacity = TIE_ALPHA * fadeIn
      }
    }
  })

  return (
    <>
      {Array.from({ length: POOL_SIZE }).map((_, i) => (
        <group key={i} ref={el => { gateGroupRefs.current[i] = el }}>
          <mesh ref={el => { torusMeshRefs.current[i] = el }} position={[0, GATE_Y, 0]}
            scale={[GATE_SCALE[0], GATE_SCALE[1], 1]} visible={false}>
            <torusGeometry args={TORUS_ARGS} />
            <meshStandardMaterial ref={el => { torusMatRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} transparent depthWrite={false} opacity={0} />
          </mesh>
          <mesh ref={el => { sphereMeshRefs.current[i] = el }} position={[0, GATE_Y, 0]} visible={false}>
            <sphereGeometry args={SPHERE_ARGS} />
            <meshStandardMaterial ref={el => { sphereMatRefs.current[i] = el }}
              color={gateColor} emissive={emissiveColor} transparent depthWrite={false} opacity={0} />
          </mesh>
        </group>
      ))}
      {Array.from({ length: TIES_PER_SEGMENT }, (_, i) => (
        <RoundedBox key={`preview-${i}`} ref={el => { previewRefs.current[i] = el }}
          position={[0, GATE_Y, 0]} args={TIE_ARGS} radius={TIE_RADIUS} smoothness={2} visible={false}>
          <primitive object={previewMaterials[i]} attach="material" />
        </RoundedBox>
      ))}
      {Array.from({ length: TIES_PER_SEGMENT }, (_, i) => (
        <RoundedBox key={`trailing-${i}`} ref={el => { trailingRefs.current[i] = el }}
          position={[0, GATE_Y, 0]} args={TIE_ARGS} radius={TIE_RADIUS} smoothness={2} visible={false}>
          <primitive object={trailingMaterials[i]} attach="material" />
        </RoundedBox>
      ))}
      {Array.from({ length: LERP_SEGMENTS_MAX }, (_, s) =>
        Array.from({ length: TIES_PER_SEGMENT }, (_, i) => (
          <RoundedBox key={`lerp-${s}-${i}`} ref={el => { lerpRefs.current[s][i] = el }}
            position={[0, GATE_Y, 0]} args={TIE_ARGS} radius={TIE_RADIUS} smoothness={2} visible={false}>
            <primitive object={lerpMaterials[s][i]} attach="material" />
          </RoundedBox>
        ))
      )}
    </>
  )
}
