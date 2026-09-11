/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // All palette values resolve through CSS custom properties so a theme
        // swap is a single attribute change on <html> rather than a re-render.
        ink: 'rgb(var(--wl-ink) / <alpha-value>)',
        paper: 'rgb(var(--wl-paper) / <alpha-value>)',
        surface: 'rgb(var(--wl-surface) / <alpha-value>)',
        raised: 'rgb(var(--wl-raised) / <alpha-value>)',
        line: 'rgb(var(--wl-line) / <alpha-value>)',
        'line-strong': 'rgb(var(--wl-line-strong) / <alpha-value>)',
        muted: 'rgb(var(--wl-muted) / <alpha-value>)',
        faint: 'rgb(var(--wl-faint) / <alpha-value>)',
        accent: 'rgb(var(--wl-accent) / <alpha-value>)',
        pos: 'rgb(var(--wl-pos) / <alpha-value>)',
        neg: 'rgb(var(--wl-neg) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        mono: ['"SF Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', '"Liberation Mono"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.08em' }],
        '3xs': ['0.5625rem', { lineHeight: '0.75rem', letterSpacing: '0.1em' }],
      },
      borderRadius: { none: '0', sm: '2px', DEFAULT: '3px', md: '4px' },
      spacing: { px2: '2px', 18: '4.5rem' },
      transitionTimingFunction: {
        instrument: 'cubic-bezier(0.2, 0.9, 0.25, 1)',
        challenge: 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      keyframes: {
        'rise-in': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        sweep: { '0%': { transform: 'translateX(-100%)' }, '100%': { transform: 'translateX(200%)' } },
        'tick-spin': { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        'rise-in': 'rise-in 380ms cubic-bezier(0.2, 0.9, 0.25, 1) both',
        'fade-in': 'fade-in 260ms ease-out both',
        sweep: 'sweep 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'tick-spin': 'tick-spin 1.6s linear infinite',
      },
    },
  },
  plugins: [],
};
