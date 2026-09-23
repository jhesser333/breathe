import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HALO_RING_Z, RING_Y, BASE_RADIUS, BASE_TUBE, GATE_SCALE } from './BackgroundRingsD'

const PULSE_RING_TUBE = 0.015   // thin line, ~1/4 of BASE_TUBE -- tune by eye
const INNER_EDGE_FACTOR = (BASE_RADIUS - BASE_TUBE) / BASE_RADIUS   // 0.94: the sparkle ring's own inner edge
const PULSE_RING_SCALE = GATE_SCALE.map(v => v * INNER_EDGE_FACTOR)
const TORUS_ARGS = [BASE_RADIUS, PULSE_RING_TUBE, 16, 64]

const PULSE_DURATION = 1.0   // seconds per pulse, one pulse per second of the current phase
const PULSE_ALPHA_MIN = 0.2
const PULSE_ALPHA_MAX = 0.3
const PULSE_EMISSIVE_MIN = 0.2
const PULSE_EMISSIVE_MAX = 1

const COUNT_RING_POOL_SIZE = 16      // generous cap; only the first numCountRings are ever shown
const COUNT_RING_X_SCALE_MULT = 2    // starts at 2x the count ring's own resting X scale

const COUNT_RING_TOUCH_SCALE = (BASE_RADIUS + PULSE_RING_TUBE) / (BASE_RADIUS - PULSE_RING_TUBE)
const COUNT_RING_REST_SCALE = PULSE_RING_SCALE.map(v => v * COUNT_RING_TOUCH_SCALE)   // count rings' resting (touching) scale -- slightly larger than the main ring's own PULSE_RING_SCALE

// Fade start/end expressed as a fraction of the count ring's own middle-to-
// top/bottom distance (its outer Y extent), so they scale automatically with
// COUNT_RING_REST_SCALE/BASE_TUBE instead of being hand-picked absolute numbers.
const COUNT_RING_MAX_Y = COUNT_RING_REST_SCALE[1] * (BASE_RADIUS + BASE_TUBE)
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

