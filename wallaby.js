const path = require('path')

module.exports = function () {
  return {
    files: [
      'src/**/*.+(ts|tsx|js|jsx|json)',
      'tests/**/*.+(ts|tsx|js|jsx|json)',
      '!**/*.test.*',
    ],
    tests: [
      'tests/**/*.test.+(ts|tsx|js|jsx)',
      'src/**/*.test.+(ts|tsx|js|jsx)',
    ],
    env: {
      type: 'node',
      runner: 'node',
    },
    compilers: {
      '**/*.ts?(x)': wallaby.compilers.typeScript({}),
    },
    setup: function () {
      // Optional: global setup, e.g. for jsdom
    },
    resolve: {
      alias: {
        api: path.join(wallaby.projectCacheDir, 'src/api'),
        mutations: path.join(wallaby.projectCacheDir, 'src/mutations'),
        constants: path.join(wallaby.projectCacheDir, 'src/constants'),
        contexts: path.join(wallaby.projectCacheDir, 'src/contexts'),
        hooks: path.join(wallaby.projectCacheDir, 'src/hooks'),
        mocks: path.join(wallaby.projectCacheDir, 'tests/mocks'),
        types: path.join(wallaby.projectCacheDir, 'src/types'),
        utils: path.join(wallaby.projectCacheDir, 'src/utils'),
      },
    },
  }
}
