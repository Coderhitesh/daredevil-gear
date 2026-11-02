/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        signal: { DEFAULT: '#E94E19', dark: '#C63F10', light: '#FBE4DA' },
        graphite: { DEFAULT: '#232624', 700: '#2E322F', 600: '#424644', 400: '#717571' },
        ink: '#151716',
        stone: { DEFAULT: '#E6E3DC', 200: '#EFEDE8', 300: '#D9D5CC', 400: '#BDB8AC' },
        paper: '#F8F7F4',
        olive: { DEFAULT: '#5A6145', light: '#E7E9DF' },
        alert: { DEFAULT: '#B42318', light: '#FBE7E5' },
        okay: { DEFAULT: '#2F6B3B', light: '#E3EFE5' },
        caution: { DEFAULT: '#8A5A00', light: '#FBF0D9' },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-body)', 'sans-serif'],
      },
      borderRadius: { DEFAULT: '2px', sm: '2px', md: '4px' },
    },
  },
  plugins: [],
};
