import assert from 'node:assert/strict'
import {
  existsSync,
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
import { parse as parseYaml } from 'yaml'
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
const workflow = readFileSync(
  new URL('../.github/workflows/ci.yml', import.meta.url),
  'utf8'
)
const rootManifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
)
const contributing = readFileSync(
  new URL('../CONTRIBUTING.md', import.meta.url),
  'utf8'
)
const announcement = readFileSync(
  new URL('../docs/launch/announcement.md', import.meta.url),
  'utf8'
)
const v5ReleaseNotesUrl = new URL('../docs/launch/v5.0.0.md', import.meta.url)
const v5ReleaseNotes = existsSync(v5ReleaseNotesUrl)
  ? readFileSync(v5ReleaseNotesUrl, 'utf8')
  : ''
const releaseRunbookUrl = new URL('../docs/releasing.md', import.meta.url)
const releaseRunbook = existsSync(releaseRunbookUrl)
  ? readFileSync(releaseRunbookUrl, 'utf8')
  : ''
const releasePlan = readFileSync(
  new URL(
    '../docs/superpowers/plans/2026-07-13-release-hardening.md',
    import.meta.url
  ),
  'utf8'
)
const qualitySpec = readFileSync(
  new URL(
    '../docs/superpowers/specs/2026-07-13-figmavars-v5-quality-run-design.md',
    import.meta.url
  ),
  'utf8'
)
const workspaceConfig = readFileSync(
  new URL('../pnpm-workspace.yaml', import.meta.url),
  'utf8'
)
const mcpTsupConfig = readFileSync(
  new URL('../packages/mcp/tsup.config.ts', import.meta.url),
  'utf8'
)
const publicManifests = PUBLIC_RELEASE_PACKAGES.map(config =>
  JSON.parse(
    readFileSync(new URL(`../${config.manifestPath}`, import.meta.url), 'utf8')
  )
)

const APPROVED_ACTIONS = new Set([
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
  'codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f',
])

const EXPECTED_ACTION_REFS = [
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  'codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f',
  'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
]

const CODECOV_SECRET_REFERENCE = '${{ secrets.CODECOV_TOKEN }}'
const NPM_SECRET_REFERENCE = '${{ secrets.NPM_TOKEN }}'
const RELEASE_PUBLISH_PACKAGES = [
  { name: '@figmavars/core', stem: 'core' },
  { name: '@figmavars/dtcg', stem: 'dtcg' },
  { name: '@figmavars/cli', stem: 'cli' },
  { name: '@figmavars/hooks', stem: 'hooks' },
  { name: '@figmavars/mcp', stem: 'mcp' },
]

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function collectPropertyValues(value, propertyName, collected = []) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPropertyValues(entry, propertyName, collected)
    }
    return collected
  }
  if (!isPlainRecord(value)) return collected

  for (const [key, child] of Object.entries(value)) {
    if (key === propertyName) collected.push(child)
    collectPropertyValues(child, propertyName, collected)
  }
  return collected
}

function collectSecretOccurrences(value, collected = []) {
  if (typeof value === 'string') {
    if (/\bsecrets\b/i.test(value)) collected.push(value)
    return collected
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectSecretOccurrences(entry, collected)
    return collected
  }
  if (!isPlainRecord(value)) return collected

  for (const [key, child] of Object.entries(value)) {
    if (/\bsecrets\b/i.test(key)) collected.push(`<mapping-key:${key}>`)
    collectSecretOccurrences(child, collected)
  }
  return collected
}

function findWorkflowStep(job, name) {
  assert.ok(Array.isArray(job.steps), `workflow job must define steps: ${name}`)
  const matches = job.steps.filter(step => step?.name === name)
  assert.equal(matches.length, 1, `workflow must define one ${name} step`)
  return matches[0]
}

function assertWorkflowTrustPolicy(source) {
  const document = parseYaml(source)
  assert.ok(isPlainRecord(document), 'workflow must be a YAML mapping')
  assert.ok(isPlainRecord(document.jobs), 'workflow jobs must be a mapping')
  assert.deepEqual(
    Object.keys(document.jobs),
    ['quality', 'packed-consumer', 'publish', 'github-release'],
    'workflow must contain exactly the reviewed jobs'
  )

  const actionRefs = collectPropertyValues(document, 'uses')
  for (const action of actionRefs) {
    assert.equal(typeof action, 'string', 'workflow action must be a string')
    assert.equal(
      APPROVED_ACTIONS.has(action),
      true,
      `unapproved workflow action ${action}`
    )
  }
  assert.deepEqual(
    actionRefs,
    EXPECTED_ACTION_REFS,
    'workflow actions must exactly match the reviewed sequence'
  )

  assert.deepEqual(document.permissions, { contents: 'read' })
  const quality = document.jobs.quality
  const consumer = document.jobs['packed-consumer']
  const publish = document.jobs.publish
  const githubRelease = document.jobs['github-release']
  assert.equal(
    Object.hasOwn(quality, 'permissions'),
    false,
    'quality must inherit the read-only workflow permissions'
  )
  assert.equal(
    Object.hasOwn(consumer, 'permissions'),
    false,
    'packed-consumer must inherit the read-only workflow permissions'
  )
  assert.deepEqual(publish.permissions, {
    contents: 'read',
    'id-token': 'write',
  })
  assert.deepEqual(githubRelease.permissions, { contents: 'write' })

  const codecovStep = findWorkflowStep(quality, 'Upload to Codecov')
  const publishStep = findWorkflowStep(
    publish,
    'Publish and verify npm packages'
  )
  assert.equal(codecovStep.with?.token, CODECOV_SECRET_REFERENCE)
  assert.equal(publishStep.env?.NPM_TOKEN, NPM_SECRET_REFERENCE)
  assert.deepEqual(
    collectSecretOccurrences(document),
    [CODECOV_SECRET_REFERENCE, NPM_SECRET_REFERENCE],
    'workflow may contain only the reviewed secret references'
  )

  return document
}

