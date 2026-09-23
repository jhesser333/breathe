import { useRef, useMemo } from 'react'
import * as THREE from 'three'
import { HALO_RING_Z, RING_Y, BASE_RADIUS, BASE_TUBE, GATE_SCALE } from './BackgroundRingsD'

// Shape D's paced ring rig, shared by Box Breathing (GatesBoxBreathingD) and
// Slowing Down (SlowingDownPaceRingsD) so both modes play identical visuals:
//   - Pulse/Hold ring (inner): fades in across Inhale, pulses through Hold-in,
//     fades back out across Exhale, off during Hold-out.
//   - Pulse/Hold Exhale ring (outer): the mirror image -- fades in across
//     Exhale, pulses through Hold-out, fades out across Inhale, off during Hold-in.
//   - Count rings (thin, X-scaling): one per second of the hold, travelling
//     from the outer ring in to the inner ring on the Inhale side, and from
//     the inner ring out to the outer ring on the Exhale side.
// Exposed as a hook (not a child component) so the caller drives update()
// from inside its own useFrame -- avoids a one-frame lag between a parent's
// and a child's useFrame callbacks.

const PULSE_RING_TUBE = 0.015 * 3   // matches MorphC's breath-count ring tube thickness
const COUNT_RING_TUBE = PULSE_RING_TUBE / 2   // count rings: half the pulse rings' line weight
const INNER_EDGE_FACTOR = (BASE_RADIUS - BASE_TUBE) / BASE_RADIUS   // 0.94: the sparkle ring's own inner edge
const PULSE_RING_SCALE = GATE_SCALE.map(v => v * INNER_EDGE_FACTOR)
const PULSE_TORUS_ARGS = [BASE_RADIUS, PULSE_RING_TUBE, 16, 64]
const COUNT_TORUS_ARGS = [BASE_RADIUS, COUNT_RING_TUBE, 16, 64]

const PULSE_DURATION = 1.0   // seconds per pulse, one pulse per second of hold
const PULSE_ALPHA_MIN = 1      // hold pulse floor -- same as the end-of-movement level, so nothing jumps
const PULSE_ALPHA_MAX = 1
const PULSE_EMISSIVE_MIN = 1
const PULSE_EMISSIVE_MAX = 2
const PULSE_MOVE_ALPHA_TARGET = 1      // Inhale/Exhale: pulse rings' own alpha ramp target
const PULSE_MOVE_EMISSIVE_TARGET = 1   // Inhale/Exhale: pulse rings' own emissive-intensity ramp target

const COUNT_RING_ALPHA_TARGET = 0.2      // count rings fade 0 -> this across their travel
const COUNT_RING_EMISSIVE_TARGET = 0.2
const COUNT_RING_POOL_SIZE = 16      // generous cap; only the first numCountRings are ever shown
const COUNT_RING_X_SCALE_MULT = 2    // max X scale is 2x the count ring's own resting (min) X scale

// A torus's inner/outer tube edges at any revolve angle theta are just
// scalar multiples of each other -- (R-tube)*(cos,sin) vs (R+tube)*(cos,sin)
// -- independent of theta, so this ratio survives the elliptical per-axis
// scale untouched. Scaling a ring's whole per-axis scale by such a factor
// therefore makes one ring's inner edge land exactly on another's outer
// edge, at every angle around the ellipse -- no per-axis tuning needed.
// Count ring min: thin ring's inner edge touches the Pulse/Hold ring's outer edge.
const COUNT_RING_MIN_SCALE = PULSE_RING_SCALE.map(v => v * (BASE_RADIUS + PULSE_RING_TUBE) / (BASE_RADIUS - COUNT_RING_TUBE))
const COUNT_RING_MAX_X = COUNT_RING_MIN_SCALE[0] * COUNT_RING_X_SCALE_MULT
// Exhale ring: its inner edge lies on a max-X-scale count ring's outer edge.
const EXHALE_RING_SCALE = [COUNT_RING_MAX_X, COUNT_RING_MIN_SCALE[1], COUNT_RING_MIN_SCALE[2]]
  .map(v => v * (BASE_RADIUS + COUNT_RING_TUBE) / (BASE_RADIUS - PULSE_RING_TUBE))

