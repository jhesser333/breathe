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
  box: 'Box Breathing\nhas 4 steps:\ninhale, hold, exhale, hold\nfor 4 counts each.\n\nFollow the steps\nin this tutorial.\nYou will start\nBox Breathing\nat the end.',
  slowing: 'This mode will record\nthe pace of your\nbreathing and then\nhelp you slow down.\n\nThe following tutorial\nwill guide you into the\nSlowing Down Mode.',
  basic: 'In this mode,\nyou can breathe\nat your own pace\nand use the audio\nand visual feedback\nto help focus.\n\nThe following tutorial will\nguide you into the mode.',
}

// Guided Breathing: Tutorial mode (App.jsx, tutorialRef). The part* screens
// show at the top with a Continue button.
export const TUTORIAL = {
  part1: 'Part 1:\nControl the art and sound\nwith your breath.\n\nMove your thumbs\nwith every breath.',
  inhaleUp: 'Inhale and\nmove the sliders up.',
  exhaleDown: 'Exhale and\nmove the sliders down.',
  gotIt: 'You got it!\nJust keep\nmoving the sliders\nas you breathe.',
  tryOwn: 'Try it on your own\nfor a few breaths.',
  remember: 'Remember to\nmove the sliders\nwith your breath.',
  notice: 'Notice how your breathing controls the art and sound.',
  part2: 'Part 2:\nCounting\nyour breath.\n\nEvery breath,\nthe center art will change.\nEvery 5 breaths,\nthe art and sounds will change.\n\nBreathe in and out 10 times\nand notice these changes.',
  part3a: 'Part 3:\nGuided Breathing\n\nVisual and audio guides\nwill help you pace your breath.\n\nWhen it is time to inhale,\nyou will hear a bell.\nWhen it is time to exhale,\nyou will hear the same bell.',
  part3b: 'The text on the sliders\nwill also tell you\nwhen to inhale and exhale.\n\nIn addition, each art option\nhas its own visual cues.\n\nThis is the end of the tutorial.\nPress continue to start breathing.\nIf you want a review,\nuse the Restart button.',
  prepare: 'Relax and prepare to inhale.',
  countdown: ['3', '2', '1', 'Inhale'],
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
