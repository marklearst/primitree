module.exports = function () {
  return {
    files: ['src/**/*', 'tests/**/*', '!**/*.test.*'],
    tests: ['tests/**/*.test.*', 'src/**/*.test.*'],

    // Tell Wallaby it's a Vitest project and to use the Vite config.
    testFramework: {
      name: 'vitest',
      configFile: './vite.config.ts',
    },

    setup: (wallaby) => {
      const vitestConfig = require('./vite.config.ts').default.test
      wallaby.testFramework.setupFiles = vitestConfig.setupFiles
    },

    // Default Node.js environment
    env: {
      type: 'node',
    },

    // This is all that's needed for Vitest integration.
    // Wallaby will use your Vite config for compilation and resolution.
  }
}
