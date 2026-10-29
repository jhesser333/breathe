import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WINGSPAN, THICKNESS, LENGTH, ENGINE_R, ENGINE_LEN, ENGINE_X, SIDE_TILT_FULL_DEG, SIDE_RANGE } from './spaceshipJ'

// Shape J (Space Ship): the gray-box ship. SpaceshipBayJ runs the pace and
// writes shipStateRef each frame: { y, z, alpha, rev 0-1, rock 0-1, steer,
// emit 0-1, seq }. This draws it there: rev brightens the engines, rock sets
// how much it rocks side to side, emit sets the engine particle rate, steer
// lets phone side tilt move it left/right (only while it flies). Its
// rendered position goes to planePosRef for the cube targets' hit checks.

const BODY_EMISSIVE = 0.3
const ENGINE_EMISSIVE_MAX = 3
const REST_PITCH = -0.12        // slight nose-down, so the camera sees the top
const SIDE_TIME = 1.5           // seconds to (mostly) reach a new side position
const BANK_MAX = 0.6            // radians at BANK_FULL_SPEED sideways
const BANK_FULL_SPEED = 3
const BANK_SMOOTH_S = 0.15

// Rocking while it revs up: random-sized swings, scaled by rock.
const ROCK_MAX = 0.12
const ROCK_TIME_MIN = 0.9
const ROCK_TIME_MAX = 1.6

// Engine particles: emitted backward (toward the camera) from each engine.
const PARTICLE_POOL = 600
const EMIT_RATE = 150           // per second at emit 1 (all engines together)
const PARTICLE_SPEED = [0.6, 1.2]
const PARTICLE_SPREAD = 0.15
const PARTICLE_LIFE = [0.5, 1]
const PARTICLE_SIZE = 40
const SPAWN_SENTINEL = -1e4

const rand = (min, max) => min + Math.random() * (max - min)

// Eases (cosine) to a random target on the other side, then picks the next one.
function makeDrifter(min, max, timeMin, timeMax) {
  const d = { from: 0, to: rand(min, max), t: 0, dur: rand(timeMin, timeMax), sign: 1 }
  return (dt) => {
    d.t += dt
    if (d.t >= d.dur) {
      d.from = d.to
      d.sign = -d.sign
      d.to = d.sign * rand(min, max)
      d.t = 0
      d.dur = rand(timeMin, timeMax)
    }
    return d.from + (d.to - d.from) * (1 - Math.cos(Math.PI * d.t / d.dur)) / 2
  }
}

// Unity-style SmoothDamp: eases toward target; vel is { v }.
function smoothDamp(current, target, vel, smoothTime, dt) {
  const omega = 2 / smoothTime
  const x = omega * dt
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
  const change = current - target
  const temp = (vel.v + omega * change) * dt
  vel.v = (vel.v - omega * temp) * exp
  return target + (change + temp) * exp
}

const VERTEX_SHADER = `
attribute float aSpawnTime;
attribute float aLifetime;
attribute float aSeed;
attribute vec3 aVel;
uniform float uTime;
uniform float uSize;
varying float vAlpha;

void main() {
  float age = max(uTime - aSpawnTime, 0.0);
  float lifeT = clamp(age / aLifetime, 0.0, 1.0);
  float envelope = smoothstep(0.0, 0.1, lifeT) * (1.0 - smoothstep(0.5, 1.0, lifeT));
  vec3 p = position + aVel * age;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + 0.8 * aSeed) * envelope / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  vAlpha = envelope;
}
`

const FRAGMENT_SHADER = `
uniform vec3 uColor;
varying float vAlpha;

void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;
  gl_FragColor = vec4(uColor, vAlpha * smoothstep(0.5, 0.0, d));
}
`

