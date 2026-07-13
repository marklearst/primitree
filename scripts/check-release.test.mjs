import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  discoverWorkspaceManifestPaths,
  validateReleaseManifests,
} from './check-release.mjs'
import {
  PUBLIC_RELEASE_PACKAGES,
  RELEASE_BUGS,
  RELEASE_FUNDING,
  RELEASE_FUNDING_TYPE,
  RELEASE_HOMEPAGE,
  RELEASE_REPOSITORY,
  RELEASE_REPOSITORY_TYPE,
} from './release-config.mjs'

const licenseText = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8')
const scriptPath = fileURLToPath(
  new URL('./check-release.mjs', import.meta.url)
)

function exportMap(config) {
  return Object.fromEntries(
    config.requiredExports.map(name => {
      const targets = config.exportTargets[name]
      return [
        name,
        targets.length === 1
          ? targets[0]
          : Object.fromEntries(
              targets.map((target, index) => [`condition${index}`, target])
            ),
      ]
    })
  )
}

function canonicalManifest(config) {
  const manifest = {
    name: config.name,
    version: '5.0.0',
    description: `Fixture for ${config.name}`,
    author: 'Mark Learst',
    license: 'MIT',
    type: 'module',
    private: false,
    files: [...config.requiredFiles],
    repository: {
      type: RELEASE_REPOSITORY_TYPE,
      url: RELEASE_REPOSITORY,
      directory: config.path,
    },
    bugs: { url: RELEASE_BUGS },
    homepage: RELEASE_HOMEPAGE,
    engines: { node: '>=20.0.0' },
    publishConfig: { access: 'public', provenance: true },
    funding: { type: RELEASE_FUNDING_TYPE, url: RELEASE_FUNDING },
  }

  if (config.requiredExports.length > 0) {
    manifest.exports = exportMap(config)
  }
  if (config.requiredBin !== undefined) {
    manifest.bin = { [config.requiredBin]: config.requiredBinTarget }
  }
  if (config.requiredInternalRuntimeDependencies.length > 0) {
    manifest.dependencies = Object.fromEntries(
      config.requiredInternalRuntimeDependencies.map(name => [
        name,
        'workspace:*',
      ])
    )
  }

  return manifest
}

function makePublicPackages() {
  return PUBLIC_RELEASE_PACKAGES.map(config => ({
    path: config.path,
    manifestPath: config.manifestPath,
    manifest: canonicalManifest(config),
    licenseText,
  }))
}

function makePrivatePackages() {
  return [
    ['packages/plugin-export', '@figmavars/plugin-export'],
    ['apps/docs', 'figmavars-docs'],
    ['apps/figma-plugin', 'figmavars-plugin'],
    ['apps/playground', 'figmavars-playground'],
  ].map(([path, name]) => ({
    path,
    manifestPath: `${path}/package.json`,
    manifest: { name, version: '5.0.0', private: true },
  }))
}

function validate(overrides = {}) {
  return validateReleaseManifests({
    publicPackages: makePublicPackages(),
    privatePackages: makePrivatePackages(),
    tag: 'v5.0.0',
    ...overrides,
  })
}

function mutatePublic(index, mutate) {
  const packages = makePublicPackages()
  mutate(packages[index], packages)
  return packages
}

test('exports one immutable dependency-ordered release inventory', () => {
  assert.deepEqual(
    PUBLIC_RELEASE_PACKAGES.map(config => config.name),
    [
      '@figmavars/core',
      '@figmavars/dtcg',
      '@figmavars/cli',
      '@figmavars/hooks',
      '@figmavars/mcp',
    ]
  )
  assert.deepEqual(
    PUBLIC_RELEASE_PACKAGES.map(config => [
      config.path,
      config.manifestPath,
      config.requiredInternalRuntimeDependencies,
    ]),
    [
      ['packages/core', 'packages/core/package.json', []],
      ['packages/dtcg', 'packages/dtcg/package.json', ['@figmavars/core']],
      [
        'packages/cli',
        'packages/cli/package.json',
        ['@figmavars/core', '@figmavars/dtcg'],
      ],
      [
        'packages/hooks',
        'packages/hooks/package.json',
        ['@figmavars/core', '@figmavars/dtcg'],
      ],
      [
        'packages/mcp',
        'packages/mcp/package.json',
        ['@figmavars/core', '@figmavars/dtcg'],
      ],
    ]
  )
  assert.equal(Object.isFrozen(PUBLIC_RELEASE_PACKAGES), true)
  for (const config of PUBLIC_RELEASE_PACKAGES) {
    assert.equal(Object.isFrozen(config), true)
    assert.equal(Object.isFrozen(config.requiredFiles), true)
    assert.equal(Object.isFrozen(config.requiredExports), true)
    assert.equal(Object.isFrozen(config.exportTargets), true)
    assert.equal(
      Object.isFrozen(config.requiredInternalRuntimeDependencies),
      true
    )
  }
})

test('accepts complete public metadata and private internal workspaces', () => {
  const result = validate()
  assert.equal(result.version, '5.0.0')
  assert.deepEqual(
    result.publicNames,
    PUBLIC_RELEASE_PACKAGES.map(config => config.name)
  )
})

