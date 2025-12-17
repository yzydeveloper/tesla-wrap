/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        tesla: {
          red: '#B73038',      // Tesla-Colors-1
          light: '#D7DCDD',    // Tesla-Colors-2
          gray: '#B9BEC1',     // Tesla-Colors-3
          dark: '#8B9094',     // Tesla-Colors-4
          black: '#4A4B4C',    // Tesla-Colors-5
        },
      },
    },
  },
  plugins: [],
}
