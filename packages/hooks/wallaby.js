module.exports = function (wallaby) {
  require('dotenv').config()

  return {
    files: [
      'src/**/*',
      'tests/**/*',
      '.env',
      'vitest.setup.ts',
      '!**/*.test.*',
    ],
    tests: ['tests/**/*.test.*', 'src/**/*.test.*'],

    testFramework: {
      name: 'vitest',
      configFile: './vite.config.ts',
    },

    env: {
      type: 'node',
      params: {
        env: `VITE_FIGMA_TOKEN=${process.env.VITE_FIGMA_TOKEN};VITE_FIGMA_FILE_KEY=${process.env.VITE_FIGMA_FILE_KEY}`,
      },
    },
  }
}
