/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#800000', // Maroon Red
          light: '#A52A2A',
          dark: '#5C0000',
        },
        secondary: '#FFFFFF',
        gray: {
          800: '#2D2D2D', // Sharp text
        }
      },
      fontFamily: {
        sans: ['Montserrat', 'sans-serif'],
      },
      borderRadius: {
        'none': '0', // Enforce sharp UI
        'sm': '0',
        'md': '0',
        'lg': '0',
        'xl': '0',
        '2xl': '0',
        'full': '9999px',
      }
    },
  },
  plugins: [],
}