// Fade start/end expressed as a fraction of the count ring's own middle-to-
// top/bottom distance (its outer Y extent), so they scale automatically with
// COUNT_RING_MIN_SCALE/BASE_TUBE instead of being hand-picked absolute numbers.
const COUNT_RING_MAX_Y = COUNT_RING_MIN_SCALE[1] * (BASE_RADIUS + BASE_TUBE)
const COUNT_RING_FADE_START_FRAC = 0.25   // fade begins 25% of the way from middle to top/bottom
const COUNT_RING_FADE_END_FRAC = 0.75     // opacity reaches 0 at 75% of the way from middle to top/bottom
const COUNT_RING_FADE_START_Y = COUNT_RING_MAX_Y * COUNT_RING_FADE_START_FRAC
const COUNT_RING_FADE_END_Y = COUNT_RING_MAX_Y * COUNT_RING_FADE_END_FRAC

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

// Immediate step up to peak at the start of each pulse, then a single eased
// ramp back down across the whole PULSE_DURATION (smoothstep is flat at both
// ends, so the descent itself still eases in and out).
function pulseEnvelope(tInPulse) {
  return 1 - smoothstep(tInPulse / PULSE_DURATION)
}

// Count rings and the Exhale ring need a per-fragment world-space Y fade
// (top/bottom taper, symmetric about RING_Y) that plain meshStandardMaterial
// can't express, so these are built by hand with an onBeforeCompile
// injection -- same technique as the Fresnel glow in MorphA/MorphB.
function makeYFadeMaterial(color, emissive) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    opacity: 0,
  })
  mat.customProgramCacheKey = () => 'count-ring-yfade'
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFadeCenterY = { value: RING_Y }
    shader.uniforms.uFadeStartY = { value: COUNT_RING_FADE_START_Y }
    shader.uniforms.uFadeEndY = { value: COUNT_RING_FADE_END_Y }

    shader.vertexShader = 'varying float vFadeWorldY;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vFadeWorldY = (modelMatrix * vec4(position, 1.0)).y;`
    )

    shader.fragmentShader =
      `varying float vFadeWorldY;
uniform float uFadeCenterY;
uniform float uFadeStartY;
uniform float uFadeEndY;\n` + shader.fragmentShader

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float distFromCenterY = abs(vFadeWorldY - uFadeCenterY);
        float yFade = 1.0 - smoothstep(uFadeStartY, uFadeEndY, distFromCenterY);
        diffuseColor.a *= yFade;
      }`
    )
  }
  return mat
}

export function usePaceRings({ gateColor, emissiveColor }) {
  const ringMatRef = useRef()
  const ringMeshRef = useRef()
  const exhaleMeshRef = useRef()
  const countMeshesRef = useRef(Array(COUNT_RING_POOL_SIZE).fill(null))

  const exhaleMat = useMemo(() => makeYFadeMaterial(gateColor, emissiveColor), [gateColor, emissiveColor])
  const countMats = useMemo(
    () => Array.from({ length: COUNT_RING_POOL_SIZE }, () => makeYFadeMaterial(gateColor, emissiveColor)),
    [gateColor, emissiveColor]
  )

  // side: 'inhale' (Inhale movement + Hold-in) or 'exhale' (Exhale movement
  // + Hold-out). sideElapsed runs continuously across the movement and the
  // hold that follows it. holdDuration 0 = no hold (Slowing Down).
  function update({ enabled, side, sideElapsed, moveDuration, holdDuration, numCountRings, live }) {
    const inner = ringMatRef.current
    if (live) {
      if (inner) { inner.color.copy(live.secondary); inner.emissive.copy(live.primary) }
      exhaleMat.color.copy(live.secondary); exhaleMat.emissive.copy(live.primary)
      countMats.forEach((mat) => { mat.color.copy(live.secondary); mat.emissive.copy(live.primary) })
    }

    if (!enabled) {
      if (ringMeshRef.current) ringMeshRef.current.visible = false
      if (exhaleMeshRef.current) exhaleMeshRef.current.visible = false
      countMeshesRef.current.forEach((m) => { if (m) m.visible = false })
      return
    }

    const move = Math.max(0.05, moveDuration)
    const inHold = holdDuration > 0 && sideElapsed >= move
    const moveT = smoothstep(sideElapsed / move)
    const pulse = inHold ? pulseEnvelope((sideElapsed - move) % PULSE_DURATION) : 0

    // "Own" ring = the one whose side this is (inner on Inhale, outer on
    // Exhale): ramps 0 -> target across the movement, then pulses through the
    // hold. "Other" ring ramps target -> 0 across the movement (the own
    // curve reversed), then stays off through the hold.
    const ownAlpha = inHold ? lerp(PULSE_ALPHA_MIN, PULSE_ALPHA_MAX, pulse) : lerp(0, PULSE_MOVE_ALPHA_TARGET, moveT)
    const ownEmissive = inHold ? lerp(PULSE_EMISSIVE_MIN, PULSE_EMISSIVE_MAX, pulse) : lerp(0, PULSE_MOVE_EMISSIVE_TARGET, moveT)
    const otherAlpha = inHold ? 0 : lerp(PULSE_MOVE_ALPHA_TARGET, 0, moveT)
    const otherEmissive = inHold ? 0 : lerp(PULSE_MOVE_EMISSIVE_TARGET, 0, moveT)

    const innerIsOwn = side === 'inhale'
    if (ringMeshRef.current) ringMeshRef.current.visible = true
    if (exhaleMeshRef.current) exhaleMeshRef.current.visible = true
    if (inner) {
      inner.opacity = innerIsOwn ? ownAlpha : otherAlpha
      inner.emissiveIntensity = innerIsOwn ? ownEmissive : otherEmissive
      if (live && innerIsOwn && inHold) inner.color.copy(live.primary)
    }
    exhaleMat.opacity = innerIsOwn ? otherAlpha : ownAlpha
    exhaleMat.emissiveIntensity = innerIsOwn ? otherEmissive : ownEmissive
    if (live && !innerIsOwn && inHold) exhaleMat.color.copy(live.primary)

    // Staggered count rings: instance i starts i seconds into the side and
    // travels for one movement's length -- inward (max X -> min X) on the
    // Inhale side, outward (min X -> max X) on the Exhale side -- fading in
    // as it goes, then disappearing as it reaches the destination ring.
    const count = Math.min(COUNT_RING_POOL_SIZE, numCountRings)
    for (let i = 0; i < COUNT_RING_POOL_SIZE; i++) {
      const mesh = countMeshesRef.current[i]
      const mat = countMats[i]
      if (!mesh) continue
      const tLocal = sideElapsed - i
      if (i >= count || tLocal < 0 || tLocal >= move) {
        mesh.visible = false
        mat.opacity = 0
        mat.emissiveIntensity = 0
        continue
      }
      const progress = smoothstep(tLocal / move)
      const x = innerIsOwn
        ? lerp(COUNT_RING_MAX_X, COUNT_RING_MIN_SCALE[0], progress)
        : lerp(COUNT_RING_MIN_SCALE[0], COUNT_RING_MAX_X, progress)
      mesh.scale.set(x, COUNT_RING_MIN_SCALE[1], COUNT_RING_MIN_SCALE[2])
      mat.opacity = lerp(0, COUNT_RING_ALPHA_TARGET, progress)
      mat.emissiveIntensity = lerp(0, COUNT_RING_EMISSIVE_TARGET, progress)
      mesh.visible = true
    }
  }

  const elements = (
    <>
      <mesh ref={ringMeshRef} position={[0, RING_Y, HALO_RING_Z]} scale={PULSE_RING_SCALE} visible={false} renderOrder={1}>
        <torusGeometry args={PULSE_TORUS_ARGS} />
        <meshStandardMaterial ref={ringMatRef}
          color={gateColor} emissive={emissiveColor} transparent depthWrite={false} depthTest={false} opacity={0} />
      </mesh>
      <mesh ref={exhaleMeshRef} position={[0, RING_Y, HALO_RING_Z]} scale={EXHALE_RING_SCALE} visible={false} renderOrder={1}>
        <torusGeometry args={PULSE_TORUS_ARGS} />
        <primitive object={exhaleMat} attach="material" />
      </mesh>
      {countMats.map((mat, i) => (
        <mesh key={i}
          ref={(m) => { countMeshesRef.current[i] = m }}
          position={[0, RING_Y, HALO_RING_Z]}
          visible={false}
          renderOrder={1}
        >
          <torusGeometry args={COUNT_TORUS_ARGS} />
          <primitive object={mat} attach="material" />
        </mesh>
      ))}
    </>
  )

  return { elements, update }
}