export default function MorphJ({ palette, shipStateRef, planePosRef, livePaletteRef }) {
  const groupRef = useRef()
  const bodyMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: palette.tertiaryColor, emissive: palette.primaryColor, emissiveIntensity: BODY_EMISSIVE,
    roughness: 0.4, flatShading: true, transparent: true,
  }), [palette])
  const engineMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: palette.tertiaryColor, emissive: palette.primaryColor, emissiveIntensity: 0,
    roughness: 0.4, transparent: true,
  }), [palette])
  useEffect(() => () => { bodyMat.dispose(); engineMat.dispose() }, [bodyMat, engineMat])

  const bodyGeometry = useMemo(() => {
    const g = new THREE.ConeGeometry(0.5, 1, 4)
    g.rotateY(Math.PI / 4)   // square base edges along X/Y
    g.rotateX(-Math.PI / 2)  // tip toward -Z
    g.scale(WINGSPAN / 0.707, THICKNESS / 0.707, LENGTH)
    return g
  }, [])
  const engineGeometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(ENGINE_R, ENGINE_R, ENGINE_LEN, 16)
    g.rotateX(Math.PI / 2)   // along Z
    return g
  }, [])
  useEffect(() => () => { bodyGeometry.dispose(); engineGeometry.dispose() }, [bodyGeometry, engineGeometry])

  // Engine particles, in world space (outside the ship's group).
  const particles = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const position = new THREE.BufferAttribute(new Float32Array(PARTICLE_POOL * 3), 3).setUsage(THREE.DynamicDrawUsage)
    const vel = new THREE.BufferAttribute(new Float32Array(PARTICLE_POOL * 3), 3).setUsage(THREE.DynamicDrawUsage)
    const spawn = new THREE.BufferAttribute(new Float32Array(PARTICLE_POOL).fill(SPAWN_SENTINEL), 1).setUsage(THREE.DynamicDrawUsage)
    const life = new THREE.BufferAttribute(new Float32Array(PARTICLE_POOL).fill(1), 1).setUsage(THREE.DynamicDrawUsage)
    const seeds = new Float32Array(PARTICLE_POOL)
    for (let i = 0; i < PARTICLE_POOL; i++) seeds[i] = Math.random()
    geometry.setAttribute('position', position)
    geometry.setAttribute('aVel', vel)
    geometry.setAttribute('aSpawnTime', spawn)
    geometry.setAttribute('aLifetime', life)
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uSize: { value: PARTICLE_SIZE }, uColor: { value: new THREE.Color(palette.primaryColor) } },
      vertexShader: VERTEX_SHADER, fragmentShader: FRAGMENT_SHADER,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    return { geometry, material, position, vel, spawn, life, cursor: 0, carry: 0 }
  }, [palette])
  useEffect(() => () => { particles.geometry.dispose(); particles.material.dispose() }, [particles])

  const st = useRef({ x: 0, vx: { v: 0 }, bank: 0, seq: -1 })
  const gammaRef = useRef(0)
  const rock = useMemo(() => makeDrifter(ROCK_MAX * 0.5, ROCK_MAX, ROCK_TIME_MIN, ROCK_TIME_MAX), [])

  // Side tilt (motion access is asked for in the card tap and Start/Restart).
  useEffect(() => {
    const onTilt = (e) => { if (e.gamma !== null && e.gamma !== undefined) gammaRef.current = e.gamma }
    window.addEventListener('deviceorientation', onTilt)
    return () => window.removeEventListener('deviceorientation', onTilt)
  }, [])

  const _p = useMemo(() => new THREE.Vector3(), [])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = state.clock.elapsedTime
    const ship = shipStateRef.current
    const s = st.current
    const g = groupRef.current
    if (!g) return

    if (ship.seq !== s.seq) { s.seq = ship.seq; s.x = 0; s.vx.v = 0; s.bank = 0 }
    const tx = ship.steer ? THREE.MathUtils.clamp(gammaRef.current / SIDE_TILT_FULL_DEG, -1, 1) * SIDE_RANGE : 0
    s.x = smoothDamp(s.x, tx, s.vx, SIDE_TIME, dt)
    const bankTarget = -BANK_MAX * THREE.MathUtils.clamp(s.vx.v / BANK_FULL_SPEED, -1, 1)
    s.bank += (bankTarget - s.bank) * (1 - Math.exp(-dt / BANK_SMOOTH_S))

    g.visible = ship.alpha > 0.001
    g.position.set(s.x, ship.y, ship.z)
    g.rotation.set(REST_PITCH, 0, s.bank + rock(dt) * ship.rock)

    const live = livePaletteRef && livePaletteRef.current
    bodyMat.opacity = ship.alpha
    engineMat.opacity = ship.alpha
    engineMat.emissiveIntensity = ENGINE_EMISSIVE_MAX * ship.rev
    if (live) {
      bodyMat.color.copy(live.tertiary); bodyMat.emissive.copy(live.primary)
      engineMat.color.copy(live.tertiary); engineMat.emissive.copy(live.primary)
      particles.material.uniforms.uColor.value.copy(live.primary)
    }
    if (planePosRef) { planePosRef.current.x = s.x; planePosRef.current.y = ship.y; planePosRef.current.z = ship.z }

    // Engine particles.
    particles.material.uniforms.uTime.value = now
    particles.carry += EMIT_RATE * ship.emit * ship.alpha * dt
    if (particles.carry >= 1) {
      g.updateMatrixWorld()
      const { position, vel, spawn, life } = particles
      while (particles.carry >= 1) {
        particles.carry -= 1
        const i = particles.cursor++ % PARTICLE_POOL
        _p.set(ENGINE_X[Math.floor(Math.random() * ENGINE_X.length)] + rand(-ENGINE_R, ENGINE_R) * 0.5, rand(-ENGINE_R, ENGINE_R) * 0.5, LENGTH / 2 + ENGINE_LEN)
        g.localToWorld(_p)
        position.array.set([_p.x, _p.y, _p.z], i * 3)
        vel.array.set([rand(-PARTICLE_SPREAD, PARTICLE_SPREAD), rand(-PARTICLE_SPREAD, PARTICLE_SPREAD), rand(...PARTICLE_SPEED)], i * 3)
        spawn.array[i] = now
        life.array[i] = rand(...PARTICLE_LIFE)
      }
      position.needsUpdate = true; vel.needsUpdate = true; spawn.needsUpdate = true; life.needsUpdate = true
    }
  })

  return (
    <>
      <group ref={groupRef}>
        <mesh geometry={bodyGeometry} material={bodyMat} />
        {ENGINE_X.map((x) => (
          <mesh key={x} geometry={engineGeometry} material={engineMat} position={[x, 0, LENGTH / 2 + ENGINE_LEN / 2 - 0.05]} />
        ))}
      </group>
      <points geometry={particles.geometry} material={particles.material} frustumCulled={false} />
    </>
  )
}
