export const TARGET_PACES = {
  '5-5': { inhale: 5, exhale: 5, label: '5 seconds in, 5 seconds out' },
  '4-6': { inhale: 4, exhale: 6, label: '4 seconds in, 6 seconds out' },
}

export const DEFAULT_TARGET_PACE = '5-5'

// Box Breathing: each step (side of the box) is BOX_STEP_SECONDS long, split
// into BOX_COUNTS counts (targets, count rings, hold pulses).
export const BOX_STEP_SECONDS = 6
export const BOX_COUNTS = 4
