import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e6faf6',
          100: '#b3f0e6',
          200: '#80e6d6',
          300: '#4ddcc6',
          400: '#1ad2b6',
          500: '#05ddb2', // Main primary color
          600: '#04b894',
          700: '#039376',
          800: '#026e58',
          900: '#01493a',
        },
        secondary: {
          50: '#ffe5e5',
          100: '#ffb3b3',
          200: '#ff8080',
          300: '#ff4d4d',
          400: '#ff1a1a',
          500: '#FF6B6B', // Main secondary color
          600: '#e65555',
          700: '#cc4040',
          800: '#b32a2a',
          900: '#991515',
        },
        neutral: {
          50: '#f7fafc',
          100: '#edf2f7',
          200: '#e2e8f0',
          300: '#cbd5e0',
          400: '#a0aec0',
          500: '#718096',
          600: '#4a5568',
          700: '#2d3748',
          800: '#1a202c',
          900: '#171923',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
