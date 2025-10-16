/// <reference types="vitest" />

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'
import viteTsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), viteTsconfigPaths(), dts({ rollupTypes: true })],
  resolve: {
    alias: {
      api: resolve(__dirname, './src/api'),
      constants: resolve(__dirname, './src/constants'),
      contexts: resolve(__dirname, './src/contexts'),
      hooks: resolve(__dirname, './src/hooks'),
      types: resolve(__dirname, './src/types'),
      utils: resolve(__dirname, './src/utils'),
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: '@figma-vars/hooks',
      fileName: 'figma-vars-hooks',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react/jsx-runtime': 'react/jsx-runtime',
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './private/vitest.setup.ts',
  },
})
