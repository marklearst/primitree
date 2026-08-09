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
    requiredDeclarationFiles: Object.freeze([
      ...config.requiredDeclarationFiles,
    ]),
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
  'git+https://github.com/marklearst/primitree.git'
export const RELEASE_HOMEPAGE = 'https://github.com/marklearst/primitree#readme'
export const RELEASE_BUGS = 'https://github.com/marklearst/primitree/issues'
export const RELEASE_FUNDING_TYPE = 'github'
export const RELEASE_FUNDING = 'https://github.com/sponsors/marklearst'
export const RELEASE_NODE_ENGINE = '>=24.0.0'

export const PUBLIC_RELEASE_PACKAGES = Object.freeze([
  freezePackage({
    path: 'packages/core',
    manifestPath: 'packages/core/package.json',
    name: '@primitree/core',
    attwProfile: 'node16',
    requiredFiles: ['dist'],
    requiredDeclarationFiles: [
      'dist/index.d.ts',
      'dist/index.d.cts',
      'dist/types.d.ts',
      'dist/types.d.cts',
      'dist/policy.d.ts',
      'dist/policy.d.cts',
    ],
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
      './policy': {
        import: {
          types: './dist/policy.d.ts',
          default: './dist/policy.js',
        },
        require: {
          types: './dist/policy.d.cts',
          default: './dist/policy.cjs',
        },
        default: './dist/policy.js',
      },
    },
    requiredBin: undefined,
    requiredBinTarget: undefined,
    requiredInternalRuntimeDependencies: [],
  }),
  freezePackage({
    path: 'packages/dtcg',
    manifestPath: 'packages/dtcg/package.json',
    name: '@primitree/dtcg',
    attwProfile: 'strict',
    requiredFiles: ['dist', 'CHANGELOG.md'],
    requiredDeclarationFiles: ['dist/index.d.ts', 'dist/index.d.cts'],
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
    requiredInternalRuntimeDependencies: ['@primitree/core'],
  }),
  freezePackage({
    path: 'packages/cli',
    manifestPath: 'packages/cli/package.json',
    name: '@primitree/cli',
    attwProfile: null,
    requiredFiles: ['dist'],
    requiredDeclarationFiles: ['dist/index.d.ts', 'dist/config.d.ts'],
    expectedExports: {
      './config': {
        types: './dist/config.d.ts',
        import: './dist/config.js',
      },
    },
    requiredBin: 'primitree',
    requiredBinTarget: './dist/index.js',
    requiredInternalRuntimeDependencies: ['@primitree/core', '@primitree/dtcg'],
  }),
  freezePackage({
    path: 'packages/hooks',
    manifestPath: 'packages/hooks/package.json',
    name: '@primitree/hooks',
    attwProfile: 'strict',
    requiredFiles: ['dist'],
    requiredDeclarationFiles: ['dist/index.d.ts', 'dist/index.d.cts'],
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
    },
    requiredBin: undefined,
    requiredBinTarget: undefined,
    requiredInternalRuntimeDependencies: ['@primitree/core', '@primitree/dtcg'],
  }),
  freezePackage({
    path: 'packages/mcp',
    manifestPath: 'packages/mcp/package.json',
    name: '@primitree/mcp',
    attwProfile: 'esm-only',
    requiredFiles: ['dist'],
    requiredDeclarationFiles: ['dist/index.d.ts', 'dist/cli.d.ts'],
    expectedExports: {
      '.': {
        import: {
          types: './dist/index.d.ts',
          default: './dist/index.js',
        },
      },
    },
    requiredBin: 'primitree-mcp',
    requiredBinTarget: './dist/cli.js',
    requiredInternalRuntimeDependencies: ['@primitree/core', '@primitree/dtcg'],
  }),
])
