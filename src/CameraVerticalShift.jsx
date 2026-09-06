import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Shift-lens-style vertical crop: renders a taller virtual frame than the
// visible viewport and displays only a sub-window of it, offset downward.
// This re-centers the frustum's angular window lower (less sky, more ground)
// without rotating the camera or moving anything in world space -- the
// horizon/ground plane and everything on it (Morph, reference cube, etc.)
// simply appears higher in the cropped frame, exactly like a camera rise
// movement in architectural photography.
const EXTRA_HEIGHT_FRACTION = 0.6  // how much taller the virtual frame is than the viewport; more headroom allows a bigger shift but narrows the effective FOV shown
const SHIFT_FRACTION = 0.8         // how much of that headroom to use (0 = centered/no shift, 1 = maximum downward crop)

export default function CameraVerticalShift() {
  const { camera, size } = useThree()

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return
    const fullHeight = size.height * (1 + EXTRA_HEIGHT_FRACTION)
    const extra = fullHeight - size.height
    const yOffset = extra * SHIFT_FRACTION
    camera.setViewOffset(size.width, fullHeight, 0, yOffset, size.width, size.height)
    camera.updateProjectionMatrix()
    return () => {
      camera.clearViewOffset()
      camera.updateProjectionMatrix()
    }
  }, [camera, size])

  return null
}
