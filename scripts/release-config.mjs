function deepFreezeCopy(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(item => deepFreezeCopy(item)))
  }
  if (value !== null && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          deepFreezeCopy(child),
        ])
      )
    )
  }
  return value
}

function collectTargets(value, targets = new Set()) {
  if (typeof value === 'string') {
    targets.add(value)
  } else if (value !== undefined) {
    for (const child of Object.values(value)) collectTargets(child, targets)
  }
  return [...targets]
}

function freezePackage(config) {
  const expectedExports = deepFreezeCopy(config.expectedExports)
  const requiredExports = Object.freeze(
    expectedExports === undefined ? [] : Object.keys(expectedExports)
  )
  const exportTargets = Object.freeze(
    Object.fromEntries(
      requiredExports.map(name => [
        name,
        Object.freeze(collectTargets(expectedExports[name])),
      ])
    )
  )

  return Object.freeze({
    ...config,
    requiredFiles: Object.freeze([...config.requiredFiles]),
    expectedExports,
    requiredExports,
    exportTargets,
    requiredInternalRuntimeDependencies: Object.freeze([
      ...config.requiredInternalRuntimeDependencies,
    ]),
  })
}

export const RELEASE_REPOSITORY_TYPE = 'git'
export const RELEASE_REPOSITORY =
  'git+https://github.com/marklearst/figmavars.git'
export const RELEASE_HOMEPAGE = 'https://github.com/marklearst/figmavars#readme'
export const RELEASE_BUGS = 'https://github.com/marklearst/figmavars/issues'
export const RELEASE_FUNDING_TYPE = 'github'
export const RELEASE_FUNDING = 'https://github.com/sponsors/marklearst'
export const RELEASE_NODE_ENGINE = '>=24.0.0'

export const PUBLIC_RELEASE_PACKAGES = Object.freeze([
  freezePackage({
    path: 'packages/core',
    manifestPath: 'packages/core/package.json',
    name: '@figmavars/core',
    attwProfile: 'node16',
    requiredFiles: ['dist'],
    expectedExports: {
      '.': {
        import: {
          types: './dist/index.d.ts',
          default: './dist/index.js',
        },
        require: {
          types: './dist/index.d.cts',
          default: './dist/index.cjs',
        },
        default: './dist/index.js',
      },
      './types': {
        import: {
          types: './dist/types.d.ts',
          default: './dist/types.js',
        },
        require: {
          types: './dist/types.d.cts',
          default: './dist/types.cjs',
        },
        default: './dist/types.js',
      },
    },
    requiredBin: undefined,
    requiredBinTarget: undefined,
    requiredInternalRuntimeDependencies: [],
  }),
  freezePackage({
    path: 'packages/dtcg',
    manifestPath: 'packages/dtcg/package.json',
    name: '@figmavars/dtcg',
    attwProfile: 'strict',
    requiredFiles: ['dist'],
    expectedExports: {
      '.': {
        import: {
          types: './dist/index.d.ts',
          default: './dist/index.js',
        },
        require: {
          types: './dist/index.d.cts',
          default: './dist/index.cjs',
        },
        default: './dist/index.js',
      },
    },
    requiredBin: undefined,
    requiredBinTarget: undefined,
    requiredInternalRuntimeDependencies: ['@figmavars/core'],
  }),
  freezePackage({
    path: 'packages/cli',
    manifestPath: 'packages/cli/package.json',
    name: '@figmavars/cli',
    attwProfile: null,
    requiredFiles: ['dist'],
    expectedExports: undefined,
    requiredBin: 'figma-vars',
    requiredBinTarget: './dist/index.js',
    requiredInternalRuntimeDependencies: ['@figmavars/core', '@figmavars/dtcg'],
  }),
  freezePackage({
    path: 'packages/hooks',
    manifestPath: 'packages/hooks/package.json',
    name: '@figmavars/hooks',
    attwProfile: 'strict',
    requiredFiles: ['dist', 'scripts/export-variables.mjs'],
    expectedExports: {
      '.': {
        import: {
          types: './dist/index.d.ts',
          default: './dist/index.mjs',
        },
        require: {
          types: './dist/index.d.cts',
          default: './dist/index.cjs',
        },
        default: './dist/index.mjs',
      },
      './core': {
        import: {
          types: './dist/core.d.ts',
          default: './dist/core.mjs',
        },
        require: {
          types: './dist/core.d.cts',
          default: './dist/core.cjs',
        },
        default: './dist/core.mjs',
      },
    },
    requiredBin: 'figma-vars-export',
    requiredBinTarget: './scripts/export-variables.mjs',
    requiredInternalRuntimeDependencies: ['@figmavars/core', '@figmavars/dtcg'],
  }),
  freezePackage({
    path: 'packages/mcp',
    manifestPath: 'packages/mcp/package.json',
    name: '@figmavars/mcp',
    attwProfile: 'esm-only',
    requiredFiles: ['dist'],
    expectedExports: {
      '.': {
        import: {
          types: './dist/index.d.ts',
          default: './dist/index.js',
        },
      },
    },
    requiredBin: 'figma-vars-mcp',
    requiredBinTarget: './dist/cli.js',
    requiredInternalRuntimeDependencies: ['@figmavars/core', '@figmavars/dtcg'],
  }),
])
