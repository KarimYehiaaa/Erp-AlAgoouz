/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      fontFamily: {
        ui: ['var(--font-ui)'],
      },
      colors: {
        bg: 'var(--bg)',
        elevated: 'var(--bg-elevated)',
        card: 'var(--bg-card)',
        soft: 'var(--bg-soft)',
        surface: {
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
        },
        text: {
          DEFAULT: 'var(--text)',
          strong: 'var(--text-strong)',
          muted: 'var(--text-muted)',
        },
        primary: {
          DEFAULT: 'var(--primary)',
          strong: 'var(--primary-strong)',
          dark: 'var(--primary-dark)',
          soft: 'var(--primary-soft)',
        },
        accent: 'var(--accent)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        line: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      spacing: {
        sidebar: 'var(--sidebar-current-width, var(--sidebar-width))',
        'sidebar-collapsed': 'var(--sidebar-collapsed)',
        navbar: 'var(--navbar-height)',
      },
      transitionTimingFunction: {
        ui: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      transitionDuration: {
        ui: '220ms',
      },
    },
  },
  plugins: [],
};
