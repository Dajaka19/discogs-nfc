/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0f0f0f',
        card: '#1a1a1a',
        accent: '#f5a623',
        'text-secondary': '#888888',
        'card-hover': '#222222',
        border: '#2a2a2a',
      },
      fontFamily: {
        serif: ['DM Serif Display', 'Georgia', 'serif'],
        mono: ['DM Mono', 'monospace'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
