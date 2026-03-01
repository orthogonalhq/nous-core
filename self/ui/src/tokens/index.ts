/**
 * Design tokens — JS mirror of src/styles/tokens.css
 *
 * Keep in sync with tokens.css. CSS custom properties are the runtime
 * source of truth; this object is for TypeScript consumers that need
 * compile-time access to token values (e.g. canvas / SVG drawing code
 * that cannot use CSS variables).
 */
export const tokens = {
  colors: {
    bg:           '#1e1e1e',
    bgElevated:   '#252526',
    bgHover:      '#2a2d2e',
    bgInput:      '#3c3c3c',

    border:       '#3c3c3c',
    borderSubtle: '#2d2d2d',

    fg:           '#cccccc',
    fgMuted:      '#9d9d9d',
    fgDim:        '#858585',
    fgSubtle:     '#6a6a6a',

    accent:       '#007acc',
    accentHover:  '#1a85d0',
    selection:    '#094771',

    menuBg:       '#252526',
    menuBorder:   '#454545',
    menuHover:    '#094771',

    iconFolder:   '#dcb67a',
    chatUserBg:   '#264f78',
    closeBtnHover:'#e81123',

    state: {
      idle:          '#6a6a6a',
      active:        '#007acc',
      complete:      '#89d185',
      waiting:       '#cca700',
      blocked:       '#f14c4c',
      approved:      '#4dc9b0',
      needsRevision: '#bc8cff',
    },

    stateFill: {
      idle:          '#3c3c3c',
      active:        '#007acc',
      complete:      '#16825d',
      waiting:       '#6e5a00',
      blocked:       '#8b1a1a',
      approved:      '#0d6e5e',
      needsRevision: '#6b3d99',
    },
  },

  chrome: {
    titlebarHeight:  30,  // px
    statusbarHeight: 22,  // px
  },
} as const