function extractWorkflowJobs(source) {
  const jobsHeader = /^jobs:\s*$/m.exec(source)
  assert.ok(jobsHeader, 'workflow must contain a top-level jobs mapping')
  const bodyStart = jobsHeader.index + jobsHeader[0].length
  const tail = source.slice(bodyStart)
  const nextTopLevel = /^(?!\s|#)[^\n:]+:\s*$/m.exec(tail)
  const jobsBody =
    nextTopLevel === null ? tail : tail.slice(0, nextTopLevel.index)
  const matches = [...jobsBody.matchAll(/^  ([a-z0-9][a-z0-9-]*):\s*$/gm)]
  const jobs = new Map()
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]
    const next = matches[index + 1]
    jobs.set(
      current[1],
      jobsBody.slice(current.index, next?.index ?? jobsBody.length)
    )
  }
  return jobs
}

function extractNamedStep(job, name) {
  const marker = `      - name: ${name}`
  const start = job.indexOf(marker)
  assert.notEqual(start, -1, `missing workflow step ${name}`)
  const next = job.indexOf('\n      - name:', start + marker.length)
  return job.slice(start, next === -1 ? job.length : next)
}

function assertInOrder(source, markers, label) {
  let previous = -1
  for (const marker of markers) {
    const index = source.indexOf(marker, previous + 1)
    assert.notEqual(index, -1, `${label} must contain ${marker}`)
    assert.ok(
      index > previous,
      `${label} must order ${marker} after its predecessor`
    )
    previous = index
  }
}

function occurrences(source, value) {
  return source.split(value).length - 1
}

function extractMarkdownSection(source, heading) {
  const marker = `${heading}\n`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `missing documentation section ${heading}`)
  const bodyStart = start + marker.length
  const remaining = source.slice(bodyStart)
  const nextHeading = remaining.search(/^## /m)
  return nextHeading === -1 ? remaining : remaining.slice(0, nextHeading)
}

function extractFirstBashBlock(section, label) {
  const match = /```bash\n([\s\S]*?)\n```/.exec(section)
  assert.ok(match, `${label} must contain a bash command block`)
  return match[1]
}

