import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  chmodSync,
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
  'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
  'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  'pnpm/action-setup@f40ffcd9367d9f12939873eb1018b921a783ffaa',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
  'codecov/codecov-action@04b047e8bb82a0c002c8312c1c880fbc6a999d45',
])

const EXPECTED_ACTION_REFS = [
  'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
  'pnpm/action-setup@f40ffcd9367d9f12939873eb1018b921a783ffaa',
  'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  'codecov/codecov-action@04b047e8bb82a0c002c8312c1c880fbc6a999d45',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
  'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
]

const CODECOV_SECRET_REFERENCE = '${{ secrets.CODECOV_TOKEN }}'
const NPM_SECRET_REFERENCE = '${{ secrets.NPM_TOKEN }}'
const NPM_REGISTRY = 'https://registry.npmjs.org'
const PROVENANCE_PREDICATE = 'https://slsa.dev/provenance/v1'
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
    ['quality', 'consumer-compatibility', 'publish'],
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
  const consumer = document.jobs['consumer-compatibility']
  const publish = document.jobs.publish
  assert.equal(
    Object.hasOwn(quality, 'permissions'),
    false,
    'quality must inherit the read-only workflow permissions'
  )
  assert.equal(
    Object.hasOwn(consumer, 'permissions'),
    false,
    'consumer-compatibility must inherit the read-only workflow permissions'
  )
  assert.deepEqual(publish.permissions, {
    contents: 'read',
    'id-token': 'write',
  })

  const codecovStep = findWorkflowStep(quality, 'Upload to Codecov')
  const publishStep = findWorkflowStep(publish, 'Publish npm packages')
  assert.equal(codecovStep.with?.token, CODECOV_SECRET_REFERENCE)
  assert.equal(publishStep.env?.NODE_AUTH_TOKEN, NPM_SECRET_REFERENCE)
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

function publishWorkflowScript() {
  const document = parseYaml(workflow)
  return findWorkflowStep(document.jobs.publish, 'Publish npm packages').run
}

function releaseTarballPath(root, stem, version = '5.0.0') {
  return join(root, 'artifacts', 'npm', `figmavars-${stem}-${version}.tgz`)
}

function validRegistryMetadata(root, { name, stem }, version = '5.0.0') {
  const integrity = `sha512-${createHash('sha512')
    .update(readFileSync(releaseTarballPath(root, stem, version)))
    .digest('base64')}`
  return {
    name,
    version,
    dist: {
      integrity,
      attestations: {
        url: `${NPM_REGISTRY}/-/npm/v1/attestations/${name.replace('/', '%2f')}@${version}`,
        provenance: { predicateType: PROVENANCE_PREDICATE },
      },
    },
  }
}