const metadataCases = [
  ['description', pkg => (pkg.manifest.description = '  '), /description/],
  ['license', pkg => (pkg.manifest.license = 'ISC'), /MIT license/],
  ['author', pkg => (pkg.manifest.author = 'Someone Else'), /Mark Learst/],
  ['module type', pkg => (pkg.manifest.type = 'commonjs'), /type module/],
  [
    'repository type',
    pkg => (pkg.manifest.repository.type = 'svn'),
    /repository type/,
  ],
  [
    'repository URL',
    pkg => (pkg.manifest.repository.url = 'https://example.test/repo'),
    /repository URL/,
  ],
  [
    'repository directory',
    pkg => (pkg.manifest.repository.directory = 'packages/wrong'),
    /repository\.directory/,
  ],
  [
    'homepage',
    pkg => (pkg.manifest.homepage = 'https://example.test'),
    /homepage/,
  ],
  [
    'bugs URL',
    pkg => (pkg.manifest.bugs.url = 'https://example.test/issues'),
    /bugs URL/,
  ],
  [
    'funding type',
    pkg => (pkg.manifest.funding.type = 'individual'),
    /funding type/,
  ],
  [
    'funding URL',
    pkg => (pkg.manifest.funding.url = 'https://example.test/fund'),
    /funding URL/,
  ],
  [
    'consumer engine',
    pkg => (pkg.manifest.engines.node = '>=22'),
    /support Node >=20\.0\.0/,
  ],
  [
    'publish access',
    pkg => (pkg.manifest.publishConfig.access = 'restricted'),
    /publishConfig\.access/,
  ],
  [
    'publish provenance',
    pkg => (pkg.manifest.publishConfig.provenance = false),
    /publishConfig\.provenance/,
  ],
  [
    'publish redirect key',
    pkg => (pkg.manifest.publishConfig.registry = 'https://example.test'),
    /publishConfig keys/,
  ],
]

for (const [name, mutation, pattern] of metadataCases) {
  test(`rejects wrong ${name}`, () => {
    assert.throws(
      () => validate({ publicPackages: mutatePublic(0, mutation) }),
      pattern
    )
  })
}

test('rejects missing, extra, duplicate, and malformed files entries', () => {
  for (const mutation of [
    pkg => pkg.manifest.files.pop(),
    pkg => pkg.manifest.files.push('README.md'),
    pkg => pkg.manifest.files.push('dist'),
    pkg => (pkg.manifest.files = new Set(['dist'])),
  ]) {
    assert.throws(
      () => validate({ publicPackages: mutatePublic(0, mutation) }),
      /files must be exactly/
    )
  }
})

test('rejects missing, extra, malformed, and redirected export targets', () => {
  const mutations = [
    pkg => delete pkg.manifest.exports['./types'],
    pkg => (pkg.manifest.exports['./extra'] = './dist/extra.js'),
    pkg => (pkg.manifest.exports = new Map()),
    pkg => (pkg.manifest.exports['.'] = []),
    pkg => (pkg.manifest.exports['.'].condition0 = '../outside.js'),
    pkg => (pkg.manifest.exports['.'].condition0 = './dist/wrong.js'),
  ]
  for (const mutation of mutations) {
    assert.throws(
      () => validate({ publicPackages: mutatePublic(0, mutation) }),
      /export/
    )
  }
})

test('rejects missing, extra, malformed, and redirected bin targets', () => {
  const mutations = [
    pkg => delete pkg.manifest.bin['figma-vars'],
    pkg => (pkg.manifest.bin.extra = './dist/extra.js'),
    pkg => (pkg.manifest.bin = new Map()),
    pkg => (pkg.manifest.bin['figma-vars'] = '../outside.js'),
  ]
  for (const mutation of mutations) {
    assert.throws(
      () => validate({ publicPackages: mutatePublic(2, mutation) }),
      /bin/
    )
  }
})

test('rejects a missing, unexpected, misplaced, or non-workspace internal edge', () => {
  const mutations = [
    pkg => delete pkg.manifest.dependencies['@figmavars/core'],
    pkg => (pkg.manifest.dependencies['@figmavars/hooks'] = 'workspace:*'),
    pkg => (pkg.manifest.dependencies['@figmavars/core'] = '^5.0.0'),
    pkg => {
      delete pkg.manifest.dependencies['@figmavars/core']
      pkg.manifest.devDependencies = { '@figmavars/core': 'workspace:*' }
    },
  ]
  for (const mutation of mutations) {
    assert.throws(
      () => validate({ publicPackages: mutatePublic(2, mutation) }),
      /internal runtime dependencies|workspace:\*|dependencies/
    )
  }
})

test('rejects the legacy namespace anywhere in a public manifest', () => {
  assert.throws(
    () =>
      validate({
        publicPackages: mutatePublic(
          0,
          pkg => (pkg.manifest.keywords = ['@figma-vars/legacy'])
        ),
      }),
    /legacy namespace/
  )
})

