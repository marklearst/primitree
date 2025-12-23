import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { PluginOption } from 'vite'

export default defineConfig({
  plugins: [tsconfigPaths() as unknown as PluginOption],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