function extractOrderedCodeList(section) {
  return [...section.matchAll(/^\d+\. `([^`]+)`$/gm)].map(match => match[1])
}

function assertNoBlanketTagPush(source) {
  assert.doesNotMatch(
    source,
    /\bgit\s+push[^\n]*(?:--tags\b|refs\/tags\/\*|refs\/tags\/[^\s]*\*)/
  )
}

function exportMap(config) {
  return structuredClone(config.expectedExports)
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
    engines: { node: '>=24.0.0' },
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

function exportSignatures(config) {
  const signatures = []
  function visit(value, path) {
    if (typeof value === 'string') {
      signatures.push(`${path}=${value}`)
      return
    }
    for (const [condition, child] of Object.entries(value)) {
      visit(child, `${path}:${condition}`)
    }
  }
  for (const [name, value] of Object.entries(config.expectedExports ?? {})) {
    visit(value, name)
  }
  return signatures
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
    PUBLIC_RELEASE_PACKAGES.map(config => ({
      name: config.name,
      attwProfile: config.attwProfile,
      requiredFiles: config.requiredFiles,
      requiredBin: config.requiredBin,
      requiredBinTarget: config.requiredBinTarget,
      exportSignatures: exportSignatures(config),
    })),
    [
      {
        name: '@figmavars/core',
        attwProfile: 'node16',
        requiredFiles: ['dist'],
        requiredBin: undefined,
        requiredBinTarget: undefined,
        exportSignatures: [
          '.:import:types=./dist/index.d.ts',
          '.:import:default=./dist/index.js',
          '.:require:types=./dist/index.d.cts',
          '.:require:default=./dist/index.cjs',
          '.:default=./dist/index.js',
          './types:import:types=./dist/types.d.ts',
          './types:import:default=./dist/types.js',
          './types:require:types=./dist/types.d.cts',
          './types:require:default=./dist/types.cjs',
          './types:default=./dist/types.js',
        ],
      },
      {
        name: '@figmavars/dtcg',
        attwProfile: 'strict',
        requiredFiles: ['dist'],
        requiredBin: undefined,
        requiredBinTarget: undefined,
        exportSignatures: [
          '.:import:types=./dist/index.d.ts',
          '.:import:default=./dist/index.js',
          '.:require:types=./dist/index.d.cts',
          '.:require:default=./dist/index.cjs',
          '.:default=./dist/index.js',
        ],
      },
      {
        name: '@figmavars/cli',
        attwProfile: null,
        requiredFiles: ['dist'],
        requiredBin: 'figma-vars',
        requiredBinTarget: './dist/index.js',
        exportSignatures: [],
      },
      {
        name: '@figmavars/hooks',
        attwProfile: 'strict',
        requiredFiles: ['dist', 'scripts/export-variables.mjs'],
        requiredBin: 'figma-vars-export',
        requiredBinTarget: './scripts/export-variables.mjs',
        exportSignatures: [
          '.:import:types=./dist/index.d.ts',
          '.:import:default=./dist/index.mjs',
          '.:require:types=./dist/index.d.cts',
          '.:require:default=./dist/index.cjs',
          '.:default=./dist/index.mjs',
          './core:import:types=./dist/core.d.ts',
          './core:import:default=./dist/core.mjs',
          './core:require:types=./dist/core.d.cts',
          './core:require:default=./dist/core.cjs',
          './core:default=./dist/core.mjs',
        ],
      },
      {
        name: '@figmavars/mcp',
        attwProfile: 'esm-only',
        requiredFiles: ['dist'],
        requiredBin: 'figma-vars-mcp',
        requiredBinTarget: './dist/cli.js',
        exportSignatures: [
          '.:import:types=./dist/index.d.ts',
          '.:import:default=./dist/index.js',
        ],
      },
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
    for (const targets of Object.values(config.exportTargets)) {
      assert.equal(Object.isFrozen(targets), true)
    }
    if (config.expectedExports !== undefined) {
      const pending = [config.expectedExports]
      while (pending.length > 0) {
        const value = pending.pop()
        assert.equal(Object.isFrozen(value), true)
        for (const child of Object.values(value)) {
          if (child !== null && typeof child === 'object') pending.push(child)
        }
      }
    }
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
    /support Node >=24\.0\.0/,
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
      /files/
    )
  }
})

test('rejects missing, extra, malformed, and redirected export targets', () => {
  const mutations = [
    pkg => delete pkg.manifest.exports['./types'],
    pkg => (pkg.manifest.exports['./extra'] = './dist/extra.js'),
    pkg => (pkg.manifest.exports = new Map()),
    pkg => (pkg.manifest.exports['.'] = []),
    pkg => (pkg.manifest.exports['.'].import.default = '../outside.js'),
    pkg => (pkg.manifest.exports['.'].import.default = './dist/wrong.js'),
  ]
  for (const mutation of mutations) {
    assert.throws(
      () => validate({ publicPackages: mutatePublic(0, mutation) }),
      /export/
    )
  }
})

test('rejects changed conditional export semantics even when targets are reused', () => {
  const swapTargets = pkg => {
    const entry = pkg.manifest.exports['.']
    const importTarget = entry.import.default
    entry.import.default = entry.require.default
    entry.require.default = importTarget
  }
  const duplicateCondition = pkg => {
    const entry = pkg.manifest.exports['.']
    entry.browser = entry.import.default
  }
  const reorderConditions = pkg => {
    const entry = pkg.manifest.exports['.']
    pkg.manifest.exports['.'] = {
      require: entry.require,
      import: entry.import,
      default: entry.default,
    }
  }

  for (const mutation of [swapTargets, duplicateCondition, reorderConditions]) {
    assert.throws(
      () => validate({ publicPackages: mutatePublic(0, mutation) }),
      /export .* structure must match the release inventory/
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
    pkg => {
      delete pkg.manifest.dependencies['@figmavars/core']
      pkg.manifest.optionalDependencies = {
        '@figmavars/core': 'workspace:*',
      }
    },
    pkg => {
      delete pkg.manifest.dependencies['@figmavars/core']
      pkg.manifest.peerDependencies = { '@figmavars/core': 'workspace:*' }
    },
    pkg => (pkg.manifest.dependencies = new Map()),
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

test('rejects accessor properties without invoking them', () => {
  let manifestGetterInvoked = false
  const publicPackages = mutatePublic(0, pkg => {
    Object.defineProperty(pkg.manifest, 'description', {
      enumerable: true,
      get() {
        manifestGetterInvoked = true
        throw new Error('getter must not execute')
      },
    })
  })

  assert.throws(
    () => validate({ publicPackages }),
    /description must be an enumerable data property/
  )
  assert.equal(manifestGetterInvoked, false)

  let recordGetterInvoked = false
  const records = makePublicPackages()
  Object.defineProperty(records[0], 'manifestPath', {
    enumerable: true,
    get() {
      recordGetterInvoked = true
      throw new Error('record getter must not execute')
    },
  })
  assert.throws(
    () => validate({ publicPackages: records }),
    /public package\.manifestPath must be an enumerable data property/
  )
  assert.equal(recordGetterInvoked, false)

  let optionGetterInvoked = false
  const options = {
    privatePackages: makePrivatePackages(),
    tag: 'v5.0.0',
  }
  Object.defineProperty(options, 'publicPackages', {
    enumerable: true,
    get() {
      optionGetterInvoked = true
      throw new Error('option getter must not execute')
    },
  })
  assert.throws(
    () => validateReleaseManifests(options),
    /validation options\.publicPackages must be an enumerable data property/
  )
  assert.equal(optionGetterInvoked, false)

  let versionGetterInvoked = false
  const versionAccessorPackages = mutatePublic(0, pkg => {
    Object.defineProperty(pkg.manifest, 'version', {
      enumerable: true,
      get() {
        versionGetterInvoked = true
        throw new Error('version getter must not execute')
      },
    })
  })
  assert.throws(
    () => validate({ publicPackages: versionAccessorPackages }),
    /version must be an enumerable data property/
  )
  assert.equal(versionGetterInvoked, false)

  let licenseGetterInvoked = false
  const licenseAccessorPackages = mutatePublic(0, pkg => {
    pkg.licenseText = {
      get trimEnd() {
        licenseGetterInvoked = true
        throw new Error('license getter must not execute')
      },
    }
  })
  assert.throws(
    () => validate({ publicPackages: licenseAccessorPackages }),
    /packages\/core\/LICENSE must match/
  )
  assert.equal(licenseGetterInvoked, false)

  let tagCoercionInvoked = false
  const hostileTag = {
    [Symbol.toPrimitive]() {
      tagCoercionInvoked = true
      throw new Error('tag coercion must not execute')
    },
  }
  assert.throws(() => validate({ tag: hostileTag }), /release tag <object>/)
  assert.equal(tagCoercionInvoked, false)
})

test('rejects circular manifest data without recursing forever', () => {
  const publicPackages = mutatePublic(0, pkg => {
    pkg.manifest.circular = pkg.manifest
  })
  assert.throws(
    () => validate({ publicPackages }),
    /manifest\.circular must not contain circular data/
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

test('allows private workspace version independence from the public release train', () => {
  const privatePackages = makePrivatePackages()
  privatePackages[0].manifest.version = '4.0.0'
  assert.doesNotThrow(() => validate({ privatePackages }))
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

  rmSync(join(root, 'packages', 'broken'), { recursive: true, force: true })
  mkdirSync(join(root, 'packages', '%2e%2e'))
  writeFileSync(join(root, 'packages', '%2e%2e', 'package.json'), '{}\n')
  assert.deepEqual(discoverWorkspaceManifestPaths(root), [
    'packages/%2e%2e/package.json',
    'packages/real/package.json',
  ])

  rmSync(join(root, 'apps'), { recursive: true, force: true })
  mkdirSync(join(root, 'actual-apps'))
  symlinkSync('actual-apps', join(root, 'apps'))
  assert.throws(
    () => discoverWorkspaceManifestPaths(root),
    /apps must not be a symbolic link/
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

test('requires Node 24 for the source workspace, public packages, and MCP build', () => {
  assert.equal(rootManifest.engines.node, '>=24.0.0')
  assert.equal(rootManifest.engines.pnpm, '>=11.0.0')
  assert.equal(rootManifest.packageManager, 'pnpm@11.10.0')
  assert.deepEqual(
    publicManifests.map(manifest => manifest.engines?.node),
    Array(PUBLIC_RELEASE_PACKAGES.length).fill('>=24.0.0')
  )
  assert.match(mcpTsupConfig, /target: 'node24'/)
})

test('requires the React 19 hooks peer without a React DOM peer', () => {
  const hooks = publicManifests.find(
    manifest => manifest.name === '@figmavars/hooks'
  )
  assert.ok(hooks)
  assert.equal(hooks.peerDependencies?.react, '^19.0.0')
  assert.equal(Object.hasOwn(hooks.peerDependencies ?? {}, 'react-dom'), false)
})

test('configures Changesets for the fixed public release train', () => {
  const changesetConfigUrl = new URL(
    '../.changeset/config.json',
    import.meta.url
  )
  assert.equal(existsSync(changesetConfigUrl), true)
  const changesetConfig = JSON.parse(readFileSync(changesetConfigUrl, 'utf8'))
  assert.deepEqual(changesetConfig.fixed, [
    PUBLIC_RELEASE_PACKAGES.map(config => config.name),
  ])
  assert.equal(changesetConfig.access, 'public')
  assert.equal(changesetConfig.baseBranch, 'main')
  assert.equal(changesetConfig.privatePackages.version, false)
})

test('keeps only the intended pnpm workspace build policy', () => {
  assert.match(
    workspaceConfig,
    /\nallowBuilds:\n  esbuild: true\n  sharp: true(?:\n|$)/
  )
  assert.doesNotMatch(workspaceConfig, /onlyBuiltDependencies/)
  assert.doesNotMatch(workspaceConfig, /minimumReleaseAgeExclude/)
})

test('runs the focused release workflow helpers in the root test command', () => {
  assert.equal(
    rootManifest.scripts['test:release-workflow'],
    'node --test scripts/release-publish.test.mjs scripts/github-release.test.mjs'
  )
  assert.match(rootManifest.scripts.test, /pnpm run test:release-workflow/)
})

test('pins repository actions and exposes only the four reviewed jobs', () => {
  const document = assertWorkflowTrustPolicy(workflow)
  const jobs = extractWorkflowJobs(workflow)
  const actionRefs = collectPropertyValues(document, 'uses')

  assert.deepEqual(
    [...jobs.keys()],
    ['quality', 'packed-consumer', 'publish', 'github-release']
  )
  assert.ok(actionRefs.length > 0)
  for (const action of actionRefs) {
    assert.equal(
      APPROVED_ACTIONS.has(action),
      true,
      `unapproved workflow action ${action}`
    )
    assert.match(action, /@[a-f0-9]{40}$/)
  }
  for (const action of APPROVED_ACTIONS) {
    assert.ok(actionRefs.includes(action), `missing approved action ${action}`)
  }

  const quality = jobs.get('quality')
  const consumer = jobs.get('packed-consumer')
  const publish = jobs.get('publish')
  const githubRelease = jobs.get('github-release')
  assert.ok(quality)
  assert.ok(consumer)
  assert.ok(publish)
  assert.ok(githubRelease)
  assert.equal(occurrences(workflow, 'actions/checkout@'), 4)
  assert.equal(occurrences(workflow, 'pnpm/action-setup@'), 1)
  assert.equal(occurrences(workflow, 'actions/setup-node@'), 4)
  assert.equal(occurrences(workflow, 'actions/download-artifact@'), 3)
  assert.match(quality, /actions\/checkout@[a-f0-9]{40}/)
  assert.match(quality, /pnpm\/action-setup@[a-f0-9]{40}/)
  assert.match(consumer, /actions\/checkout@[a-f0-9]{40}/)
  assert.match(publish, /actions\/checkout@[a-f0-9]{40}/)
  assert.match(githubRelease, /actions\/checkout@[a-f0-9]{40}/)
  assert.doesNotMatch(
    `${consumer}\n${publish}\n${githubRelease}`,
    /pnpm\/action-setup@/
  )
})

test('rejects YAML forms that bypass workflow trust-boundary checks', () => {
  assert.doesNotThrow(() => assertWorkflowTrustPolicy(workflow))

  const rogueJob = workflow.replace(
    '  quality:\n',
    [
      '  "rogue":',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - uses : owner/unreviewed-action@v1',
      '  quality:',
      '',
    ].join('\n')
  )
  assert.throws(
    () => assertWorkflowTrustPolicy(rogueJob),
    /exactly the reviewed jobs/
  )

  const spacedActionKey = workflow.replace(
    /uses: actions\/checkout@[a-f0-9]{40}/,
    'uses : owner/unreviewed-action@v1'
  )
  assert.throws(
    () => assertWorkflowTrustPolicy(spacedActionKey),
    /unapproved workflow action/
  )

  const elevatedQuality = workflow.replace(
    '  quality:\n',
    '  quality:\n    permissions:\n      contents: write\n'
  )
  assert.throws(
    () => assertWorkflowTrustPolicy(elevatedQuality),
    /quality must inherit the read-only workflow permissions/
  )

  const bracketSecret = workflow.replace(
    '  packed-consumer:\n',
    [
      '  packed-consumer:',
      '    env:',
      `      EXFILTRATE: "\${{ secrets['UNREVIEWED_TOKEN'] }}"`,
      '',
    ].join('\n')
  )
  assert.throws(
    () => assertWorkflowTrustPolicy(bracketSecret),
    /only the reviewed secret references/
  )
})

test('freezes workflow triggers permissions concurrency and secret boundaries', () => {
  assertWorkflowTrustPolicy(workflow)
  const jobs = extractWorkflowJobs(workflow)
  const quality = jobs.get('quality')
  const consumer = jobs.get('packed-consumer')
  const publish = jobs.get('publish')
  const githubRelease = jobs.get('github-release')
  assert.ok(quality)
  assert.ok(consumer)
  assert.ok(publish)
  assert.ok(githubRelease)

  assert.match(workflow, /push:\n    branches: \[main\]\n    tags: \['v\*'\]/)
  assert.match(workflow, /pull_request:\n    branches: \[main\]/)
  assert.match(workflow, /^permissions:\n  contents: read$/m)
  assert.match(
    workflow,
    /^concurrency:\n  group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\n  cancel-in-progress: \$\{\{ github\.ref_type != 'tag' \}\}$/m
  )
  assert.doesNotMatch(workflow, /VITE_FIGMA_TOKEN|VITE_FIGMA_FILE_KEY/)
  assert.doesNotMatch(
    quality,
    /id-token:\s*write|NODE_AUTH_TOKEN|NPM_CONFIG_PROVENANCE|secrets\.NPM_TOKEN/
  )
  assert.doesNotMatch(consumer, /id-token:\s*write|\$\{\{\s*secrets\./)
  assert.match(
    publish,
    /permissions:\n      contents: read\n      id-token: write/
  )
  assert.equal(occurrences(workflow, 'id-token: write'), 1)
  assert.equal(occurrences(workflow, 'NPM_TOKEN:'), 1)
  assert.equal(occurrences(workflow, 'secrets.NPM_TOKEN'), 1)
  assert.match(githubRelease, /permissions:\n      contents: write/)
  assert.doesNotMatch(
    githubRelease,
    /environment:\s*npm|id-token:|NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.NPM_TOKEN/
  )
})

test('builds and uploads one exact release artifact in quality', () => {
  const quality = extractWorkflowJobs(workflow).get('quality')
  assert.ok(quality)

  assert.match(quality, /fetch-depth: 0/)
  assert.match(quality, /persist-credentials: false/)
  assert.match(quality, /version: 11\.10\.0/)
  assert.match(quality, /node-version: 24\.18\.0/)
  assert.match(quality, /cache: ['"]?pnpm['"]?/)
  assert.match(quality, /cache-dependency-path: pnpm-lock\.yaml/)
  assertInOrder(
    quality,
    [
      'pnpm install --frozen-lockfile',
      'pnpm run lint',
      'pnpm run format:check',
      'pnpm run typecheck',
      'pnpm run build',
      'pnpm run test',
      'pnpm run test:coverage',
      'pnpm run test:e2e:install',
      'pnpm run test:e2e',
      'pnpm run check:release-metadata',
      'node scripts/release-publish.mjs exact-main',
      'pnpm run check:release:built',
      'codecov/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f',
      'name: npm-packages-${{ github.sha }}',
    ],
    'quality job'
  )
  assert.match(quality, /if: github\.ref_type == 'tag'/)
  assert.match(quality, /\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/)
  assert.match(quality, /path: packages\/\*\/coverage\//)
  for (const packageName of ['core', 'dtcg', 'cli', 'hooks', 'mcp']) {
    assert.match(
      quality,
      new RegExp(`\\./packages/${packageName}/coverage/lcov\\.info`)
    )
  }
  assert.match(quality, /disable_search: true/)
  assert.match(quality, /fail_ci_if_error: true/)

  const upload = extractNamedStep(quality, 'Upload npm release artifact')
  assert.match(upload, /name: npm-packages-\$\{\{ github\.sha \}\}/)
  assert.match(upload, /path: artifacts\/npm\//)
  assert.match(upload, /if-no-files-found: error/)
})

test('tests only downloaded tarballs at the Node 24.18.0 consumer floor', () => {
  const consumer = extractWorkflowJobs(workflow).get('packed-consumer')
  assert.ok(consumer)
  assert.match(consumer, /needs: quality/)
  assert.match(consumer, /node-version: 24\.18\.0/)
  assert.doesNotMatch(consumer, /cache:/)
  assert.doesNotMatch(consumer, /\$\{\{\s*secrets\.|id-token:\s*write/)
  assert.doesNotMatch(
    consumer,
    /\bpnpm\b|npm install --global|--frozen-lockfile/
  )
  assert.match(consumer, /actions\/checkout@[a-f0-9]{40}/)
  assert.match(consumer, /persist-credentials: false/)

  const download = extractNamedStep(consumer, 'Download npm release artifact')
  assert.match(download, /name: npm-packages-\$\{\{ github\.sha \}\}/)
  assert.match(download, /path: artifacts\/npm/)
  assert.doesNotMatch(download, /run-id:/)
  const install = extractNamedStep(consumer, 'Verify and smoke-test tarballs')
  assert.match(install, /node scripts\/release-publish\.mjs packed-consumer/)
  assert.doesNotMatch(install, /npm publish|secrets\.|NPM_TOKEN/)
  assertInOrder(
    consumer,
    [
      'Download npm release artifact',
      'node scripts/release-publish.mjs packed-consumer',
    ],
    'packed consumer validation'
  )
})

test('publishes through one pinned dual-mode helper and then verifies the public registry', () => {
  const workflowDocument = assertWorkflowTrustPolicy(workflow)
  const jobs = extractWorkflowJobs(workflow)
  const publish = jobs.get('publish')
  assert.ok(publish)
  assert.equal(workflowDocument.jobs.publish.environment, 'npm')
  assert.match(publish, /needs: \[quality, packed-consumer\]/)
  assert.match(publish, /if: github\.ref_type == 'tag'/)
  assert.match(publish, /timeout-minutes: 30/)
  assert.match(publish, /node-version: 24\.18\.0/)
  assert.match(publish, /npm install --global npm@11\.18\.0/)
  assert.match(publish, /test "\$\(npm --version\)" = "11\.18\.0"/)
  assert.doesNotMatch(publish, /registry-url:|scope:/)
  assert.doesNotMatch(publish, /pnpm|turbo|run: .*build/)

  const exactMain = extractNamedStep(
    publish,
    'Require tag at current origin main'
  )
  assert.match(exactMain, /node scripts\/release-publish\.mjs exact-main/)
  const publishStep = extractNamedStep(
    publish,
    'Publish and verify npm packages'
  )
  assert.equal(publishStep.env?.includes, undefined)
  assert.match(publishStep, /node scripts\/release-publish\.mjs publish/)
  assert.match(publishStep, /NPM_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/)
  assert.doesNotMatch(publishStep, /NODE_AUTH_TOKEN|registry-url:/)
  const consumerStep = extractNamedStep(
    publish,
    'Verify clean public registry consumer'
  )
  assert.match(
    consumerStep,
    /node scripts\/release-publish\.mjs public-consumer/
  )
  assert.doesNotMatch(consumerStep, /NPM_TOKEN|secrets\.|id-token:/)
  assertInOrder(
    publish,
    [
      'npm install --global npm@11.18.0',
      'test "$(npm --version)" = "11.18.0"',
      'node scripts/release-publish.mjs exact-main',
      'node scripts/release-publish.mjs publish',
      'node scripts/release-publish.mjs public-consumer',
    ],
    'publish and public verification flow'
  )
})

test('creates an immutable-safe GitHub Release in a separate least-privilege job', () => {
  const document = assertWorkflowTrustPolicy(workflow)
  const releaseJob = document.jobs['github-release']
  assert.deepEqual(releaseJob.needs, ['publish'])
  assert.equal(releaseJob.if, "github.ref_type == 'tag'")
  assert.equal(releaseJob['timeout-minutes'], 15)
  assert.deepEqual(releaseJob.permissions, { contents: 'write' })
  assert.equal(Object.hasOwn(releaseJob, 'environment'), false)
  assert.deepEqual(collectSecretOccurrences(releaseJob), [])

  const source = extractWorkflowJobs(workflow).get('github-release')
  assert.ok(source)
  assert.doesNotMatch(
    source,
    /id-token:|NPM_TOKEN|NODE_AUTH_TOKEN|npm install|npm publish|environment:\s*npm/
  )
  assert.match(source, /node-version: 24\.18\.0/)
  const releaseStep = extractNamedStep(
    source,
    'Create or resume GitHub Release'
  )
  assert.match(releaseStep, /node scripts\/github-release\.mjs/)
  assert.match(releaseStep, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/)
  assert.match(source, /docs\/launch\/v5\.0\.0\.md/)
  assert.match(source, /name: npm-packages-\$\{\{ github\.sha \}\}/)
})

test('keeps reviewed v5 release notes project-focused', () => {
  assert.match(v5ReleaseNotes, /^# FigmaVars 5\.0\.0$/m)
  for (const phrase of [
    'DTCG 2025.10',
    '`figma-vars diff`',
    '`@figmavars/hooks`',
    '`@figmavars/mcp`',
    'Node.js 24',
  ]) {
    assert.ok(v5ReleaseNotes.includes(phrase), `release notes need ${phrase}`)
  }
  assert.doesNotMatch(
    v5ReleaseNotes,
    /NPM_TOKEN|OIDC|GitHub Actions|workflow|provenance|publish job|bootstrap/i
  )
  assert.doesNotMatch(v5ReleaseNotes, /—/)
})

test('links one release runbook from maintainer and launch documentation', () => {
  assert.notEqual(releaseRunbook, '', 'docs/releasing.md must exist')
  assert.match(contributing, /\[release runbook\]\(docs\/releasing\.md\)/i)
  assert.match(announcement, /\[release runbook\]\(\.\.\/releasing\.md\)/i)
  assert.doesNotMatch(announcement, /npm publish/)
  assertNoBlanketTagPush(announcement)
})

test('freezes the exact local preflight and supported toolchain boundaries', () => {
  const preflight = extractMarkdownSection(releaseRunbook, '## Local preflight')
  assert.equal(
    extractFirstBashBlock(preflight, 'local preflight'),
    [
      'pnpm install --frozen-lockfile',
      'pnpm run format:check',
      'pnpm run lint',
      'pnpm run typecheck',
      'pnpm run test',
      'pnpm run test:coverage',
      'pnpm run test:e2e',
      'pnpm run check:release',
    ].join('\n')
  )
  assert.match(preflight, /Node 24\.18\.0/)
  assert.match(preflight, /pnpm 11\.10\.0/)
  assert.match(preflight, /npm 11\.18\.0[\s\S]*publish/i)
})

test('documents stable-only semantics and the exact seven-file artifact boundary', () => {
  const semantics = extractMarkdownSection(
    releaseRunbook,
    '## Stable release semantics'
  )
  assert.match(semantics, /stable releases only/i)
  assert.match(semantics, /exact `vMAJOR\.MINOR\.PATCH`/)
  assert.match(semantics, /dist-tag `latest`/)
  assert.match(semantics, /prerelease versions are not supported/i)
  assert.match(semantics, /future[\s\S]*separate design/i)

  const artifactBoundary = extractMarkdownSection(
    releaseRunbook,
    '## Release artifact boundary'
  )
  const expectedFiles = [
    'figmavars-core-$VERSION.tgz',
    'figmavars-dtcg-$VERSION.tgz',
    'figmavars-cli-$VERSION.tgz',
    'figmavars-hooks-$VERSION.tgz',
    'figmavars-mcp-$VERSION.tgz',
    'manifest.json',
    'SHA256SUMS',
  ]
  assert.deepEqual(extractOrderedCodeList(artifactBoundary), expectedFiles)
  assert.match(
    artifactBoundary,
    /exactly seven regular,[\s\S]*non-symlink files/i
  )
  assert.match(
    artifactBoundary,
    /manifest\.json[\s\S]*separate[\s\S]*validation[\s\S]*SHA256SUMS/i
  )
  assert.doesNotMatch(artifactBoundary, /first,[\s\S]*then checks/i)
})

test('keeps dry-run and external npm and GitHub proof boundaries explicit', () => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  const checklist = [...external.matchAll(/^- \[([ xX])\] /gm)]
  assert.equal(checklist.length, 8)
  assert.ok(checklist.every(item => item[1] === ' '))
  for (const phrase of [
    '@figmavars ownership, 2FA, and new-package rights',
    'token-authenticated publish',
    'trusted publishing for all five packages',
    'protected npm and GitHub environments and rulesets',
    'GitHub environment `npm`',
    'stale `v4.2.0` tag',
    '`v5.0.0` only at the final verified commit',
    'single intended tag',
    'npm provenance',
  ]) {
    assert.match(external, new RegExp(phrase.replaceAll('.', '\\.')))
  }
  assert.doesNotMatch(external, /- \[[xX]\]/)
  assertNoBlanketTagPush(releaseRunbook)
  assert.match(
    releaseRunbook,
    /npm publish --dry-run[\s\S]*does not publish or mutate the registry/i
  )
  assert.match(releaseRunbook, /dry-run[\s\S]*can[\s\S]*read credentials/i)
  assert.match(
    releaseRunbook,
    /dry-run[\s\S]*not proof of npm access[\s\S]*provenance/i
  )
  assert.match(
    releaseRunbook,
    /workflow[\s\S]*creates or resumes[\s\S]*GitHub Release/i
  )
  assert.match(external, /may create an unprotected environment record/i)
  assert.match(external, /administrator[\s\S]*before a tag run/i)
})

test('freezes same-byte recovery queries and retries in dependency order', () => {
  const recovery = extractMarkdownSection(
    releaseRunbook,
    '## Partial publication recovery'
  )
  const viewCommands = ['core', 'dtcg', 'cli', 'hooks', 'mcp'].map(
    packageName =>
      `npm view "@figmavars/${packageName}@$VERSION" version --registry=https://registry.npmjs.org`
  )
  const publishCommands = ['core', 'dtcg', 'cli', 'hooks', 'mcp'].map(
    packageName =>
      `npm publish "$ARTIFACT_DIR/figmavars-${packageName}-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts`
  )

  assertInOrder(recovery, viewCommands, 'partial publication queries')
  assertInOrder(recovery, publishCommands, 'same-byte publication retries')
  for (const command of viewCommands) {
    assert.equal(occurrences(releaseRunbook, command), 2)
  }
  for (const command of publishCommands) {
    assert.equal(occurrences(releaseRunbook, command), 1)
  }
  assert.match(recovery, /Only npm `E404` means that a package is missing/)
  assert.match(recovery, /Any other error[\s\S]*stops[\s\S]*recovery/i)
  assert.match(recovery, /same verified bytes/i)
  assert.match(recovery, /Never rebuild/i)
  assert.match(recovery, /shasum -a 256 -c SHA256SUMS/)
  assert.match(recovery, /Linux[\s\S]*sha256sum --check SHA256SUMS/i)
  assert.match(recovery, /Re-run failed jobs/)
  assert.match(recovery, /only supported\s+selective recovery path/i)
  assert.match(recovery, /do not execute[\s\S]*npm publish[\s\S]*locally/i)
})

