import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { HALO_RING_Z, RING_Y, BASE_RADIUS, BASE_TUBE, GATE_SCALE } from './BackgroundRingsD'

const POOL_SIZE = 28
const SPAWN_Z = -6
const DESPAWN_Z = 6

const PULSE_RING_TUBE = 0.015   // thin line, ~1/4 of BASE_TUBE -- tune by eye
const INNER_EDGE_FACTOR = (BASE_RADIUS - BASE_TUBE) / BASE_RADIUS   // 0.94: the sparkle ring's own inner edge
const PULSE_RING_SCALE = GATE_SCALE.map(v => v * INNER_EDGE_FACTOR)
const TORUS_ARGS = [BASE_RADIUS, PULSE_RING_TUBE, 16, 64]

const PULSE_DURATION = 1.0   // seconds per pulse, one pulse per second of hold
const PULSE_ALPHA_MIN = 0.2
const PULSE_ALPHA_MAX = 0.3
const PULSE_EMISSIVE_MIN = 0.2
const PULSE_EMISSIVE_MAX = 1

const COUNT_RING_POOL_SIZE = 16      // generous cap; only the first numCountRings are ever shown
const COUNT_RING_X_SCALE_MULT = 2    // starts at 2x the count ring's own resting X scale

// A torus's inner/outer tube edges at any revolve angle theta are just
// scalar multiples of each other -- (R-tube)*(cos,sin) vs (R+tube)*(cos,sin)
// -- independent of theta, so this ratio survives the elliptical per-axis
// PULSE_RING_SCALE untouched (it cancels out identically on every axis).
// Scaling a ring's whole per-axis scale by this single factor therefore
// makes its inner edge land exactly on an unscaled ring's outer edge, at
// every angle around the ellipse -- no per-axis tuning needed.
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

function makeSlot() {
  return { z: 0, speed: 0, active: false, type: 'inhale', isLast: false, isFirst: false, hasTriggeredNext: false, hasTriggeredFirst: false, hasPreTriggeredLast: false }
}

