import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      thresholds: {
        statements: 70,
        branches: 50,
        functions: 80,
        lines: 70,
      },
    },
  },
})
