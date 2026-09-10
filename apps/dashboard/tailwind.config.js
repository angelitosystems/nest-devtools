/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // App chrome — cool near-black, one step darker than most dev-tool
        // dashboards so the accent and method colors carry the contrast.
        surface: {
          950: '#08090d',
          900: '#0c0e14',
          850: '#11141c',
          800: '#161a24',
          700: '#1c212d',
          600: '#262c3a',
          500: '#333a4a',
        },
        // Brand accent lifted from NestJS's own mark, tuned lighter so it
        // reads clearly on the near-black surfaces above.
        accent: {
          300: '#ff9bb0',
          400: '#fb5c81',
          500: '#e63462',
          600: '#c11f4d',
          700: '#9c1740',
        },
        // Per-verb colors for method badges, a la REST client tooling.
        method: {
          get: '#3fb970',
          post: '#e5a52c',
          put: '#4d94f0',
          patch: '#b98af0',
          delete: '#f0576b',
          options: '#8b93a7',
          head: '#8b93a7',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.02) inset, 0 10px 30px -18px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};
