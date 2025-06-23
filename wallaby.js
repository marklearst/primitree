module.exports = function (wallaby) {
  return {
    files: [
      'src/**/*',
      'tests/**/*',
      '.env',
      'vitest.setup.ts',
      '!**/*.test.*',
    ],
    tests: ['tests/**/*.test.*', 'src/**/*.test.*'],

    // Tell Wallaby it's a Vitest project and to use the Vite config.
    testFramework: {
      name: 'vitest',
      configFile: './vite.config.ts',
    },

    setup: (wallaby) => {
      require('dotenv').config()
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
