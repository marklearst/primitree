import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm'],
  dts: {
    // tsup injects a baseUrl into its internal DTS compile; TS 6 deprecates
    // baseUrl, so silence the deprecation only for that isolated build.
    compilerOptions: { ignoreDeprecations: '6.0' },
  },
  sourcemap: true,
  clean: true,
  target: 'node20',
  treeshake: true,
})
