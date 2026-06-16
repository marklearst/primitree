module.exports = () => ({
  files: ['src/**/*', 'tests/**/*', 'vitest.setup.ts', '!**/*.test.*'],
  tests: ['tests/**/*.test.*', 'src/**/*.test.*'],

  testFramework: {
    name: 'vitest',
    configFile: './vite.config.ts',
  },

  env: {
    type: 'node',
  },
})
