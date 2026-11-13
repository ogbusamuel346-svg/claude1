/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { ink: '#20252b', muted: '#7f8790', line: '#e9ebee', canvas: '#f7f8fa', teal: '#0e766e', 'teal-soft': '#e5f3f0', amber: '#c88516', 'amber-soft': '#fff4df', rose: '#c5535e', 'rose-soft': '#fcebed', blue: '#4976bb', 'blue-soft': '#eaf0fa' },
      fontFamily: { sans: ['DM Sans', 'sans-serif'], display: ['Manrope', 'sans-serif'] },
      boxShadow: { card: '0 2px 8px rgba(25, 33, 41, .035)' },
    },
  },
  plugins: [],
};
