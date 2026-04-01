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
    bgBase:       '#000000',
    bgSurface:    '#0A0A0A',
    bgElevated:   '#141414',
    bgHover:      '#1A1A1A',
    bgActive:     '#222222',
    bgInput:      '#0F0F0F',

    border:       '#1A1A1A',
    borderStrong: '#2A2A2A',
    borderSubtle: '#2d2d2d',

    fg:           '#cccccc',
    fgMuted:      '#9d9d9d',
    fgDim:        '#858585',
    fgSubtle:     '#6a6a6a',
    textPrimary:   'rgba(255,255,255,0.95)',
    textSecondary: 'rgba(255,255,255,0.60)',
    textTertiary:  'rgba(255,255,255,0.35)',
    textGhost:     'rgba(255,255,255,0.12)',

    accent:       '#007acc',
    accentHover:  '#1a85d0',
    accentMuted:  'rgba(0,122,204,0.16)',
    selection:    '#094771',

    menuBg:       '#252526',
    menuBorder:   '#454545',
    menuHover:    '#094771',

    iconFolder:   '#dcb67a',
    chatUserBg:   '#264f78',
    closeBtnHover:'#e81123',
    fgOnColor:    '#ffffff',

    alert: {
      critical: '#FF2D55',
      error:    '#FF453A',
      warning:  '#FFD60A',
      info:     '#64B5F6',
      success:  '#32D74B',
    },

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

    /** Canvas / workflow builder — keep in sync with tokens.css */
    canvas: {
      bg:            '#0a0a0a',
      gridDot:       '#1a1a1a',
      selectionRing: '#007acc',
      minimapBg:     '#0f0f0f',
      minimapNode:   '#2a2a2a',
    },

    node: {
      trigger:    '#e06c75',
      agent:      '#61afef',
      condition:  '#e5c07b',
      app:        '#c678dd',
      tool:       '#56b6c2',
      memory:     '#98c379',
      governance: '#d19a66',
    },

    edge: {
      execution: '#abb2bf',
      config:    '#5c6370',
    },

    /** Canvas floating panels — keep in sync with tokens.css */
    panel: {
      bg:         '#141414',
      border:     '#2a2a2a',
      shadow:     '0 4px 12px rgba(0,0,0,0.5)',
      headerBg:   '#1a1a1a',
      headerText: '#fafafa',
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
    xs: 4,
    sm: 6,
    md: 8,
    lg: 12,
    xl: 16,
  },

  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.3)',
    md: '0 4px 12px rgba(0,0,0,0.4)',
    lg: '0 8px 24px rgba(0,0,0,0.5)',
  },

  blur: {
    sm: 8,
    md: 16,
    lg: 24,
  },

  zIndex: {
    base:     0,
    dropdown: 100,
    overlay:  200,
    modal:    300,
    toast:    400,
  },

  duration: {
    instant: 50,
    micro:  100,
    fast:   100,
    normal: 200,
    slow:   300,
    ambient: 2000,
  },

  easing: {
    out: 'cubic-bezier(0.0, 0, 0.2, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    snap: 'cubic-bezier(0, 0, 0.2, 1)',
  },

  scale: {
    press: 0.98,
    lift: 1.02,
  },

  distance: {
    shake: 2,
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

  shell: {
    railWidth: 72,
    railWidthCollapsed: 56,
    chatColumnWidth: 320,
    observeColumnWidth: 280,
    columnDividerWidth: 1,
    simpleShell: {
      projectRailWidth: 48,
      assetSidebarDefaultWidth: 320,
      assetSidebarMinWidth: 240,
      observeDefaultWidth: 20,
      observeExpandedWidth: 280,
      observeMinWidth: 20,
    },
  },

  breakpoint: {
    shellFull: 1400,
    shellMedium: 1100,
    shellNarrow: 800,
  },
} as const
