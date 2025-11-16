/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#2ECC71",
          dark: "#0D1117",
          card: "#111827",
          glass: "rgba(255,255,255,0.08)",
        },
      },
      boxShadow: {
        glass: "0 8px 32px rgba(0,0,0,0.3)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
  ],
  darkMode: "class",
};
