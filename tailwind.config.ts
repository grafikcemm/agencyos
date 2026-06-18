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
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-inter-tight)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      borderRadius: {
        // Framer granular yarıçap skalası
        'xs': '4px',
        'sm': '6px',
        'md': '10px',
        'lg': '15px',
        'xl': '20px',
        '2xl': '20px',
        'xxl': '30px',
        'card': 'var(--radius-card)',
        'pill': '100px',
        'full': '9999px',
      },
      boxShadow: {
        // Framer disiplini: kart = light hairline; "elevated" = yumuşak siyah
        // drop + üst light-edge; güçlü drop yalnız product imgesi (inline).
        'card': '0 0 0 1px rgba(255, 255, 255, 0.06)',
        'elevated': '0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        'soft': 'var(--shadow-soft)',
        'hairline': 'var(--shadow-hairline)',
        'product': 'var(--shadow-product)',
      }
    },
  },
  plugins: [],
};

export default config;
