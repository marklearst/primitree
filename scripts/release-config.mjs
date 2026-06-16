function freezePackage(config) {
  const exportTargets = Object.fromEntries(
    Object.entries(config.exportTargets).map(([name, targets]) => [
      name,
      Object.freeze([...targets]),
    ])
  )

  return Object.freeze({
    ...config,
    requiredFiles: Object.freeze([...config.requiredFiles]),
    requiredExports: Object.freeze([...config.requiredExports]),
    exportTargets: Object.freeze(exportTargets),
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

export const PUBLIC_RELEASE_PACKAGES = Object.freeze([
  freezePackage({
    path: 'packages/core',
    manifestPath: 'packages/core/package.json',
    name: '@figmavars/core',
    attwProfile: 'node16',
    requiredFiles: ['dist'],
    requiredExports: ['.', './types'],
    exportTargets: {
      '.': [
        './dist/index.d.ts',
        './dist/index.js',
        './dist/index.d.cts',
        './dist/index.cjs',
      ],
      './types': [
        './dist/types.d.ts',
        './dist/types.js',
        './dist/types.d.cts',
        './dist/types.cjs',
      ],
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
    requiredExports: ['.'],
    exportTargets: {
      '.': [
        './dist/index.d.ts',
        './dist/index.js',
        './dist/index.d.cts',
        './dist/index.cjs',
      ],
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
    requiredExports: [],
    exportTargets: {},
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
    requiredExports: ['.', './core'],
    exportTargets: {
      '.': [
        './dist/index.d.ts',
        './dist/index.mjs',
        './dist/index.d.cts',
        './dist/index.cjs',
      ],
      './core': [
        './dist/core.d.ts',
        './dist/core.mjs',
        './dist/core.d.cts',
        './dist/core.cjs',
      ],
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
    requiredExports: ['.'],
    exportTargets: {
      '.': ['./dist/index.d.ts', './dist/index.js'],
    },
    requiredBin: 'figma-vars-mcp',
    requiredBinTarget: './dist/index.js',
    requiredInternalRuntimeDependencies: ['@figmavars/core', '@figmavars/dtcg'],
  }),
])
