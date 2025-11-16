/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          green: '#22c55e',
          dark: '#020617',
        },
      },
      boxShadow: {
        glass: "0 18px 45px rgba(15,23,42,0.95)",
      },
    },
  },
  plugins: [],
};

