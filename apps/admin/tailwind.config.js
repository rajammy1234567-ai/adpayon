/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        obsidian: {
          950: '#090C10',
          900: '#131923',
          800: '#1C2331',
          700: '#252F42',
          600: '#2E3A52',
          500: '#3D4D6B',
        },
        fintech: {
          emerald: '#10B981',
          emeraldLight: '#34D399',
          emeraldDark: '#047857',
          gold: '#F59E0B',
          goldLight: '#FBBF24',
          cyan: '#06B6D4',
          danger: '#EF4444',
          warning: '#F97316',
          info: '#3B82F6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