test('rejects non-plain package records and manifest containers', () => {
  assert.throws(
    () => validate({ publicPackages: new Map() }),
    /publicPackages must be an array/
  )
  assert.throws(
    () =>
      validate({
        publicPackages: mutatePublic(0, pkg => (pkg.manifest = new Map())),
      }),
    /manifest must be a plain object/
  )
  assert.throws(
    () =>
      validate({
        publicPackages: mutatePublic(0, pkg => (pkg.manifest = new Set())),
      }),
    /manifest must be a plain object/
  )
})

test('rejects missing, duplicate, and sixth public workspaces', () => {
  const missing = makePublicPackages().slice(1)
  assert.throws(
    () => validate({ publicPackages: missing }),
    /missing public workspace packages\/core\/package\.json/
  )

  const duplicate = makePublicPackages()
  duplicate.push(structuredClone(duplicate[0]))
  assert.throws(
    () => validate({ publicPackages: duplicate }),
    /duplicate public workspace packages\/core\/package\.json/
  )

  const sixth = makePublicPackages()
  sixth.push({
    path: 'packages/experimental',
    manifestPath: 'packages/experimental/package.json',
    manifest: {
      name: '@figmavars/experimental',
      version: '5.0.0',
      private: false,
    },
    licenseText,
  })
  assert.throws(
    () => validate({ publicPackages: sixth }),
    /unexpected public workspace packages\/experimental\/package\.json/
  )
})

test('rejects public/private misclassification and duplicate workspace paths', () => {
  assert.throws(
    () =>
      validate({
        publicPackages: mutatePublic(0, pkg => (pkg.manifest.private = true)),
      }),
    /must be publishable/
  )

  const privatePackages = makePrivatePackages()
  privatePackages[0].manifest.private = false
  assert.throws(
    () => validate({ privatePackages }),
    /packages\/plugin-export\/package\.json must be private/
  )

  const duplicatePrivate = makePrivatePackages()
  duplicatePrivate.push(structuredClone(duplicatePrivate[0]))
  assert.throws(
    () => validate({ privatePackages: duplicatePrivate }),
    /duplicate workspace packages\/plugin-export\/package\.json/
  )
})

test('rejects wrong names, license copies, versions, and tags', () => {
  assert.throws(
    () =>
      validate({
        publicPackages: mutatePublic(
          0,
          pkg => (pkg.manifest.name = '@figmavars/not-core')
        ),
      }),
    /must be named @figmavars\/core/
  )
  assert.throws(
    () =>
      validate({
        publicPackages: mutatePublic(0, pkg => (pkg.licenseText = undefined)),
      }),
    /packages\/core\/LICENSE must match/
  )
  assert.throws(
    () =>
      validate({
        publicPackages: mutatePublic(
          0,
          pkg => (pkg.manifest.version = '5.0.1')
        ),
      }),
    /all public packages must use one version/
  )
  assert.throws(
    () =>
      validate({
        publicPackages: makePublicPackages().map(pkg => ({
          ...pkg,
          manifest: { ...pkg.manifest, version: '5.0.0-rc.1' },
        })),
        tag: undefined,
      }),
    /must use MAJOR\.MINOR\.PATCH/
  )
  assert.throws(
    () => validate({ tag: 'release-5.0.0' }),
    /vMAJOR\.MINOR\.PATCH/
  )
  assert.throws(() => validate({ tag: 'v5.0.1' }), /does not match/)
})

test('rejects private workspace version drift', () => {
  const privatePackages = makePrivatePackages()
  privatePackages[0].manifest.version = '4.0.0'
  assert.throws(
    () => validate({ privatePackages }),
    /packages\/plugin-export\/package\.json must use version 5\.0\.0/
  )
})

test('discovers workspace manifests without following symlink entries', t => {
  const root = mkdtempSync(join(tmpdir(), 'figmavars-release-discovery-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'packages', 'real'), { recursive: true })
  mkdirSync(join(root, 'apps'), { recursive: true })
  writeFileSync(join(root, 'packages', 'real', 'package.json'), '{}\n')

  assert.deepEqual(discoverWorkspaceManifestPaths(root), [
    'packages/real/package.json',
  ])

  symlinkSync('real', join(root, 'packages', 'linked'))
  assert.throws(
    () => discoverWorkspaceManifestPaths(root),
    /packages\/linked must not be a symbolic link/
  )

  rmSync(join(root, 'packages', 'linked'))
  mkdirSync(join(root, 'packages', 'broken'))
  symlinkSync('missing.json', join(root, 'packages', 'broken', 'package.json'))
  assert.throws(
    () => discoverWorkspaceManifestPaths(root),
    /packages\/broken\/package\.json must be a regular file/
  )
})

test('repository validation is independent of the process cwd', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'figmavars-release-cwd-'))
  try {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REF_TYPE: 'tag',
        GITHUB_REF_NAME: 'v5.0.0',
      },
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(
      result.stdout,
      /Release metadata valid for 5 public packages at 5\.0\.0/
    )
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('a tag ref without a tag name fails closed', () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_REF_TYPE: 'tag',
      GITHUB_REF_NAME: '',
    },
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /release tag .* must use vMAJOR\.MINOR\.PATCH/)
})