function createPublishHarness() {
  const root = mkdtempSync(join(tmpdir(), 'figmavars-publish-rerun-'))
  const artifactDirectory = join(root, 'artifacts', 'npm')
  const binDirectory = join(root, 'bin')
  const logPath = join(root, 'npm-calls.jsonl')
  mkdirSync(artifactDirectory, { recursive: true })
  mkdirSync(binDirectory)
  writeFileSync(
    join(artifactDirectory, 'manifest.json'),
    `${JSON.stringify({ version: '5.0.0' })}\n`
  )
  for (const { name, stem } of RELEASE_PUBLISH_PACKAGES) {
    writeFileSync(releaseTarballPath(root, stem), `${name} release bytes\n`)
  }

  const npmPath = join(binDirectory, 'npm')
  writeFileSync(
    npmPath,
    [
      '#!/usr/bin/env node',
      "import { appendFileSync } from 'node:fs'",
      'const args = process.argv.slice(2)',
      "appendFileSync(process.env.NPM_MOCK_LOG, JSON.stringify(args) + '\\n')",
      "const states = JSON.parse(process.env.NPM_MOCK_STATES || '{}')",
      "if (args[0] === 'view') {",
      '  const state = states[args[1]]',
      '  if (!state) {',
      "    process.stderr.write('npm error code E500\\nmissing mock state\\n')",
      '    process.exit(1)',
      '  }',
      "  if (state.kind === 'missing') {",
      "    process.stderr.write('npm error code E404\\n')",
      '    process.exit(1)',
      '  }',
      "  if (state.kind === 'error') {",
      "    process.stderr.write(state.stderr || 'npm error code E500\\n')",
      '    process.exit(state.status || 1)',
      '  }',
      "  if (state.kind === 'raw') {",
      "    process.stdout.write(state.output || '')",
      '    process.exit(0)',
      '  }',
      '  process.stdout.write(JSON.stringify(state.metadata))',
      '  process.exit(0)',
      '}',
      "if (args[0] === 'publish') {",
      '  const state = states.__publish?.[args[1]]',
      "  if (state?.kind === 'error') {",
      "    process.stderr.write(state.stderr || 'npm error code E500\\n')",
      '    process.exit(state.status || 1)',
      '  }',
      '  process.exit(0)',
      '}',
      "process.stderr.write('unexpected npm command\\n')",
      'process.exit(1)',
      '',
    ].join('\n')
  )
  chmodSync(npmPath, 0o755)

  return {
    binDirectory,
    root,
    run(states) {
      writeFileSync(logPath, '')
      const result = spawnSync('bash', ['-c', publishWorkflowScript()], {
        cwd: root,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binDirectory}:${process.env.PATH}`,
          NPM_MOCK_LOG: logPath,
          NPM_MOCK_STATES: JSON.stringify(states),
          NODE_AUTH_TOKEN: 'figmavars-test-token',
          NPM_CONFIG_PROVENANCE: 'true',
        },
      })
      const log = readFileSync(logPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line))
      return { ...result, log }
    },
  }
}

function assertStrictArtifactValidation(job, { requireTag }) {
  const step = extractNamedStep(job, 'Validate release artifact boundary')
  assert.match(step, /node --input-type=module/)
  assert.match(
    step,
    /readdirSync\(artifactDirectory, \{ withFileTypes: true \}\)/
  )
  assert.match(step, /entries\.length !== 7/)
  assert.match(step, /!entry\.isFile\(\) \|\| entry\.isSymbolicLink\(\)/)
  assert.match(step, /hasExactKeys\(manifest, \['version', 'artifacts'\]\)/)
  assert.match(
    step,
    /\^\(0\|\[1-9\]\\d\*\)\\\.\(0\|\[1-9\]\\d\*\)\\\.\(0\|\[1-9\]\\d\*\)\$\//
  )
  assert.match(
    step,
    /manifest\.artifacts\.length !== expectedArtifacts\.length/
  )
  assert.match(step, /\^\[a-f0-9\]\{64\}\$\//)
  assert.match(step, /canonicalChecksums/)
  assert.match(step, /createHash\('sha256'\)/)
  assert.match(step, /computedDigest !== artifact\.sha256/)

  for (const [name, file] of [
    ['@figmavars/core', 'figmavars-core-${version}.tgz'],
    ['@figmavars/dtcg', 'figmavars-dtcg-${version}.tgz'],
    ['@figmavars/cli', 'figmavars-cli-${version}.tgz'],
    ['@figmavars/hooks', 'figmavars-hooks-${version}.tgz'],
    ['@figmavars/mcp', 'figmavars-mcp-${version}.tgz'],
  ]) {
    assert.match(step, new RegExp(name.replace('/', '\\/')))
    assert.match(step, new RegExp(file.replaceAll('$', '\\$')))
  }

  if (requireTag) {
    assert.match(step, /GITHUB_REF_NAME/)
    assert.match(step, /`v\$\{version\}`/)
  }
  return step
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
  const changesetConfigUrl = new URL('../.changeset/config.json', import.meta.url)
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

test('pins repository actions and exposes only the three reviewed jobs', () => {
  const document = assertWorkflowTrustPolicy(workflow)
  const jobs = extractWorkflowJobs(workflow)
  const actionRefs = collectPropertyValues(document, 'uses')

  assert.deepEqual(
    [...jobs.keys()],
    ['quality', 'consumer-compatibility', 'publish']
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
  const consumer = jobs.get('consumer-compatibility')
  const publish = jobs.get('publish')
  assert.ok(quality)
  assert.ok(consumer)
  assert.ok(publish)
  assert.equal(occurrences(workflow, 'actions/checkout@'), 1)
  assert.equal(occurrences(workflow, 'pnpm/action-setup@'), 1)
  assert.equal(occurrences(workflow, 'actions/setup-node@'), 3)
  assert.equal(occurrences(workflow, 'actions/download-artifact@'), 2)
  assert.match(quality, /actions\/checkout@[a-f0-9]{40}/)
  assert.match(quality, /pnpm\/action-setup@[a-f0-9]{40}/)
  assert.doesNotMatch(consumer, /actions\/checkout@|pnpm\/action-setup@/)
  assert.doesNotMatch(publish, /actions\/checkout@|pnpm\/action-setup@/)
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
    '  consumer-compatibility:\n',
    [
      '  consumer-compatibility:',
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
  const consumer = jobs.get('consumer-compatibility')
  const publish = jobs.get('publish')
  assert.ok(quality)
  assert.ok(consumer)
  assert.ok(publish)

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
  assert.equal(occurrences(workflow, 'NODE_AUTH_TOKEN:'), 1)
  assert.equal(occurrences(workflow, 'NPM_CONFIG_PROVENANCE:'), 1)
  assert.equal(occurrences(workflow, 'secrets.NPM_TOKEN'), 1)
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
      'git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
      'pnpm run check:release:built',
      'codecov/codecov-action@04b047e8bb82a0c002c8312c1c880fbc6a999d45',
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
  const consumer = extractWorkflowJobs(workflow).get('consumer-compatibility')
  assert.ok(consumer)
  assert.match(consumer, /needs: quality/)
  assert.match(consumer, /node-version: 24\.18\.0/)
  assert.doesNotMatch(consumer, /cache:/)
  assert.doesNotMatch(consumer, /\$\{\{\s*secrets\.|id-token:\s*write/)
  assert.doesNotMatch(
    consumer,
    /pnpm install|pnpm run (?:build|typecheck|test)|actions\/checkout@|pnpm\/action-setup@/
  )

  const download = extractNamedStep(consumer, 'Download npm release artifact')
  assert.match(download, /name: npm-packages-\$\{\{ github\.sha \}\}/)
  assert.match(download, /path: artifacts\/npm/)
  assert.doesNotMatch(download, /run-id:/)
  assertStrictArtifactValidation(consumer, { requireTag: true })

  const install = extractNamedStep(consumer, 'Install and smoke-test tarballs')
  for (const flag of [
    'NPM_CONFIG_USERCONFIG=/dev/null npm install',
    '--registry=https://registry.npmjs.org',
    '--engine-strict',
    '--ignore-scripts',
    '--package-lock=false',
    '--no-save',
    '--audit=false',
    '--fund=false',
  ]) {
    assert.match(install, new RegExp(flag.replaceAll('/', '\\/')))
  }
  assert.match(install, /ARTIFACT_DIR="\$\(realpath artifacts\/npm\)"/)

  const tarballs = [
    '"$ARTIFACT_DIR/figmavars-core-$VERSION.tgz"',
    '"$ARTIFACT_DIR/figmavars-dtcg-$VERSION.tgz"',
    '"$ARTIFACT_DIR/figmavars-cli-$VERSION.tgz"',
    '"$ARTIFACT_DIR/figmavars-hooks-$VERSION.tgz"',
    '"$ARTIFACT_DIR/figmavars-mcp-$VERSION.tgz"',
  ]
  assertInOrder(install, tarballs, 'consumer tarball install')
  for (const tarball of tarballs) assert.equal(occurrences(install, tarball), 1)

  for (const specifier of [
    '@figmavars/core',
    '@figmavars/core/types',
    '@figmavars/dtcg',
    '@figmavars/hooks',
    '@figmavars/hooks/core',
    '@figmavars/mcp',
  ]) {
    assert.match(install, new RegExp(`import\\('${specifier}'\\)`))
  }
  assert.match(install, /mkdir -p dist/)
  assert.match(install, /node dist\/index\.js/)
  for (const specifier of [
    '@figmavars/core',
    '@figmavars/core/types',
    '@figmavars/dtcg',
    '@figmavars/hooks',
    '@figmavars/hooks/core',
  ]) {
    assert.match(install, new RegExp(`require\\('${specifier}'\\)`))
  }
  for (const bin of ['figma-vars', 'figma-vars-export', 'figma-vars-mcp']) {
    assert.match(install, new RegExp(`node_modules/\\.bin/${bin} --help`))
  }
  assertInOrder(
    consumer,
    [
      'Validate release artifact boundary',
      'sha256sum --check SHA256SUMS',
      'NPM_CONFIG_USERCONFIG=/dev/null npm install',
      "await import('@figmavars/core')",
      'mkdir -p dist',
      'node dist/index.js',
      './node_modules/.bin/figma-vars --help',
    ],
    'consumer validation and smoke flow'
  )
})

test('publishes only independently validated stable tarballs', () => {
  const workflowDocument = assertWorkflowTrustPolicy(workflow)
  const jobs = extractWorkflowJobs(workflow)
  const consumer = jobs.get('consumer-compatibility')
  const publish = jobs.get('publish')
  assert.ok(consumer)
  assert.ok(publish)
  assert.equal(workflowDocument.jobs.publish.environment, 'npm')
  assert.match(publish, /needs: \[quality, consumer-compatibility\]/)
  assert.match(publish, /if: github\.ref_type == 'tag'/)
  assert.match(publish, /node-version: 24\.18\.0/)
  assert.match(publish, /registry-url: ['"]https:\/\/registry\.npmjs\.org['"]/)
  assert.match(publish, /scope: ['"]@figmavars['"]/)
  assert.doesNotMatch(publish, /cache:|actions\/checkout@|pnpm\/action-setup@/)
  assert.doesNotMatch(
    publish,
    /npm install|pnpm|pnpm run|turbo|test:|run: .*build/
  )

  const download = extractNamedStep(publish, 'Download npm release artifact')
  assert.match(download, /name: npm-packages-\$\{\{ github\.sha \}\}/)
  assert.match(download, /path: artifacts\/npm/)
  assert.doesNotMatch(download, /run-id:/)
  const consumerValidation = assertStrictArtifactValidation(consumer, {
    requireTag: true,
  })
  const publishValidation = assertStrictArtifactValidation(publish, {
    requireTag: true,
  })
  assert.equal(publishValidation, consumerValidation)

  const publishStep = extractNamedStep(publish, 'Publish npm packages')
  const commands = ['core', 'dtcg', 'cli', 'hooks', 'mcp'].map(
    packageName =>
      `npm publish "artifacts/npm/figmavars-${packageName}-\${VERSION}.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts`
  )
  assertInOrder(publishStep, commands, 'npm publication')
  for (const command of commands) {
    assert.equal(occurrences(publishStep, command), 1)
  }
  const stateChecks = RELEASE_PUBLISH_PACKAGES.map(
    ({ name, stem }) =>
      `${stem.toUpperCase()}_STATE=$(release_state "${name}" "artifacts/npm/figmavars-${stem}-\${VERSION}.tgz")`
  )
  assertInOrder(
    publishStep,
    stateChecks.flatMap((stateCheck, index) => [stateCheck, commands[index]]),
    'idempotent npm publication'
  )
  assert.match(
    publishStep,
    /npm view "\$\{package_name\}@\$\{VERSION\}" --json --registry=https:\/\/registry\.npmjs\.org/
  )
  assert.match(publishStep, /createHash\('sha512'\)/)
  assert.match(publishStep, /digest\('base64'\)/)
  assert.match(publishStep, /metadata\.dist\?\.integrity/)
  assert.match(publishStep, /metadata\.dist\?\.attestations\?\.url/)
  assert.match(
    publishStep,
    /metadata\.dist\?\.attestations\?\.provenance\?\.predicateType/
  )
  assert.match(publishStep, /hostname !== 'registry\.npmjs\.org'/)
  assert.match(publishStep, /port !== ''/)
  assert.match(publishStep, /packageName\.replace\('\/', '%2f'\)/)
  assert.match(publishStep, /pathname !== expectedAttestationPath/)
  assert.match(publishStep, /search !== ''/)
  assert.match(publishStep, /hash !== ''/)
  assert.doesNotMatch(publishStep, /pathname\.startsWith/)
  assert.match(publishStep, /https:\/\/slsa\.dev\/provenance\/v1/)
  assert.match(
    publishStep,
    /sed -nE 's\/\^npm \(error\|ERR!\) code \(\[A-Z0-9\]\+\)\$\/\\2\/p'/
  )
  assert.match(publishStep, /"\$error_code" == 'E404'/)
  assert.match(publishStep, /NODE_AUTH_TOKEN: \$\{\{ secrets\.NPM_TOKEN \}\}/)
  assert.match(publishStep, /NPM_CONFIG_PROVENANCE: ['"]true['"]/)
  assert.doesNotMatch(publishStep, /\*\.tgz|artifacts\/npm\/\*|-r publish/)
  assertInOrder(
    publish,
    [
      'Validate release artifact boundary',
      'sha256sum --check SHA256SUMS',
      commands[0],
      commands[4],
    ],
    'publish validation and release flow'
  )
})

test('re-runs a partial publication from the same artifact without republishing', () => {
  const harness = createPublishHarness()
  try {
    const missingStates = Object.fromEntries(
      RELEASE_PUBLISH_PACKAGES.map(({ name }) => [
        `${name}@5.0.0`,
        { kind: 'missing' },
      ])
    )
    const first = harness.run({
      ...missingStates,
      __publish: {
        'artifacts/npm/figmavars-hooks-5.0.0.tgz': {
          kind: 'error',
          stderr: 'npm error code E503\n',
        },
      },
    })
    assert.notEqual(first.status, 0)
    assert.deepEqual(
      first.log.filter(args => args[0] === 'publish').map(args => args[1]),
      [
        'artifacts/npm/figmavars-core-5.0.0.tgz',
        'artifacts/npm/figmavars-dtcg-5.0.0.tgz',
        'artifacts/npm/figmavars-cli-5.0.0.tgz',
        'artifacts/npm/figmavars-hooks-5.0.0.tgz',
      ]
    )

    const rerunStates = { ...missingStates }
    for (const config of RELEASE_PUBLISH_PACKAGES.slice(0, 3)) {
      rerunStates[`${config.name}@5.0.0`] = {
        kind: 'present',
        metadata: validRegistryMetadata(harness.root, config),
      }
    }
    const rerun = harness.run(rerunStates)
    assert.equal(rerun.status, 0, rerun.stderr)
    assert.deepEqual(
      rerun.log.filter(args => args[0] === 'view'),
      RELEASE_PUBLISH_PACKAGES.map(({ name }) => [
        'view',
        `${name}@5.0.0`,
        '--json',
        `--registry=${NPM_REGISTRY}`,
      ])
    )
    assert.deepEqual(
      rerun.log.filter(args => args[0] === 'publish').map(args => args[1]),
      [
        'artifacts/npm/figmavars-hooks-5.0.0.tgz',
        'artifacts/npm/figmavars-mcp-5.0.0.tgz',
      ]
    )
  } finally {
    rmSync(harness.root, { recursive: true, force: true })
  }
})

test('fails closed before publish on ambiguous or invalid registry state', async t => {
  const cases = [
    {
      name: 'non-E404 error',
      state: {
        kind: 'error',
        stderr: 'npm error code E500\nrequest context mentioned E404\n',
      },
    },
    { name: 'malformed JSON', state: { kind: 'raw', output: '{' } },
    {
      name: 'integrity mismatch',
      mutate(metadata) {
        metadata.dist.integrity = 'sha512-not-the-local-tarball'
      },
    },
    {
      name: 'missing attestation URL',
      mutate(metadata) {
        delete metadata.dist.attestations.url
      },
    },
    {
      name: 'invalid attestation URL',
      mutate(metadata) {
        metadata.dist.attestations.url = 'not-a-valid-url'
      },
    },
    {
      name: 'wrong attestation origin',
      mutate(metadata) {
        metadata.dist.attestations.url =
          'https://attacker.example/-/npm/v1/attestations/@figmavars%2fcore@5.0.0'
      },
    },
    {
      name: 'wrong attestation path',
      mutate(metadata) {
        metadata.dist.attestations.url =
          'https://registry.npmjs.org/not-an-attestation/core@5.0.0'
      },
    },
    {
      name: 'non-default attestation port',
      mutate(metadata) {
        metadata.dist.attestations.url =
          'https://registry.npmjs.org:444/-/npm/v1/attestations/@figmavars%2fcore@5.0.0'
      },
    },
    {
      name: 'wrong attestation package',
      mutate(metadata) {
        metadata.dist.attestations.url =
          'https://registry.npmjs.org/-/npm/v1/attestations/@figmavars%2fdtcg@5.0.0'
      },
    },
    {
      name: 'wrong attestation version',
      mutate(metadata) {
        metadata.dist.attestations.url =
          'https://registry.npmjs.org/-/npm/v1/attestations/@figmavars%2fcore@5.0.1'
      },
    },
    {
      name: 'attestation path suffix',
      mutate(metadata) {
        metadata.dist.attestations.url += '/extra'
      },
    },
    {
      name: 'attestation query',
      mutate(metadata) {
        metadata.dist.attestations.url += '?package=@figmavars/core'
      },
    },
    {
      name: 'attestation fragment',
      mutate(metadata) {
        metadata.dist.attestations.url += '#other-version'
      },
    },
    {
      name: 'wrong provenance predicate',
      mutate(metadata) {
        metadata.dist.attestations.provenance.predicateType =
          'https://example.com/not-slsa'
      },
    },
    {
      name: 'wrong returned version',
      mutate(metadata) {
        metadata.version = '5.0.1'
      },
    },
  ]

  for (const testCase of cases) {
    await t.test(testCase.name, () => {
      const harness = createPublishHarness()
      try {
        let state = testCase.state
        if (testCase.mutate) {
          const metadata = validRegistryMetadata(
            harness.root,
            RELEASE_PUBLISH_PACKAGES[0]
          )
          testCase.mutate(metadata)
          state = { kind: 'present', metadata }
        }
        const result = harness.run({ '@figmavars/core@5.0.0': state })
        assert.notEqual(result.status, 0)
        assert.deepEqual(
          result.log.filter(args => args[0] === 'view'),
          [
            [
              'view',
              '@figmavars/core@5.0.0',
              '--json',
              `--registry=${NPM_REGISTRY}`,
            ],
          ]
        )
        assert.deepEqual(
          result.log.filter(args => args[0] === 'publish'),
          []
        )
      } finally {
        rmSync(harness.root, { recursive: true, force: true })
      }
    })
  }
})

test('fails closed before registry access when temporary files cannot be created', () => {
  const harness = createPublishHarness()
  try {
    const mktempPath = join(harness.binDirectory, 'mktemp')
    writeFileSync(mktempPath, '#!/bin/sh\nexit 1\n')
    chmodSync(mktempPath, 0o755)
    const result = harness.run({
      '@figmavars/core@5.0.0': { kind: 'missing' },
    })
    assert.notEqual(result.status, 0)
    assert.deepEqual(result.log, [])
  } finally {
    rmSync(harness.root, { recursive: true, force: true })
  }
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
  assert.match(preflight, /Node >=22\.13\.0/)
  assert.match(preflight, /pnpm 11\.10\.0/)
  assert.match(preflight, /Node\s+20\.0\.0[\s\S]*consumer/i)
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
    /current\s+workflow does not create a GitHub Release[\s\S]*manual/i
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
    /GitHub Release[\s\S]*existing tag[\s\S]*without moving the tag/i
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