test('documents dist-tag, invalid-content, and immutable artifact recovery', () => {
  const recovery = extractMarkdownSection(
    releaseRunbook,
    '## Partial publication recovery'
  )
  for (const command of [
    'npm dist-tag ls "@figmavars/core" --registry=https://registry.npmjs.org',
    'npm dist-tag add "@figmavars/core@$VERSION" latest --registry=https://registry.npmjs.org',
    'npm dist-tag rm "@figmavars/core" next --registry=https://registry.npmjs.org',
    'npm deprecate "@figmavars/core@$VERSION" "Use 5.0.1; this release contains invalid package contents" --registry=https://registry.npmjs.org',
    'RUN_ID=123456789',
    'COMMIT_SHA=0123456789abcdef0123456789abcdef01234567',
    'RECOVERY_DIR=$(mktemp -d)',
    'gh run download "$RUN_ID"',
    '--name "npm-packages-$COMMIT_SHA"',
    '--dir "$RECOVERY_DIR"',
  ]) {
    assert.ok(recovery.includes(command), `recovery must contain ${command}`)
  }
  assert.match(recovery, /bad package contents[\s\S]*new patch version/i)
  assert.match(recovery, /do not[\s\S]*(?:overwrite|unpublish)/i)
  assert.match(recovery, /immutable run ID and commit SHA/i)
  assertInOrder(
    recovery,
    [
      'gh run download "$RUN_ID"',
      'ARTIFACT_DIR="$RECOVERY_DIR"',
      'verifyReleaseArtifacts',
      'VERSION=',
      '(cd "$ARTIFACT_DIR" && shasum -a 256 -c SHA256SUMS)',
    ],
    'recovered artifact binding and validation'
  )
})

