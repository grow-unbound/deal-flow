// DealFlow Design System — Ember & Cream token definitions.
// Source of truth for all color, typography, spacing, and shadow values.
// These are consumed by tailwind.config.ts as the single authoritative reference.

export const colors = {
  cream: {
    50:  '#FDFBF7',
    100: '#FAF7F2',
    200: '#F4EFE6',
    300: '#EFE9DF',
    400: '#E2D9C9',
    500: '#C9BFAC',
    600: '#A89E89',
    700: '#6B6760',
    800: '#3D3A35',
    900: '#1A1A1A',
  },
  teal: {
    50:  '#EAF1EE',
    100: '#C6DAD3',
    200: '#95B9AE',
    300: '#5D8E81',
    400: '#346A5C',
    500: '#1F3A34',
    600: '#1A322D',
    700: '#142823',
    800: '#0E1D19',
    900: '#08110F',
  },
  ember: {
    50:  '#FBEFE3',
    100: '#F5DAB8',
    200: '#ECBC85',
    300: '#DC9655',
    400: '#C26E3A',
    500: '#A55A2B',
    600: '#874720',
    700: '#6B3818',
    800: '#4F2A12',
  },
  success: {
    50:  '#ECF3EC',
    500: '#4A7C4E',
    700: '#2F5733',
  },
  warning: {
    50:  '#FBF1DC',
    500: '#B07D2C',
    700: '#7A5519',
  },
  danger: {
    50:  '#F6E5DF',
    500: '#9C3A22',
    700: '#6B2615',
  },
  info: {
    50:  '#E7EEF1',
    500: '#3F6A7C',
    700: '#2A4B59',
  },
} as const;

export const fontFamily = {
  display: ['Fraunces', 'Instrument Serif', 'Georgia', 'serif'],
  body: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
  mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
} as const;

export const fontSize: Record<string, [string, Record<string, string>]> = {
  'display-xl': ['64px', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
  'display-lg': ['48px', { lineHeight: '1.04', letterSpacing: '-0.02em' }],
  'display-md': ['36px', { lineHeight: '1.08', letterSpacing: '-0.01em' }],
  'display-sm': ['28px', { lineHeight: '1.12', letterSpacing: '-0.01em' }],
  'h1': ['30px', { lineHeight: '1.1' }],
  'h2': ['24px', { lineHeight: '1.1' }],
  'h3': ['20px', { lineHeight: '1.25' }],
  'h4': ['17px', { lineHeight: '1.25' }],
  'body': ['15px', { lineHeight: '1.45' }],
  'body-sm': ['13px', { lineHeight: '1.45' }],
  'caption': ['12px', { lineHeight: '1.45' }],
  'eyebrow': ['11px', { lineHeight: '1.45', letterSpacing: '0.14em' }],
};

export const spacing = {
  '0': '0',
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '7': '32px',
  '8': '40px',
  '9': '56px',
  '10': '72px',
  '11': '96px',
} as const;

export const borderRadius = {
  'xs':   '4px',
  'sm':   '6px',
  'md':   '10px',
  'lg':   '14px',
  'xl':   '20px',
  '2xl':  '28px',
  'pill': '999px',
} as const;

export const boxShadow = {
  'xs':     '0 1px 2px rgba(31, 58, 52, 0.04)',
  'sm':     '0 1px 2px rgba(31, 58, 52, 0.05), 0 1px 3px rgba(31, 58, 52, 0.04)',
  'md':     '0 2px 4px rgba(31, 58, 52, 0.04), 0 4px 12px rgba(31, 58, 52, 0.06)',
  'lg':     '0 6px 16px rgba(31, 58, 52, 0.06), 0 12px 32px rgba(31, 58, 52, 0.08)',
  'xl':     '0 16px 40px rgba(31, 58, 52, 0.12), 0 4px 12px rgba(31, 58, 52, 0.06)',
  'inset':  'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(31,58,52,0.03)',
  'focus':  '0 0 0 3px rgba(194, 110, 58, 0.25)',
  'brand':  '0 0 0 3px rgba(31, 58, 52, 0.18)',
} as const;

export const transitionTimingFunction = {
  'standard': 'cubic-bezier(0.2, 0, 0, 1)',
  'emphasis': 'cubic-bezier(0.3, 0, 0, 1)',
  'bounce-soft': 'cubic-bezier(0.34, 1.2, 0.64, 1)',
} as const;

export const transitionDuration = {
  'fast':       '120ms',
  'base':       '200ms',
  'slow':       '320ms',
  'atmosphere': '600ms',
} as const;

// Layout constants (for use in shell components)
export const layout = {
  sidebarWidth: '248px',
  topbarHeight: '64px',
  contentMax: '1280px',
  buyerTabBarHeight: '60px',
  buyerHeaderHeight: '52px',
} as const;
