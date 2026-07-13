import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 80,
        lines: 90,
      },
    },
  },
})