// Shape D's Box Breathing gates: keeps GatesBoxBreathingC's exact pooled-slot timing
// simulation (so onFirstGate/onLastGate keep firing at the same instants, preserving
// App.jsx's tutorial text and breathPhaseRef behavior) but renders no traveling
// torus/sphere meshes. Instead, a second independent clock (below) tracks which of
// the 4 named box-breathing phases is active and pulses a single thin, inset ring
// during both Hold-in and Hold-out.
export default function GatesBoxBreathingD({ gatesEnabledRef, spawnIntervalRef, gateColor, emissiveColor, onFirstGate, onLastGate, boxPhaseRef, boxProgressRef }) {
  const slots = useRef(Array.from({ length: POOL_SIZE }, makeSlot))
  const wasEnabled = useRef(false)

  const totalElapsedRef = useRef(0)
  const ringMatRef = useRef()
  const ringMeshRef = useRef()
  const countRingsRef = useRef(Array.from({ length: COUNT_RING_POOL_SIZE }, () => ({ mesh: null, mat: null })))

  // Count rings need a per-fragment world-space Y fade (top/bottom taper,
  // symmetric about RING_Y) that plain meshStandardMaterial can't express,
  // so these are built by hand with an onBeforeCompile injection -- same
  // technique as the Fresnel glow in MorphA/MorphB -- rather than the JSX
  // <meshStandardMaterial> shorthand used elsewhere in this file.
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
    })
    mats.forEach((mat, i) => { countRingsRef.current[i].mat = mat })
    return mats
  }, [gateColor, emissiveColor])

  useFrame((_, delta) => {
    const ss = slots.current
    const enabled = gatesEnabledRef.current

    function spawnSeries(type) {
      const N = Math.max(1, Math.round(spawnIntervalRef.current))
      const speed = Math.abs(SPAWN_Z) / spawnIntervalRef.current
      const spacing = N > 1 ? Math.abs(SPAWN_Z) / (N - 1) : 0
      for (let i = 0; i < N; i++) {
        const spawnZ = SPAWN_Z - i * spacing
        const idx = ss.findIndex(s => !s.active)
        if (idx === -1) continue
        const s = ss[idx]
        s.z = spawnZ; s.speed = speed; s.active = true
        s.type = type; s.isLast = (i === N - 1); s.isFirst = (i === 0)
        s.hasTriggeredNext = false; s.hasTriggeredFirst = false; s.hasPreTriggeredLast = false
      }
    }

    if (!enabled) {
      wasEnabled.current = false
    }

    if (enabled) {
      if (!wasEnabled.current) {
        spawnSeries('inhale')
        totalElapsedRef.current = 0
      }
      wasEnabled.current = true

      for (let i = 0; i < POOL_SIZE; i++) {
        const s = ss[i]
        if (!s.active) continue

        s.z += s.speed * delta

        if (s.z > DESPAWN_Z) { s.active = false; continue }

        const leadZ = s.speed * 2
        if (s.z >= -leadZ && s.isFirst && !s.hasTriggeredFirst) {
          s.hasTriggeredFirst = true
          onFirstGate?.(s.type)
        }
        if (s.z >= -leadZ && s.isLast && !s.hasPreTriggeredLast) {
          s.hasPreTriggeredLast = true
          onLastGate?.(s.type)
        }
        if (s.z >= 0 && !s.hasTriggeredNext && s.isLast) {
          s.hasTriggeredNext = true
          spawnSeries(s.type === 'inhale' ? 'exhale' : 'inhale')
        }
      }

      // Independent, drift-free 4-phase clock: 0=Inhale(moving), 1=Hold-in,
      // 2=Exhale(moving), 3=Hold-out -- each exactly spawnIntervalRef.current seconds.
      totalElapsedRef.current += delta
      const interval = Math.max(0.05, spawnIntervalRef.current)
      const cycleT = totalElapsedRef.current % (4 * interval)
      const phaseIndex = Math.floor(cycleT / interval)
      const phaseElapsed = cycleT % interval

      const isHold = phaseIndex === 1 || phaseIndex === 3   // Hold-in or Hold-out
      const tInPulse = phaseElapsed % PULSE_DURATION
      const pulse = isHold ? pulseEnvelope(tInPulse) : 0

      // The last pulse of each hold ramps all the way down to 0 (instead of
      // back to PULSE_ALPHA_MIN/PULSE_EMISSIVE_MIN), so the ring fades out
      // cleanly right before the following movement phase's own ramp-up from
      // 0 begins. "Last" is whichever pulse is in progress right as the hold
      // ends, so this works for any hold length, not just ones that happen
      // to divide evenly by PULSE_DURATION.
      const pulseIndex = Math.floor(phaseElapsed / PULSE_DURATION)
      const lastPulseIndex = Math.floor((interval - 1e-4) / PULSE_DURATION)
      const isLastPulse = isHold && pulseIndex === lastPulseIndex
      // Safe to apply for the whole pulse (not just once past some ramp-in
      // window): at tInPulse=0 the envelope is already 1, so the floor has
      // zero weight in the lerp right at the step and only takes effect as
      // the ramp-down actually approaches it.
      const alphaFloor = isLastPulse ? 0 : PULSE_ALPHA_MIN
      const emissiveFloor = isLastPulse ? 0 : PULSE_EMISSIVE_MIN

      // Inhale/Exhale movement phases: ease alpha/emissive 0 -> PULSE_ALPHA_MIN/
      // PULSE_EMISSIVE_MIN across the phase, arriving at the hold's own baseline
      // exactly as the hold begins (no jump at the phase boundary).
      const moveRamp = isHold ? 1 : smoothstep(phaseElapsed / interval)

      if (ringMeshRef.current) ringMeshRef.current.visible = true
      if (ringMatRef.current) {
        ringMatRef.current.opacity = isHold
          ? lerp(alphaFloor, PULSE_ALPHA_MAX, pulse)
          : lerp(0, PULSE_ALPHA_MIN, moveRamp)
        ringMatRef.current.emissiveIntensity = isHold
          ? lerp(emissiveFloor, PULSE_EMISSIVE_MAX, pulse)
          : lerp(0, PULSE_EMISSIVE_MIN, moveRamp)
      }

      // Staggered "count" rings: one per second of the hold, each shrinking
      // from 2x width down to COUNT_RING_REST_SCALE (slightly larger than the
      // main ring's own PULSE_RING_SCALE, so its inner edge just touches the
      // main ring's outer edge -- see COUNT_RING_TOUCH_SCALE) while fading in
      // (0 -> PULSE_ALPHA_MIN) across the preceding Inhale/Exhale movement,
      // then disappearing exactly as the corresponding numbered pulse begins
      // in the following hold. `sideElapsed` runs continuously across a
      // movement phase and its following hold (cycleT itself never resets
      // mid-cycle), so subtracting `i` seconds gives each instance's own
      // local clock with no extra state needed.
      const numCountRings = Math.min(COUNT_RING_POOL_SIZE, Math.floor((interval - 1e-4) / PULSE_DURATION) + 1)
      const sideElapsed = phaseIndex < 2 ? cycleT : cycleT - 2 * interval
      for (let i = 0; i < COUNT_RING_POOL_SIZE; i++) {
        const slot = countRingsRef.current[i]
        if (!slot.mesh || !slot.mat) continue
        if (i >= numCountRings) { slot.mesh.visible = false; continue }
        const tLocal = sideElapsed - i
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

      // Clean, ground-truth phase/progress pair for RingParticlesD's Sparkle
      // system to consume in Box mode -- 'inhale' spans Inhale-movement +
      // Hold-in (progress ramps 0->1 across the movement, holds at 1 through
      // the hold), 'exhale' spans Exhale-movement + Hold-out (progress ramps
      // 1->0 across the movement, holds at 0 through the hold). Avoids the
      // startup artifact and BackgroundA-specific inversion baked into
      // breathPhaseRef/paceProgressRef.
      if (boxPhaseRef) boxPhaseRef.current = (phaseIndex === 0 || phaseIndex === 1) ? 'inhale' : 'exhale'
      if (boxProgressRef) {
        boxProgressRef.current =
          phaseIndex === 0 ? phaseElapsed / interval :
          phaseIndex === 1 ? 1 :
          phaseIndex === 2 ? 1 - phaseElapsed / interval :
          0
      }
    } else {
      if (ringMeshRef.current) ringMeshRef.current.visible = false
      for (let i = 0; i < COUNT_RING_POOL_SIZE; i++) {
        const slot = countRingsRef.current[i]
        if (slot.mesh) slot.mesh.visible = false
      }
      if (boxPhaseRef) boxPhaseRef.current = 'exhale'
      if (boxProgressRef) boxProgressRef.current = 0
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
