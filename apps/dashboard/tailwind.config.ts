import type { Config } from 'tailwindcss';

/**
 * PayGate dashboard Tailwind config.
 *
 * Design tokens live in `src/lib/theme.ts`. This file mirrors the token values
 * so JIT purging works against the class strings; keep the two in sync.
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // canvas
        canvas: {
          DEFAULT: '#FDFDFF',
          raised: '#FFFFFF',
          sunken: '#F4F5FB',
          inverse: '#0B0A1A',
        },
        ink: {
          DEFAULT: '#0B0A1A',
          2: '#1A1830',
          3: '#2C2946',
          muted: '#6B6B8A',
          soft: '#8A8AA8',
        },
        paper: {
          DEFAULT: '#F8FAFC',
          2: '#EDEAF7',
          3: '#E2DEF2',
        },
        // brand
        indigo: {
          50: '#EEF1FF',
          100: '#E0E5FF',
          200: '#C3CDFF',
          300: '#9CADFF',
          400: '#7486F7',
          500: '#4F46E5',
          600: '#3F37C6',
          700: '#312E81',
          900: '#1E1B4B',
        },
        violet: {
          500: '#8B5CF6',
          600: '#6D28D9',
          700: '#5B21B6',
        },
        flow: {
          cyan: '#22D3EE',
          mint: '#10B981',
        },
        state: {
          success: '#10B981',
          warn: '#F59E0B',
          danger: '#EF4444',
          info: '#3B82F6',
        },
        chain: {
          base: '#0052FF',
          'base-sepolia': '#4F86FF',
          solana: '#14F195',
          'solana-devnet': '#9945FF',
        },
      },
      fontFamily: {
        display: [
          'Inter',
          'InterVariable',
          'SF Pro Display',
          'system-ui',
          'sans-serif',
        ],
        sans: [
          'Inter',
          'InterVariable',
          'SF Pro Text',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }],
        micro: ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.04em' }],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
        '2xl': '28px',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(79,70,229,0.18), 0 8px 32px -12px rgba(79,70,229,0.25)',
        'glow-strong':
          '0 0 0 1px rgba(79,70,229,0.35), 0 12px 48px -16px rgba(79,70,229,0.4)',
        soft: '0 1px 0 rgba(11,10,26,0.04), 0 2px 6px -2px rgba(11,10,26,0.06)',
        ring: '0 0 0 4px rgba(79,70,229,0.12)',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        'slide-in': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'tick-in': {
          from: { transform: 'translateX(-6px)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'pulse-soft': 'pulse-soft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slide-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'tick-in': 'tick-in 260ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 1600ms linear infinite',
      },
      backgroundImage: {
        'grid-ink':
          'radial-gradient(circle at 1px 1px, rgba(11,10,26,0.06) 1px, transparent 0)',
        'grid-white':
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)',
        flow: 'linear-gradient(90deg, #22D3EE 0%, #10B981 100%)',
        brand: 'linear-gradient(135deg, #4F46E5 0%, #6D28D9 55%, #312E81 100%)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
