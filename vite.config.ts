import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'FigmaVarsHooks',
      fileName: 'figma-vars-hooks',
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
    },
  },
  plugins: [dts()],
})