test('preserves tag and provenance boundaries during recovery', () => {
  const recovery = extractMarkdownSection(
    releaseRunbook,
    '## Partial publication recovery'
  )
  assert.match(recovery, /git tag -d "v\$VERSION"/)
  assert.match(recovery, /git push origin ":refs\/tags\/v\$VERSION"/)
  assert.match(
    recovery,
    /pushed wrong tag[\s\S]*publish job never started[\s\S]*all five/i
  )
  assert.match(recovery, /publish job ever started[\s\S]*never move the tag/i)
  assert.match(recovery, /preserve provenance/i)
  assert.match(
    recovery,
    /GitHub Release[\s\S]*re-run failed jobs[\s\S]*without moving the tag/i
  )
  assert.match(
    recovery,
    /credential[\s\S]*preserve[\s\S]*checksums[\s\S]*only missing[\s\S]*packages/i
  )
  const registryQueries = RELEASE_PUBLISH_PACKAGES.map(
    ({ name }) =>
      `npm view "${name}@$VERSION" version --registry=https://registry.npmjs.org`
  )
  assertInOrder(
    recovery,
    [
      'gh run cancel "$OLD_RUN_ID"',
      'gh run watch "$OLD_RUN_ID"',
      'gh run view "$OLD_RUN_ID" --json status,conclusion,jobs',
      'publish job never started',
      ...registryQueries,
      'git tag -d "v$VERSION"',
      'git push origin ":refs/tags/v$VERSION"',
    ],
    'safe tag replacement'
  )
  assert.match(recovery, /cancel[\s\S]*only if the old run is still active/i)
})

test('rejects blanket tag pushes with or without an explicit remote', () => {
  assertNoBlanketTagPush(releaseRunbook)
  for (const command of [
    'git push --tags',
    'git push origin --tags',
    'git push upstream refs/tags/*',
  ]) {
    assert.throws(() => assertNoBlanketTagPush(`${releaseRunbook}\n${command}`))
  }
})

test('keeps the release plan and specification on same-run resumable recovery', () => {
  for (const document of [releasePlan, qualitySpec]) {
    assert.match(document, /Re-run failed jobs/)
    assert.match(document, /same-run artifact/i)
    assert.match(document, /dist\.integrity/)
    assert.match(document, /dist\.attestations/i)
    assert.match(document, /GitHub environment `npm`/)
    assert.match(document, /publish job never started/i)
    assert.match(document, /all five[\s\S]*E404/i)
  }
})
