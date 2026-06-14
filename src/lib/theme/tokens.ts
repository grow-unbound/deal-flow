// Yukti R11/R11.1 token definitions.
// Existing semantic names are preserved for broad app compatibility, but the
// rendered palette/typography now maps to the canonical Yukti system.

export const colors = {
  cream: {
    50:  '#FCFBF8',
    100: '#F8F6F2',
    200: '#F3EEE6',
    300: '#EAE3D9',
    400: '#DDD2C4',
    500: '#B7A999',
    600: '#8E7E6E',
    700: '#64594E',
    800: '#2B2825',
    900: '#221E1A',
    950: '#181512',
  },
  teal: {
    50:  '#F2EEEA',
    100: '#E6DDD2',
    200: '#D4C6B6',
    300: '#B59E87',
    400: '#7E6B59',
    500: '#221E1A',
    600: '#1C1916',
    700: '#2B2825',
    800: '#171411',
    900: '#0F0D0B',
  },
  ember: {
    50:  '#F7EEE6',
    100: '#ECD6C2',
    200: '#DEB48B',
    300: '#D9894C',
    400: '#B5642F',
    500: '#9B5428',
    600: '#834620',
    700: '#6A3D18',
    800: '#4C2D14',
  },
  success: {
    50:  '#EAF4EC',
    500: '#1F6B3A',
    700: '#17512B',
  },
  warning: {
    50:  '#FBF1DE',
    500: '#8A5700',
    700: '#6D4500',
  },
  danger: {
    50:  '#F8E9E7',
    500: '#9C3026',
    700: '#7A241D',
  },
  info: {
    50:  '#EAF0F5',
    500: '#2A5F8A',
    700: '#214A6B',
  },
} as const;

export const fontFamily = {
  display: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
  body: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
  mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
} as const;

export const fontSize: Record<string, [string, Record<string, string>]> = {
  'xs': ['var(--yk-text-xs)', { lineHeight: '1.35' }],
  'sm': ['var(--yk-text-sm)', { lineHeight: '1.4' }],
  'base': ['var(--yk-text-base)', { lineHeight: '1.45' }],
  'md': ['var(--yk-text-md)', { lineHeight: '1.45', letterSpacing: '-0.01em' }],
  'lg': ['var(--yk-text-lg)', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
  'xl': ['var(--yk-text-xl)', { lineHeight: '1.12', letterSpacing: '-0.01em' }],
  '2xl': ['var(--yk-text-2xl)', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
  '3xl': ['var(--yk-text-3xl)', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
  'display-xl': ['var(--yk-text-3xl)', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
  'display-lg': ['var(--yk-text-3xl)', { lineHeight: '1.04', letterSpacing: '-0.02em' }],
  'display-md': ['var(--yk-text-3xl)', { lineHeight: '1.08', letterSpacing: '-0.01em' }],
  'display-sm': ['var(--yk-text-2xl)', { lineHeight: '1.12', letterSpacing: '-0.01em' }],
  'h1': ['var(--yk-text-2xl)', { lineHeight: '1.08', letterSpacing: '-0.025em' }],
  'h2': ['var(--yk-text-xl)', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
  'h3': ['var(--yk-text-lg)', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
  'h4': ['var(--yk-text-md)', { lineHeight: '1.25', letterSpacing: '-0.015em' }],
  'body': ['var(--yk-text-md)', { lineHeight: '1.45', letterSpacing: '-0.01em' }],
  'body-sm': ['var(--yk-text-base)', { lineHeight: '1.45' }],
  'caption': ['var(--yk-text-sm)', { lineHeight: '1.4', letterSpacing: '0.04em' }],
  'eyebrow': ['var(--yk-text-xs)', { lineHeight: '1.35', letterSpacing: '0.14em' }],
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
  'xs':     '0 1px 2px rgba(34, 30, 26, 0.05)',
  'sm':     '0 1px 2px rgba(34, 30, 26, 0.06), 0 2px 8px rgba(34, 30, 26, 0.04)',
  'md':     '0 4px 14px rgba(34, 30, 26, 0.06), 0 2px 4px rgba(34, 30, 26, 0.04)',
  'lg':     '0 10px 24px rgba(34, 30, 26, 0.08), 0 4px 10px rgba(34, 30, 26, 0.04)',
  'xl':     '0 18px 44px rgba(34, 30, 26, 0.12), 0 8px 18px rgba(34, 30, 26, 0.06)',
  'inset':  'inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -1px 0 rgba(34,30,26,0.04)',
  'focus':  '0 0 0 3px rgba(181, 100, 47, 0.22)',
  'brand':  '0 0 0 3px rgba(34, 30, 26, 0.12)',
} as const;

export const transitionTimingFunction = {
  'standard': 'cubic-bezier(.22,1,.36,1)',
  'emphasis': 'cubic-bezier(.22,1,.36,1)',
  'bounce-soft': 'cubic-bezier(.22,1,.36,1)',
} as const;

export const transitionDuration = {
  'fast':       '100ms',
  'base':       '180ms',
  'slow':       '280ms',
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