// Slowing Down's Shape D pulse/hold ring + count rings, mirroring
// GatesBoxBreathingD's visual exactly but adapted to Slowing Down's 2-phase
// (Inhale/Exhale, no Hold) structure: rather than only pulsing during a
// discrete Hold sub-window, this treats the *entire* current phase like Box
// Breathing's Hold -- always running the per-second pulse math, using
// whichever of inhaleSecondsRef/exhaleSecondsRef is currently active as the
// phase length. A pulse fires the instant a phase starts (elapsed resets to
// 0 right on the Inhale<->Exhale transition) and keeps pulsing once per
// second for the rest of that phase, so a longer phase visibly produces
// more pulses/count rings than a shorter one.
export default function SlowingDownRingsD({ gatesEnabledRef, breathPhaseRef, inhaleSecondsRef, exhaleSecondsRef, gateColor, emissiveColor, livePaletteRef }) {
  const ringMatRef = useRef()
  const ringMeshRef = useRef()
  const countRingsRef = useRef(Array.from({ length: COUNT_RING_POOL_SIZE }, () => ({ mesh: null, mat: null })))

  const prevPhaseRef = useRef('exhale')
  const phaseElapsedRef = useRef(0)   // time since breathPhaseRef last changed

  // Count rings need a per-fragment world-space Y fade (top/bottom taper,
  // symmetric about RING_Y) that plain meshStandardMaterial can't express,
  // so these are built by hand with an onBeforeCompile injection -- same
  // technique as GatesBoxBreathingD.jsx.
  const countRingMaterials = useMemo(() => {
    const mats = Array.from({ length: COUNT_RING_POOL_SIZE }, () => {
      const mat = new THREE.MeshStandardMaterial({
        color: gateColor,
        emissive: emissiveColor,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        opacity: 0,
      })
      mat.customProgramCacheKey = () => 'slowing-count-ring-yfade'
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
    })
    mats.forEach((mat, i) => { countRingsRef.current[i].mat = mat })
    return mats
  }, [gateColor, emissiveColor])

  useFrame((_, delta) => {
    // Pull in the app-wide breath-count palette cycle (see App.jsx), if any --
    // kept in sync every frame regardless of enabled/disabled state.
    if (livePaletteRef && livePaletteRef.current) {
      const live = livePaletteRef.current
      if (ringMatRef.current) {
        ringMatRef.current.color.copy(live.secondary)
        ringMatRef.current.emissive.copy(live.primary)
      }
      countRingMaterials.forEach((mat) => {
        mat.color.copy(live.secondary)
        mat.emissive.copy(live.primary)
      })
    }

    const enabled = gatesEnabledRef?.current ?? false

    if (enabled) {
      const phase = breathPhaseRef?.current ?? 'exhale'
      if (phase !== prevPhaseRef.current) {
        prevPhaseRef.current = phase
        phaseElapsedRef.current = 0
      } else {
        phaseElapsedRef.current += delta
      }

      const rawInterval = phase === 'inhale' ? inhaleSecondsRef?.current : exhaleSecondsRef?.current
      const interval = Math.max(0.05, rawInterval ?? 5)
      const phaseElapsed = phaseElapsedRef.current

      const tInPulse = phaseElapsed % PULSE_DURATION
      const pulse = pulseEnvelope(tInPulse)

      // The last pulse of the phase ramps all the way down to 0 (instead of
      // back to PULSE_ALPHA_MIN/PULSE_EMISSIVE_MIN), so the ring fades out
      // cleanly right before the next phase's own pulse begins at 0.
      const pulseIndex = Math.floor(phaseElapsed / PULSE_DURATION)
      const lastPulseIndex = Math.floor((interval - 1e-4) / PULSE_DURATION)
      const isLastPulse = pulseIndex === lastPulseIndex
      const alphaFloor = isLastPulse ? 0 : PULSE_ALPHA_MIN
      const emissiveFloor = isLastPulse ? 0 : PULSE_EMISSIVE_MIN

      if (ringMeshRef.current) ringMeshRef.current.visible = true
      if (ringMatRef.current) {
        ringMatRef.current.opacity = lerp(alphaFloor, PULSE_ALPHA_MAX, pulse)
        ringMatRef.current.emissiveIntensity = lerp(emissiveFloor, PULSE_EMISSIVE_MAX, pulse)
      }

      // Staggered "count" rings: one per second of the current phase, each
      // shrinking from 2x width down to COUNT_RING_REST_SCALE while fading
      // in, then disappearing exactly as the corresponding numbered pulse
      // begins.
      const numCountRings = Math.min(COUNT_RING_POOL_SIZE, Math.floor((interval - 1e-4) / PULSE_DURATION) + 1)
      for (let i = 0; i < COUNT_RING_POOL_SIZE; i++) {
        const slot = countRingsRef.current[i]
        if (!slot.mesh || !slot.mat) continue
        if (i >= numCountRings) { slot.mesh.visible = false; continue }
        const tLocal = phaseElapsed - i
        if (tLocal < 0 || tLocal >= interval) {
          slot.mesh.visible = false
          slot.mat.opacity = 0
          slot.mat.emissiveIntensity = 0
        } else {
          const progress = smoothstep(tLocal / interval)
          slot.mesh.scale.set(
            lerp(COUNT_RING_REST_SCALE[0] * COUNT_RING_X_SCALE_MULT, COUNT_RING_REST_SCALE[0], progress),
            COUNT_RING_REST_SCALE[1],
            COUNT_RING_REST_SCALE[2]
          )
          slot.mat.emissiveIntensity = lerp(0, PULSE_EMISSIVE_MIN, progress)
          slot.mesh.visible = true
          slot.mat.opacity = lerp(0, PULSE_ALPHA_MIN, progress)
        }
      }
    } else {
      prevPhaseRef.current = 'exhale'
      phaseElapsedRef.current = 0
      if (ringMeshRef.current) ringMeshRef.current.visible = false
      for (let i = 0; i < COUNT_RING_POOL_SIZE; i++) {
        const slot = countRingsRef.current[i]
        if (slot.mesh) slot.mesh.visible = false
      }
    }
  })

  return (
    <>
      <mesh ref={ringMeshRef} position={[0, RING_Y, HALO_RING_Z]} scale={PULSE_RING_SCALE} visible={false} renderOrder={1}>
        <torusGeometry args={TORUS_ARGS} />
        <meshStandardMaterial ref={ringMatRef}
          color={gateColor} emissive={emissiveColor} transparent depthWrite={false} depthTest={false} opacity={0} />
      </mesh>
      {Array.from({ length: COUNT_RING_POOL_SIZE }).map((_, i) => (
        <mesh key={i}
          ref={(m) => { countRingsRef.current[i].mesh = m }}
          position={[0, RING_Y, HALO_RING_Z]}
          visible={false}
          renderOrder={1}
        >
          <torusGeometry args={TORUS_ARGS} />
          <primitive object={countRingMaterials[i]} attach="material" />
        </mesh>
      ))}
    </>
  )
}
