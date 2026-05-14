import { useRef, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import Morph from './Morph'
import Sliders from './Sliders'

export default function App() {
  const leftVal = useRef(0)
  const rightVal = useRef(0)

  const setLeft = useCallback((v) => { leftVal.current = v }, [])
  const setRight = useCallback((v) => { rightVal.current = v }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [0, 4, 4], fov: 50 }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <color attach="background" args={['#111111']} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Morph leftVal={leftVal} rightVal={rightVal} />
      </Canvas>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'auto' }}>
          <Sliders onLeft={setLeft} onRight={setRight} />
        </div>
      </div>
    </div>
  )
}
