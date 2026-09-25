// Passcode gate (see PasscodeScreen.jsx). Asked on every page load/refresh.
//
// TO CHANGE THE CODE: edit PASSCODE below, then commit + push. Any 4
// characters (letters or digits); capitalization is ignored when checking.
// Note: this keeps casual visitors out, but the code is readable in the
// site's files -- it isn't real security.
export const PASSCODE = 'j333'

// Testing: when true, entering the code resets everyone to these settings,
// whatever they picked before. Set to false to go back to remembering each
// person's last choices.
export const RESET_ON_UNLOCK = true
export const TESTING_DEFAULTS = {
  selectedMode: 'box',     // Box Breathing
  shapeOption: 'd',        // Morphing Sphere that Disappears
  sliderLayout: 'diagonal',
  targetPace: '5-5',       // Slowing Down: 5 in, 5 out
}
