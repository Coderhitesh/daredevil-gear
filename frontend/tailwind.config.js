/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // brand orange from the logo
        signal: { DEFAULT: '#EE5A1F', dark: '#D24812', light: '#FDE9DF', 50: '#FFF5EF' },
        // deep forest-charcoal used for dark bands, header and footer
        night: { DEFAULT: '#121614', 800: '#181D1A', 700: '#1F2622', 600: '#2A322D', 500: '#3A433D' },
        graphite: { DEFAULT: '#232624', 700: '#2E322F', 600: '#424644', 400: '#717571' },
        ink: '#141816',
        stone: { DEFAULT: '#E6E3DC', 100: '#F6F4F0', 200: '#EFEDE8', 300: '#E2DED6', 400: '#BDB8AC' },
        paper: '#FAF8F5',
        olive: { DEFAULT: '#5A6145', light: '#E7E9DF' },
        alert: '#B42318',
        okay: '#2F6B3B',
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-body)', 'sans-serif'],
        script: ['var(--font-script)', 'cursive'],
      },
      fontSize: {
        'display-xl': ['clamp(2.5rem, 5.6vw, 4.6rem)', { lineHeight: '1.04', letterSpacing: '-0.02em' }],
        'display-lg': ['clamp(2rem, 4vw, 3.1rem)', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
        'display-md': ['clamp(1.55rem, 2.6vw, 2.1rem)', { lineHeight: '1.18', letterSpacing: '-0.01em' }],
      },
      borderRadius: { DEFAULT: '8px', sm: '6px', md: '10px', xl: '14px', '2xl': '18px', '3xl': '26px' },
      boxShadow: {
        card: '0 1px 2px rgba(18,22,20,.05), 0 6px 20px -8px rgba(18,22,20,.12)',
        lift: '0 2px 4px rgba(18,22,20,.06), 0 18px 40px -16px rgba(18,22,20,.25)',
        glow: '0 10px 24px -10px rgba(238,90,31,.65)',
      },
      maxWidth: { site: '1320px', prose: '68ch' },
      keyframes: {
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
      },
    },
  },
  plugins: [],
};
