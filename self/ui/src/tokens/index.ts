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
    surface:      '#0b0b0b',
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
    fgOnColor:    '#ffffff',

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

  space: {
    '2xs': 2,
    xs:    4,
    sm:    6,
    md:    8,
    lg:   10,
    xl:   12,
    '2xl': 16,
    '3xl': 24,
    '4xl': 32,
  },

  fontSize: {
    '2xs':  9,
    xs:    11,
    sm:    12,
    base:  13,
    md:    14,
    lg:    16,
    xl:    20,
  },

  fontWeight: {
    regular:  400,
    medium:   500,
    semibold: 600,
  },

  lineHeight: {
    tight:   1,
    compact: 1.2,
    normal:  1.4,
  },

  radius: {
    xs: 2,
    sm: 3,
    md: 4,
    lg: 8,
    xl: 16,
  },

  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.3)',
    md: '0 2px 8px rgba(0,0,0,0.4)',
    lg: '0 4px 16px rgba(0,0,0,0.5)',
  },

  zIndex: {
    base:     0,
    dropdown: 100,
    overlay:  200,
    modal:    300,
    toast:    400,
  },

  duration: {
    micro:  100,
    fast:   150,
    normal: 200,
    slow:   300,
  },

  iconSize: {
    sm: 14,
    md: 16,
    lg: 20,
  },

  chrome: {
    titlebarHeight:    30,
    statusbarHeight:   22,
    titlebarBtnWidth:  46,
    dvTabHeight:       35,
    dvTabHeightNested: 28,
  },
} as const
