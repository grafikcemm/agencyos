import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          base: 'var(--bg-primary)',
          card: 'var(--bg-card)',
          elevated: 'var(--bg-card-elevated)',
          hover: 'var(--bg-card-hover)',
          border: 'var(--border-subtle)',
          'border-strong': 'var(--border-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          muted: 'var(--accent-muted)',
          glow: 'var(--accent-glow)',
        },
        status: {
          success: 'var(--success)',
          fire: 'var(--fire)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          tertiary: 'var(--text-tertiary)',
          quaternary: 'var(--text-quaternary)',
        },
        // Sakin Karanlık Editöryel Timeline — sessiz pastel kategori aksanları
        cat: {
          blue: 'var(--cat-blue)',
          teal: 'var(--cat-teal)',
          pink: 'var(--cat-pink)',
          purple: 'var(--cat-purple)',
          orange: 'var(--cat-orange)',
          cyan: 'var(--cat-cyan)',
          gray: 'var(--cat-gray)',
        },
        timeline: 'var(--timeline-line)',
      },
      fontFamily: {
        sans: ['"Helvetica Neue"', 'Helvetica', 'var(--font-inter-tight)', 'Arial', 'sans-serif'],
        display: ['"Helvetica Neue"', 'Helvetica', 'var(--font-inter-tight)', 'Arial', 'sans-serif'],
        serif: ['var(--font-instrument-serif)', 'serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        '2xl': '20px',
        'card': 'var(--radius-card)',
        'pill': 'var(--radius-pill)',
      },
      boxShadow: {
        'card': '0 4px 20px rgba(0, 0, 0, 0.4)',
        'elevated': '0 8px 32px rgba(0, 0, 0, 0.5)',
        'soft': 'var(--shadow-soft)',
        'hairline': 'var(--shadow-hairline)',
      }
    },
  },
  plugins: [],
};

export default config;
