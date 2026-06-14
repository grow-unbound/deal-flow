import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import { colors, fontFamily, fontSize, borderRadius, boxShadow, transitionTimingFunction, transitionDuration } from './src/lib/theme/tokens';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Ember & Cream palette — use these directly: bg-cream-100, text-teal-500, etc.
        cream: colors.cream,
        teal: colors.teal,
        ember: colors.ember,
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
        info: colors.info,

        // shadcn/ui semantic aliases — map to design system tokens
        background:   colors.cream[100],
        foreground:   colors.cream[900],
        card:         '#FFFFFF',
        'card-foreground': colors.cream[900],
        popover:      '#FFFFFF',
        'popover-foreground': colors.cream[900],
        primary:      colors.teal[500],
        'primary-foreground': colors.cream[50],
        secondary:    colors.cream[200],
        'secondary-foreground': colors.cream[800],
        muted:        colors.cream[200],
        'muted-foreground': colors.cream[700],
        accent:       colors.ember[400],
        'accent-foreground': colors.cream[50],
        destructive:  colors.danger[500],
        'destructive-foreground': colors.cream[50],
        border:       colors.cream[300],
        input:        colors.cream[300],
        ring:         colors.ember[400],
      },

      fontFamily: {
        display: [...fontFamily.display],
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        mono:    [...fontFamily.mono],
      },

      fontSize,

      borderRadius: {
        ...borderRadius,
        // Keep shadcn aliases
        DEFAULT: borderRadius.lg,
      },

      boxShadow,

      transitionTimingFunction,
      transitionDuration,

      // Named layout constants as arbitrary values (use via Tailwind JIT)
      spacing: {
        'sidebar': '248px',
        'topbar':  '64px',
        'tab-bar': '60px',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
