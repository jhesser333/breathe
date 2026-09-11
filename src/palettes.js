export const PALETTES = {
  // Kept in storage but unreachable (no picker) -- active palette before the
  // Teal Palette, may return behind a future Color Options screen.
  a: {
    tertiaryColor: '#0a0a6e',
    primaryColor: '#ff69b4',
    secondaryColor: '#9955dd',
    background: '#1a1028',
    textColor: '#fbeedd',
    headerColor: '#ff69b4',
    subheaderColor: '#fbeedd',
  },
  b: {
    tertiaryColor: '#03455e',
    primaryColor: '#12ffdb',
    secondaryColor: '#5e4972',
    background: '#002748',
    textColor: '#fbeedd',
    headerColor: '#ff69b4',
    subheaderColor: '#fbeedd',
  },
  // Active palette -- locked in for all users, see App.jsx.
  teal: {
    tertiaryColor: '#276d8c',
    primaryColor: '#8db1a1',
    secondaryColor: '#0f3261',
    background: '#1a1a3a',
    textColor: '#c2dafb',
    headerColor: '#8db1a1',
    subheaderColor: '#c2dafb',
  },
}
