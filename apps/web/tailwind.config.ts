import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const c = (v: string) => `rgb(var(--${v}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: c('ground'),
        surface: c('surface'),
        raised: c('raised'),
        line: c('line'),
        rule: c('rule'),
        ink: c('ink'),
        muted: c('muted'),
        faint: c('faint'),
        accent: c('accent'),
        up: c('up'),
        down: c('down'),
        warn: c('warn'),
        info: c('info'),
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        num: ['var(--font-num)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['11px', '16px'],
        xs: ['12px', '16px'],
        sm: ['13px', '20px'],
        base: ['14px', '22px'],
      },
      borderRadius: { card: '8px', ctl: '6px' },
      opacity: { '8': '0.08', '12': '0.12', '15': '0.15', '35': '0.35', '85': '0.85' },
      keyframes: {
        'flash-up': { '0%': { backgroundColor: 'rgb(var(--up) / 0.28)' }, '100%': { backgroundColor: 'transparent' } },
        'flash-down': { '0%': { backgroundColor: 'rgb(var(--down) / 0.28)' }, '100%': { backgroundColor: 'transparent' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        pulse_dot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
      animation: {
        'flash-up': 'flash-up 900ms ease-out',
        'flash-down': 'flash-down 900ms ease-out',
        shimmer: 'shimmer 1.6s infinite',
        marquee: 'marquee 80s linear infinite',
        'pulse-dot': 'pulse_dot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
