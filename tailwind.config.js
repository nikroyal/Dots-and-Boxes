/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"EB Garamond"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ink: '#1A1A1A',
        paper: '#FAFAF7',
        crimson: '#B91C3C',
        ochre: '#B7791F',
        forest: '#2F6B3F',
      },
    },
  },
  plugins: [],
};
