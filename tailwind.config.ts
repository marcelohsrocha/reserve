import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Verde de destaque (inspirado no layout minimalista de referência).
        igreja: { DEFAULT: '#0b8f62', vivo: '#1fc48d', claro: '#e9f9f2', borda: '#bfeedb' },
        fundo: '#f4f6f8',
      },
      boxShadow: {
        suave: '0 1px 2px rgba(15,23,42,.04), 0 10px 30px -14px rgba(15,23,42,.14)',
      },
    },
  },
  plugins: [],
} satisfies Config;
