export const MODE_LABELS = {
  tutorial: 'Guided Breathing: Tutorial',
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
  basic: 'In this mode,\nyou can breathe\nat your own pace\nand use the audio\nand visual feedback\nto help focus.\n\nThe following tutorial will\nguide you into the mode.',
}

// Box Breathing and Slowing Down open with Tutorial-style screens (App.jsx,
// Continue button); slowingRecord is the step text while recording.
export const MODE_SCREENS = {
  box: 'Box Breathing Instructions\n\nBreathe through 4 phases,\n4 counts each:\ninhale, hold,\nexhale, hold.\n\nWhen it’s time to hold\nyou’ll hear a different bell.\n[[testBell]]\nKeep the sliders still\nduring each hold.',
  slowing1: 'Slowing Down Instructions\n\nPart 1:\nBreathe at your own pace\nfor a few breaths\nwhile the app records it.',
  slowingRecord: 'Breathe at your\nown pace.',
  slowing2: 'Part 2:\nSlowing down\n\nThe bells and visual cues\nwill begin at the\npace you recorded, then\nguide you to a slower pace\nover the next minute.\n\nKeep your breathing\nin sync with the bells\nand visual cues.',
}

// Guided Breathing: Tutorial mode (App.jsx, tutorialRef). The part* screens
// show at the top with a Continue button.
// A line holding only TEST_BELL_MARK is replaced by the Test Bell button (TutorialText insert).
export const TEST_BELL_MARK = '[[testBell]]'
export const TEST_BELL_LABEL = 'Test Bell'

export const TUTORIAL = {
  part1: 'Part 1:\nMove your thumbs\nas you breathe\nto transform the\nart and sound.',
  inhaleUp: 'Inhale,\nmove the sliders\nup.',
  exhaleDown: 'Exhale,\nmove the sliders\ndown.',
  gotIt: 'You got it!\nJust keep\nmoving the sliders\nas you breathe.',
  remember: 'Remember to\nmove the sliders\nwith your breath.',
  notice: 'Notice how your breathing controls the art and sound.',
  part2: 'Part 2:\nWith each breath,\nthe art will evolve.\n\nAfter 5 breaths,\nthe color and sound will change.\n\nBreathe 10 times and\nlook for these changes.',
  part3: 'Part 3:\nPacing your breath\n\nA bell will ring\nwhen it is time to inhale\nor exhale.\n[[testBell]]\nAbove and below the sliders,\n‘inhale’ and ‘exhale’\nwill glow.\n\nEach art option\nhas additional cues.',
  prepare: 'Relax and prepare to inhale.',
  countdown: ['3', '2', '1', 'Inhale'],   // the last word shows with the first paced Inhale (not in Box Breathing)
  done: 'Good job! The tutorial is done.\nKeep breathing, or\npress Home\nto try another mode, or\npress Restart\nto redo the tutorial.',
}

export const TEXTS = {
  gatesTimed:   'Fit Morph through the oncoming targets to pace your breath.',
  gatesTimedD:  'Adjust the pace of the targets with the slider on the left.',
  gatesTimedAmbient:  'Let the background\'s rhythm guide your pace as you breathe.',
  gatesTimedDAmbient: 'Adjust the pace of the rhythm with the slider on the left.',
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
  boxInhale:    'Inhale',
  boxHold:      'Hold',
  boxExhale:    'Exhale',
}
