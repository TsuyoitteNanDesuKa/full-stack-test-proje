import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    restoreMocks: true,
    coverage: {
      include: [
        'src/App.tsx',
        'src/api.ts',
        'src/auth.ts',
        'src/ProductCreatePage.tsx',
        'src/*Panel.tsx',
      ],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: {
        statements: 93,
        branches: 88,
        functions: 95,
        lines: 93,
        perFile: {
          statements: 81,
          branches: 70,
          functions: 88,
          lines: 83,
        },
        'src/{App.tsx,api.ts,ProductCreatePage.tsx}': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
})
