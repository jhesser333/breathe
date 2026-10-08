export const MODE_LABELS = {
  basic: 'Breathe at Your Own Pace',
  timed: 'Paced Breathing',
  slowing: 'Guided Breathing: Slowing Down',
  box: 'Guided Breathing: Box Breathing',
}

export const TEXT_A = 'Move the sliders\nin opposite directions\nwith your thumbs'
export const TEXT_B = 'The transforming object is named Morph.\nSync your breathing to Morph.'

export const TEXT_A1_DIAGONAL = 'Inhale and move the sliders up.'
export const TEXT_A2_DIAGONAL = 'Exhale and move the sliders down.'
export const TEXT_B1_DIAGONAL = 'Moving fingers with your breath is the core interaction in this app.'
export const TEXT_B2_DIAGONAL = 'Notice how your breathing controls the art and sound.'
// Last slider step (both layouts), right before the 5-breath count starts.
export const TEXT_B3 = 'Now the art will change with each breath.'

// Shown for MODE_INTRO_MS at the start of each mode, before its tutorial.
export const MODE_INTRO = {
  box: 'Box Breathing has 4 steps:\ninhale, hold, exhale, hold\nfor 4 count each.\n\nFollow the steps in this tutorial.\nYou will start Box Breathing at the end.',
  slowing: 'This mode will record the pace of your breathing and then help you slow it down.\n\nThe following tutorial will guide you into the Slowing Down Mode.',
  basic: 'In this mode, you can breathe at your own pace and use the audio and visual feedback to help you focus.\n\nThe following tutorial will guide you into the mode.',
}

export const TEXTS = {
  gatesTimed:   'Fit Morph through the oncoming targets to pace your breath.',
  gatesTimedD:  'Adjust the pace of the targets with the slider on the left.',
  gatesTimedAmbient:  'Let the background\'s rhythm guide your pace as you breathe.',
  gatesTimedDAmbient: 'Adjust the pace of the rhythm with the slider on the left.',
  gatesSlowing: 'Breathe at your own pace for a few breaths.',
  slowingTextD: 'Good Job! The oncoming targets will begin at your pace and slow down over the next minute.',
  slowingTextE: 'Keep Morph aligned with the targets to slow down your breathing.',
  slowingTextDAmbient: 'You will soon see art animate at the rate you recorded.',
  slowingTextEAmbient: 'Keep your breathing in sync with the art as it slows down.',
  // Shape B (Morphing Cube) versions of the two lines above -- its targets are visible.
  slowingTextDCube: 'Gates will soon move in at the rate you recorded. Breathe so the art fits through the gates.',
  slowingTextECube: 'Keep your breathing in sync with the gates as they move farther apart.',
  // 5-breath count tutorial (all modes, the two user-paced cycles after the intro).
  countEachBreath: 'Notice how the art changed.',
  countColors:     'These changes help count breaths.',
  countResets:     'After 5 breaths, the counting resets. The colors and sounds will change.',
  countNewCycle:   'This is a new 5-breath cycle.',
  boxCountSoon:    'Box Breathing cues will appear after this cycle.',
  boxCountPace:    'Follow these cues to inhale, hold, exhale and hold.',
  boxCountTwoMore: 'The cues are about to start.',
  // Slowing Down's count-tutorial texts 2-3 (all art options).
  slowingCuesSoon: 'You will soon see cues at the rate you recorded.',
  slowingCuesSync: 'Keep your breathing in sync with the cues as they slow down.',
  boxInhale:    'Inhale',
  boxHold:      'Hold',
  boxExhale:    'Exhale',
}
