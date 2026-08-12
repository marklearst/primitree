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
  validateReleaseCopy,
  validateReleaseManifests,
  validateWorkspaceRootManifest,
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
const versionWorkflowUrl = new URL(
  '../.github/workflows/version-packages.yml',
  import.meta.url
)
const versionWorkflow = existsSync(versionWorkflowUrl)
  ? readFileSync(versionWorkflowUrl, 'utf8')
  : ''
const githubReleaseScript = readFileSync(
  new URL('./github-release.mjs', import.meta.url),
  'utf8'
)
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
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
const v1ReleaseNotesUrl = new URL('../docs/launch/v1.0.0.md', import.meta.url)
const v1ReleaseNotes = existsSync(v1ReleaseNotesUrl)
  ? readFileSync(v1ReleaseNotesUrl, 'utf8')
  : ''
const nextReleaseNotes = readFileSync(
  new URL('../docs/launch/v1.0.0-next.0.md', import.meta.url),
  'utf8'
)
const releaseRunbookUrl = new URL('../docs/releasing.md', import.meta.url)
const releaseRunbook = existsSync(releaseRunbookUrl)
  ? readFileSync(releaseRunbookUrl, 'utf8')
  : ''
const workspaceConfig = readFileSync(
  new URL('../pnpm-workspace.yaml', import.meta.url),
  'utf8'
)
const turboConfig = JSON.parse(
  readFileSync(new URL('../turbo.json', import.meta.url), 'utf8')
)
const mcpTsupConfig = readFileSync(
  new URL('../packages/mcp/tsup.config.ts', import.meta.url),
  'utf8'
)
const dtcgEmit = readFileSync(
  new URL('../packages/dtcg/src/emit.ts', import.meta.url),
  'utf8'
)
const cliTsupConfig = readFileSync(
  new URL('../packages/cli/tsup.config.ts', import.meta.url),
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

const NPM_SECRET_REFERENCE = '${{ secrets.NPM_TOKEN }}'
const VERSION_WORKFLOW_TOKEN_REFERENCE = '${{ github.token }}'
const CHANGESETS_ACTION =
  'changesets/action@a45c4d594aa4e2c509dc14a9f2b3b67ba3780d0d'
const VERSION_WORKFLOW_ACTIONS = [
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  CHANGESETS_ACTION,
]
const RELEASE_PUBLISH_PACKAGES = [
  { name: '@primitree/core', stem: 'core' },
  { name: '@primitree/dtcg', stem: 'dtcg' },
  { name: '@primitree/cli', stem: 'cli' },
  { name: '@primitree/hooks', stem: 'hooks' },
  { name: '@primitree/mcp', stem: 'mcp' },
  { name: 'primitree', stem: 'primitree' },
]
const TRUST_COMMANDS = RELEASE_PUBLISH_PACKAGES.map(
  ({ name }) =>
    `npm trust github '${name}' --repository marklearst/primitree --file ci.yml --environment npm --allow-publish --yes --registry=https://registry.npmjs.org/`
)
const TRUST_LIST_COMMANDS = RELEASE_PUBLISH_PACKAGES.map(
  ({ name }) =>
    `npm trust list '${name}' --registry=https://registry.npmjs.org/`
)
const GITHUB_REPOSITORY = 'marklearst/primitree'
const GITHUB_SECRET_SET_COMMAND = `gh secret set NPM_TOKEN --env npm --repo ${GITHUB_REPOSITORY}`
const GITHUB_SECRET_DELETE_COMMAND = `gh secret delete NPM_TOKEN --env npm --repo ${GITHUB_REPOSITORY}`
const GITHUB_SECRET_LIST_COMMAND = `gh secret list --env npm --repo ${GITHUB_REPOSITORY}`
const VERCEL_PROJECT_ID = 'prj_J9yx9KZeG7q54CWTZm2ik2R4uwAd'
const LEGACY_HOOKS_PACKAGE = `@figma${'-vars'}/hooks`
const LEGACY_DEPRECATION_COMMAND = `npm deprecate "${LEGACY_HOOKS_PACKAGE}@4.0.0" "Moved to @primitree/hooks. See https://primitree.com/docs/hooks/migration" --registry=https://registry.npmjs.org/`

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
  assert.deepEqual(quality.permissions, {
    contents: 'read',
    'id-token': 'write',
  })
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
  assert.deepEqual(codecovStep.with, {
    use_oidc: true,
    files: [
      './packages/core/coverage/lcov.info',
      './packages/dtcg/coverage/lcov.info',
      './packages/cli/coverage/lcov.info',
      './packages/hooks/coverage/lcov.info',
      './packages/mcp/coverage/lcov.info',
    ].join(','),
    disable_search: true,
    fail_ci_if_error: true,
  })
  assert.equal(publishStep.env?.NPM_TOKEN, NPM_SECRET_REFERENCE)
  assert.deepEqual(
    collectSecretOccurrences(document),
    [NPM_SECRET_REFERENCE],
    'workflow may contain only the reviewed secret references'
  )

  return document
}

function assertVersionWorkflowPolicy(source) {
  const document = parseYaml(source)
  assert.ok(isPlainRecord(document), 'version workflow must be a YAML mapping')
  assert.deepEqual(Object.keys(document), [
    'name',
    'on',
    'permissions',
    'concurrency',
    'jobs',
  ])
  assert.equal(document.name, 'Version Packages')
  assert.deepEqual(document.on, { push: { branches: ['main'] } })
  assert.deepEqual(document.permissions, {})
  assert.deepEqual(document.concurrency, {
    group: 'version-packages-${{ github.ref }}',
    'cancel-in-progress': true,
  })
  assert.ok(isPlainRecord(document.jobs), 'version jobs must be a mapping')
  assert.deepEqual(Object.keys(document.jobs), ['version-packages'])

  const job = document.jobs['version-packages']
  assert.deepEqual(Object.keys(job), [
    'runs-on',
    'timeout-minutes',
    'permissions',
    'steps',
  ])
  assert.equal(job['runs-on'], 'ubuntu-latest')
  assert.equal(job['timeout-minutes'], 15)
  assert.deepEqual(job.permissions, {
    contents: 'write',
    'pull-requests': 'write',
  })
  assert.ok(Array.isArray(job.steps))
  assert.deepEqual(
    job.steps.map(step => step.name),
    [
      'Checkout repository',
      'Install pnpm',
      'Setup Node',
      'Install dependencies',
      'Create or update version pull request',
    ]
  )

  assert.deepEqual(
    collectPropertyValues(document, 'uses'),
    VERSION_WORKFLOW_ACTIONS
  )
  for (const action of VERSION_WORKFLOW_ACTIONS) {
    assert.match(action, /@[a-f0-9]{40}$/)
  }
  assert.deepEqual(job.steps[0], {
    name: 'Checkout repository',
    uses: VERSION_WORKFLOW_ACTIONS[0],
    with: {
      'fetch-depth': 0,
      'persist-credentials': false,
    },
  })
  assert.deepEqual(job.steps[1], {
    name: 'Install pnpm',
    uses: VERSION_WORKFLOW_ACTIONS[1],
    with: {
      version: '11.10.0',
      run_install: false,
    },
  })
  assert.deepEqual(job.steps[2], {
    name: 'Setup Node',
    uses: VERSION_WORKFLOW_ACTIONS[2],
    with: {
      'node-version': '24.18.0',
      cache: 'pnpm',
      'cache-dependency-path': 'pnpm-lock.yaml',
    },
  })
  assert.deepEqual(job.steps[3], {
    name: 'Install dependencies',
    run: 'pnpm install --frozen-lockfile --ignore-scripts',
  })
  assert.deepEqual(job.steps[4], {
    name: 'Create or update version pull request',
    uses: CHANGESETS_ACTION,
    with: {
      version: 'pnpm run version-packages',
      createGithubReleases: false,
    },
    env: {
      GITHUB_TOKEN: VERSION_WORKFLOW_TOKEN_REFERENCE,
    },
  })

  assert.deepEqual(collectSecretOccurrences(document), [])
  assert.doesNotMatch(
    source,
    /\bsecrets\b|id-token|NPM_TOKEN|NODE_AUTH_TOKEN|NPM_CONFIG_|provenance|registry-url|environment:|createGithubReleases:\s*true|\b(?:npm|pnpm|changeset)\s+publish\b|^\s+publish:/im
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

function extractBashBlockContaining(section, marker, label) {
  for (const match of section.matchAll(/```bash\n([\s\S]*?)\n```/g)) {
    if (match[1].includes(marker)) return match[1]
  }
  assert.fail(`${label} must contain a bash block with ${marker}`)
}

function extractMarkdownSubsection(source, heading) {
  const marker = `${heading}\n`
  const start = source.indexOf(marker)
  assert.notEqual(start, -1, `missing documentation subsection ${heading}`)
  const bodyStart = start + marker.length
  const remaining = source.slice(bodyStart)
  const nextHeading = remaining.search(/^### /m)
  return nextHeading === -1 ? remaining : remaining.slice(0, nextHeading)
}

function runBash(script, options = {}) {
  return spawnSync('bash', ['-c', script], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    ...options,
  })
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
    version: '1.0.0',
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
    ['packages/plugin-export', '@primitree/plugin-export'],
    ['apps/docs', 'primitree-docs'],
    ['apps/figma-plugin', 'primitree-plugin'],
    ['apps/playground', 'primitree-playground'],
  ].map(([path, name]) => ({
    path,
    manifestPath: `${path}/package.json`,
    manifest: { name, private: true },
  }))
}

function validate(overrides = {}) {
  return validateReleaseManifests({
    publicPackages: makePublicPackages(),
    privatePackages: makePrivatePackages(),
    tag: 'v1.0.0',
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
      '@primitree/core',
      '@primitree/dtcg',
      '@primitree/cli',
      '@primitree/hooks',
      '@primitree/mcp',
      'primitree',
    ]
  )
  assert.deepEqual(
    PUBLIC_RELEASE_PACKAGES.map(config => ({
      name: config.name,
      attwProfile: config.attwProfile,
      requiredFiles: config.requiredFiles,
      requiredDeclarationFiles: config.requiredDeclarationFiles,
      requiredBin: config.requiredBin,
      requiredBinTarget: config.requiredBinTarget,
      exportSignatures: exportSignatures(config),
    })),
    [
      {
        name: '@primitree/core',
        attwProfile: 'node16',
        requiredFiles: ['dist', 'CHANGELOG.md'],
        requiredDeclarationFiles: [
          'dist/index.d.ts',
          'dist/index.d.cts',
          'dist/types.d.ts',
          'dist/types.d.cts',
          'dist/policy.d.ts',
          'dist/policy.d.cts',
        ],
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
          './policy:import:types=./dist/policy.d.ts',
          './policy:import:default=./dist/policy.js',
          './policy:require:types=./dist/policy.d.cts',
          './policy:require:default=./dist/policy.cjs',
          './policy:default=./dist/policy.js',
        ],
      },
      {
        name: '@primitree/dtcg',
        attwProfile: 'strict',
        requiredFiles: ['dist', 'CHANGELOG.md'],
        requiredDeclarationFiles: ['dist/index.d.ts', 'dist/index.d.cts'],
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
        name: '@primitree/cli',
        attwProfile: null,
        requiredFiles: ['dist', 'CHANGELOG.md'],
        requiredDeclarationFiles: ['dist/index.d.ts', 'dist/config.d.ts'],
        requiredBin: 'primitree',
        requiredBinTarget: './dist/index.js',
        exportSignatures: [
          './bin=./dist/index.js',
          './config:types=./dist/config.d.ts',
          './config:import=./dist/config.js',
        ],
      },
      {
        name: '@primitree/hooks',
        attwProfile: 'strict',
        requiredFiles: ['dist', 'CHANGELOG.md'],
        requiredDeclarationFiles: ['dist/index.d.ts', 'dist/index.d.cts'],
        requiredBin: undefined,
        requiredBinTarget: undefined,
        exportSignatures: [
          '.:import:types=./dist/index.d.ts',
          '.:import:default=./dist/index.mjs',
          '.:require:types=./dist/index.d.cts',
          '.:require:default=./dist/index.cjs',
          '.:default=./dist/index.mjs',
        ],
      },
      {
        name: '@primitree/mcp',
        attwProfile: 'esm-only',
        requiredFiles: ['dist', 'CHANGELOG.md'],
        requiredDeclarationFiles: ['dist/index.d.ts', 'dist/cli.d.ts'],
        requiredBin: 'primitree-mcp',
        requiredBinTarget: './dist/cli.js',
        exportSignatures: [
          '.:import:types=./dist/index.d.ts',
          '.:import:default=./dist/index.js',
        ],
      },
      {
        name: 'primitree',
        attwProfile: null,
        requiredFiles: ['bin', 'CHANGELOG.md'],
        requiredDeclarationFiles: [],
        requiredBin: 'primitree',
        requiredBinTarget: './bin/primitree.js',
        exportSignatures: [],
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
      ['packages/dtcg', 'packages/dtcg/package.json', ['@primitree/core']],
      [
        'packages/cli',
        'packages/cli/package.json',
        ['@primitree/core', '@primitree/dtcg'],
      ],
      [
        'packages/hooks',
        'packages/hooks/package.json',
        ['@primitree/core', '@primitree/dtcg'],
      ],
      [
        'packages/mcp',
        'packages/mcp/package.json',
        ['@primitree/core', '@primitree/dtcg'],
      ],
      [
        'packages/primitree',
        'packages/primitree/package.json',
        ['@primitree/cli'],
      ],
    ]
  )
  assert.equal(Object.isFrozen(PUBLIC_RELEASE_PACKAGES), true)
  for (const config of PUBLIC_RELEASE_PACKAGES) {
    assert.equal(Object.isFrozen(config), true)
    assert.equal(Object.isFrozen(config.requiredFiles), true)
    assert.equal(Object.isFrozen(config.requiredDeclarationFiles), true)
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

test('keeps the Primitree extension and release route identifiers', () => {
  assert.match(dtcgEmit, /PRIMITREE_EXTENSION_KEY = 'com\.primitree'/)
  assert.match(releaseRunbook, /https:\/\/primitree\.com/)
  assert.match(v1ReleaseNotes, /^# Primitree 1\.0\.0$/m)
})

test('accepts complete public metadata and private internal workspaces', () => {
  const result = validate()
  assert.equal(result.version, '1.0.0')
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
    /repository\.type/,
  ],
  [
    'repository URL',
    pkg => (pkg.manifest.repository.url = 'https://example.test/repo'),
    /repository\.url/,
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
    /bugs\.url/,
  ],
  [
    'funding type',
    pkg => (pkg.manifest.funding.type = 'individual'),
    /funding\.type/,
  ],
  [
    'funding URL',
    pkg => (pkg.manifest.funding.url = 'https://example.test/fund'),
    /funding\.url/,
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
    pkg => delete pkg.manifest.bin.primitree,
    pkg => (pkg.manifest.bin.extra = './dist/extra.js'),
    pkg => (pkg.manifest.bin = new Map()),
    pkg => (pkg.manifest.bin.primitree = '../outside.js'),
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
    pkg => delete pkg.manifest.dependencies['@primitree/core'],
    pkg => (pkg.manifest.dependencies['@primitree/hooks'] = 'workspace:*'),
    pkg => (pkg.manifest.dependencies['@primitree/core'] = '^1.0.0'),
    pkg => {
      delete pkg.manifest.dependencies['@primitree/core']
      pkg.manifest.devDependencies = { '@primitree/core': 'workspace:*' }
    },
    pkg => {
      delete pkg.manifest.dependencies['@primitree/core']
      pkg.manifest.optionalDependencies = {
        '@primitree/core': 'workspace:*',
      }
    },
    pkg => {
      delete pkg.manifest.dependencies['@primitree/core']
      pkg.manifest.peerDependencies = { '@primitree/core': 'workspace:*' }
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

test('rejects former package scopes anywhere in a public manifest', () => {
  for (const scope of ['@figma-vars/', '@figmavars/']) {
    assert.throws(
      () =>
        validate({
          publicPackages: mutatePublic(
            0,
            pkg => (pkg.manifest.keywords = [`${scope}legacy`])
          ),
        }),
      /former package scope/
    )
  }
})

test('requires private workspaces and the workspace root to omit versions', () => {
  const privatePackages = makePrivatePackages()
  privatePackages[0].manifest.version = '1.0.0'
  assert.throws(
    () => validate({ privatePackages }),
    /private package must not declare a version/
  )

  assert.doesNotThrow(() =>
    validateWorkspaceRootManifest({
      name: 'primitree-workspace',
      private: true,
    })
  )
  assert.throws(
    () =>
      validateWorkspaceRootManifest({
        name: 'primitree-workspace',
        private: true,
        version: '1.0.0',
      }),
    /must not declare a version/
  )
})

test('accepts a coordinated next prerelease version and matching tag', () => {
  const publicPackages = makePublicPackages()
  for (const pkg of publicPackages) pkg.manifest.version = '1.0.0-next.0'

  assert.doesNotThrow(() => validate({ publicPackages, tag: 'v1.0.0-next.0' }))
  assert.throws(
    () => validate({ publicPackages, tag: 'v1.0.0' }),
    /does not match package version/u
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
    tag: 'v1.0.0',
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

test('rejects missing, duplicate, and unexpected public workspaces', () => {
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

  const unexpected = makePublicPackages()
  unexpected.push({
    path: 'packages/experimental',
    manifestPath: 'packages/experimental/package.json',
    manifest: {
      name: '@primitree/experimental',
      version: '1.0.0',
      private: false,
    },
    licenseText,
  })
  assert.throws(
    () => validate({ publicPackages: unexpected }),
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
          pkg => (pkg.manifest.name = '@primitree/not-core')
        ),
      }),
    /must be named @primitree\/core/
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
          manifest: { ...pkg.manifest, version: '1.0.0-rc.1' },
        })),
        tag: undefined,
      }),
    /must use MAJOR\.MINOR\.PATCH or MAJOR\.MINOR\.PATCH-next\.N/
  )
  assert.throws(
    () => validate({ tag: 'release-1.0.0' }),
    /vMAJOR\.MINOR\.PATCH or vMAJOR\.MINOR\.PATCH-next\.N/
  )
  assert.throws(() => validate({ tag: 'v5.0.1' }), /does not match/)
})

test('requires dated release notes and changelogs for a tag', () => {
  const version = '1.0.0'
  const releaseDate = '2026-07-23'
  const changelogs = PUBLIC_RELEASE_PACKAGES.map(config => ({
    path: `${config.path}/CHANGELOG.md`,
    content: `# Changelog\n\n## ${version} (${releaseDate})\n`,
  }))

  assert.doesNotThrow(() =>
    validateReleaseCopy({
      version,
      tag: `v${version}`,
      releaseNotes: `# Primitree ${version}\n\nStatus: Released ${releaseDate}.\n`,
      changelogs,
    })
  )
  assert.doesNotThrow(() =>
    validateReleaseCopy({
      version,
      tag: undefined,
      releaseNotes: 'Status: Unreleased.\n',
      changelogs: changelogs.map(changelog => ({
        ...changelog,
        content: `## ${version} (Unreleased)\n`,
      })),
    })
  )
  assert.throws(
    () =>
      validateReleaseCopy({
        version,
        tag: `v${version}`,
        releaseNotes: 'Status: Unreleased.\n',
        changelogs,
      }),
    /release notes.*Released YYYY-MM-DD/is
  )
  assert.throws(
    () =>
      validateReleaseCopy({
        version,
        tag: `v${version}`,
        releaseNotes: `Status: Released ${releaseDate}.\n`,
        changelogs: changelogs.map((changelog, index) =>
          index === 0
            ? {
                ...changelog,
                content: `## ${version} (2026-07-24)\n`,
              }
            : changelog
        ),
      }),
    /must use release date 2026-07-23/i
  )
})

test('discovers workspace manifests without following symlink entries', t => {
  const root = mkdtempSync(join(tmpdir(), 'primitree-release-discovery-'))
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
  const cwd = mkdtempSync(join(tmpdir(), 'primitree-release-cwd-'))
  try {
    const result = spawnSync(process.execPath, [scriptPath], {
      cwd,
      encoding: 'utf8',
      env: process.env,
    })
    assert.equal(result.status, 0, result.stderr)
    assert.match(
      result.stdout,
      /Release metadata valid for 6 public packages at 1\.0\.0-next\.0/
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

test('requires Node 24 for the source workspace, public packages, and Node builds', () => {
  assert.equal(rootManifest.engines.node, '>=24.0.0')
  assert.equal(rootManifest.engines.pnpm, '>=11.0.0')
  assert.equal(rootManifest.packageManager, 'pnpm@11.10.0')
  assert.deepEqual(
    publicManifests.map(manifest => manifest.engines?.node),
    Array(PUBLIC_RELEASE_PACKAGES.length).fill('>=24.0.0')
  )
  assert.deepEqual(
    publicManifests
      .filter(manifest => manifest.name !== 'primitree')
      .map(manifest => manifest.devDependencies?.['@types/node']),
    Array(PUBLIC_RELEASE_PACKAGES.length - 1).fill('^24.13.3')
  )
  assert.match(cliTsupConfig, /target: 'node24'/)
  assert.match(mcpTsupConfig, /target: 'node24'/)
})

test('requires the React 19 hooks peer without a React DOM peer', () => {
  const hooks = publicManifests.find(
    manifest => manifest.name === '@primitree/hooks'
  )
  assert.ok(hooks)
  assert.equal(hooks.peerDependencies?.react, '^19.0.0')
  assert.equal(Object.hasOwn(hooks.peerDependencies ?? {}, 'react-dom'), false)
})

test('keeps the hooks typecheck free of a second build lifecycle', () => {
  const hooks = publicManifests.find(
    manifest => manifest.name === '@primitree/hooks'
  )
  assert.ok(hooks)
  assert.equal(hooks.scripts?.typecheck, 'tsc --noEmit')
  assert.equal(Object.hasOwn(hooks.scripts ?? {}, 'pretypecheck'), false)
})

test('serializes the hooks build before dist-backed verification tasks', () => {
  const hooks = publicManifests.find(
    manifest => manifest.name === '@primitree/hooks'
  )
  assert.ok(hooks)
  assert.equal(Object.hasOwn(hooks.scripts ?? {}, 'pretest'), false)
  assert.equal(Object.hasOwn(hooks.scripts ?? {}, 'pretest:coverage'), false)
  assert.deepEqual(turboConfig.tasks['@primitree/hooks#test']?.dependsOn, [
    'build',
  ])
  assert.deepEqual(
    turboConfig.tasks['@primitree/hooks#test:coverage']?.dependsOn,
    ['build']
  )
  assert.deepEqual(turboConfig.tasks['@primitree/hooks#typecheck']?.dependsOn, [
    'build',
  ])
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
  assert.deepEqual(changesetConfig.snapshot, {
    useCalculatedVersion: false,
    prereleaseTemplate: '{tag}-{commit}',
  })
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
  assert.match(
    rootManifest.scripts.test,
    /scripts\/prerelease-contract\.test\.mjs/
  )
})

test('versions packages and proves the synchronized lockfile without lifecycle scripts', () => {
  assert.equal(
    rootManifest.scripts['version-packages'],
    'changeset version && pnpm install --lockfile-only --no-frozen-lockfile --ignore-scripts && pnpm install --frozen-lockfile --ignore-scripts'
  )
})

test('creates version pull requests through one pinned least-privilege workflow', () => {
  assertVersionWorkflowPolicy(versionWorkflow)
})

test('rejects version workflow trust-boundary drift', () => {
  assert.doesNotThrow(() => assertVersionWorkflowPolicy(versionWorkflow))

  const mutations = [
    versionWorkflow.replace(
      '  version-packages:\n',
      [
        '  rogue:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: owner/unreviewed-action@v1',
        '  version-packages:',
        '',
      ].join('\n')
    ),
    versionWorkflow.replace(CHANGESETS_ACTION, 'changesets/action@v1'),
    versionWorkflow.replace(
      'permissions: {}',
      'permissions:\n  contents: write'
    ),
    versionWorkflow.replace(
      '      pull-requests: write',
      '      pull-requests: write\n      id-token: write'
    ),
    versionWorkflow.replace(
      '    runs-on: ubuntu-latest',
      '    runs-on: ubuntu-latest\n    environment: npm'
    ),
    versionWorkflow.replace(
      '    runs-on: ubuntu-latest',
      [
        '    runs-on: ubuntu-latest',
        '    env:',
        `      EXFILTRATE: "\${{ secrets['UNREVIEWED_TOKEN'] }}"`,
      ].join('\n')
    ),
    versionWorkflow.replace(
      '          node-version: 24.18.0',
      [
        '          node-version: 24.18.0',
        '          registry-url: https://registry.npmjs.org/',
      ].join('\n')
    ),
    versionWorkflow.replace(
      '          createGithubReleases: false',
      [
        '          createGithubReleases: false',
        '          publish: pnpm run publish',
      ].join('\n')
    ),
    versionWorkflow.replace(
      '        run: pnpm install --frozen-lockfile --ignore-scripts',
      [
        '        run: pnpm install --frozen-lockfile --ignore-scripts',
        '      - name: Publish packages',
        '        run: pnpm publish',
      ].join('\n')
    ),
    versionWorkflow.replace('    branches: [main]', '    tags: ["v*"]'),
  ]

  for (const mutation of mutations) {
    assert.throws(() => assertVersionWorkflowPolicy(mutation))
  }
})

test('exercises the version command in a temporary fixed release group', t => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'primitree-version-packages-'))
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }))

  mkdirSync(join(fixtureRoot, '.changeset'), { recursive: true })
  mkdirSync(join(fixtureRoot, 'packages', 'core'), { recursive: true })
  mkdirSync(join(fixtureRoot, 'packages', 'dtcg'), { recursive: true })
  const writeJson = (file, value) =>
    writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
  writeJson(join(fixtureRoot, 'package.json'), {
    name: 'primitree-version-fixture',
    private: true,
    packageManager: 'pnpm@11.10.0',
    scripts: {
      preinstall:
        "node -e \"require('node:fs').writeFileSync('lifecycle-sentinel', process.env.npm_lifecycle_event ?? 'unknown')\"",
      'version-packages': rootManifest.scripts['version-packages'],
    },
  })
  writeFileSync(
    join(fixtureRoot, 'pnpm-workspace.yaml'),
    "packages:\n  - 'packages/*'\n"
  )
  writeJson(join(fixtureRoot, '.changeset', 'config.json'), {
    changelog: ['@changesets/cli/changelog', null],
    commit: false,
    fixed: [['@primitree/core', '@primitree/dtcg']],
    linked: [],
    access: 'public',
    baseBranch: 'main',
    updateInternalDependencies: 'patch',
    ignore: [],
    privatePackages: {
      version: false,
      tag: false,
    },
  })
  writeFileSync(
    join(fixtureRoot, '.changeset', 'fixed-group.md'),
    [
      '---',
      '"@primitree/core": minor',
      '---',
      '',
      'Exercise the fixed release group.',
      '',
    ].join('\n')
  )
  writeJson(join(fixtureRoot, 'packages', 'core', 'package.json'), {
    name: '@primitree/core',
    version: '1.0.0',
  })
  writeJson(join(fixtureRoot, 'packages', 'dtcg', 'package.json'), {
    name: '@primitree/dtcg',
    version: '1.0.0',
    dependencies: {
      '@primitree/core': 'workspace:*',
    },
  })

  const environment = {
    ...process.env,
    CI: '1',
    PATH: `${join(repositoryRoot, 'node_modules', '.bin')}:${process.env.PATH}`,
  }
  const seed = spawnSync(
    'pnpm',
    ['install', '--no-frozen-lockfile', '--ignore-scripts'],
    {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env: environment,
    }
  )
  assert.equal(seed.status, 0, seed.stderr)
  const sentinelPath = join(fixtureRoot, 'lifecycle-sentinel')
  assert.equal(existsSync(sentinelPath), false)
  const lockfilePath = join(fixtureRoot, 'pnpm-lock.yaml')
  const originalLockfile = readFileSync(lockfilePath, 'utf8')

  const result = spawnSync('pnpm', ['run', 'version-packages'], {
    cwd: fixtureRoot,
    encoding: 'utf8',
    env: environment,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(
    ['core', 'dtcg'].map(
      packageName =>
        JSON.parse(
          readFileSync(
            join(fixtureRoot, 'packages', packageName, 'package.json'),
            'utf8'
          )
        ).version
    ),
    ['1.1.0', '1.1.0']
  )
  assert.equal(
    existsSync(join(fixtureRoot, '.changeset', 'fixed-group.md')),
    false
  )
  for (const packageName of ['core', 'dtcg']) {
    assert.match(
      readFileSync(
        join(fixtureRoot, 'packages', packageName, 'CHANGELOG.md'),
        'utf8'
      ),
      /## 1\.1\.0/
    )
  }
  assert.equal(readFileSync(lockfilePath, 'utf8'), originalLockfile)
  assert.equal(
    existsSync(sentinelPath),
    false,
    existsSync(sentinelPath)
      ? `${readFileSync(sentinelPath, 'utf8')}\n${result.stdout}\n${result.stderr}`
      : undefined
  )
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

test('keeps Codecov informational while package coverage gates remain blocking', () => {
  const configUrl = new URL('../codecov.yml', import.meta.url)
  assert.equal(existsSync(configUrl), true)
  assert.deepEqual(parseYaml(readFileSync(configUrl, 'utf8')), {
    coverage: {
      status: {
        project: {
          default: { target: 'auto', informational: true },
        },
        patch: {
          default: { target: 'auto', informational: true },
        },
      },
    },
  })
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
    '    permissions:\n      contents: read\n      id-token: write\n',
    '    permissions:\n      contents: write\n'
  )
  assert.throws(
    () => assertWorkflowTrustPolicy(elevatedQuality),
    /Expected values to be strictly deep-equal/
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
  assert.match(
    quality,
    /permissions:\n      contents: read\n      id-token: write/
  )
  assert.doesNotMatch(
    quality,
    /NODE_AUTH_TOKEN|NPM_CONFIG_PROVENANCE|secrets\.NPM_TOKEN/
  )
  assert.doesNotMatch(consumer, /id-token:\s*write|\$\{\{\s*secrets\./)
  assert.match(
    publish,
    /permissions:\n      contents: read\n      id-token: write/
  )
  assert.equal(occurrences(workflow, 'id-token: write'), 2)
  assert.equal(occurrences(workflow, 'NPM_TOKEN:'), 1)
  assert.equal(occurrences(workflow, 'secrets.NPM_TOKEN'), 1)
  assert.match(githubRelease, /permissions:\n      contents: write/)
  assert.doesNotMatch(
    githubRelease,
    /environment:\s*npm|id-token:|NPM_TOKEN|NODE_AUTH_TOKEN|secrets\.NPM_TOKEN/
  )
})

test('disables dependency lifecycle scripts in the OIDC-enabled quality job', () => {
  const quality = parseYaml(workflow).jobs.quality

  assert.equal(quality.permissions['id-token'], 'write')
  assert.equal(
    findWorkflowStep(quality, 'Install dependencies').run,
    'pnpm install --frozen-lockfile --ignore-scripts'
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
  assert.match(
    quality,
    /\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\(-next\\\.\[0-9\]\+\)\?\$/
  )
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
  assert.doesNotMatch(source, /RELEASE_NOTES_PATH|docs\/launch\/v1\.0\.0\.md/)
  assert.match(
    githubReleaseScript,
    /`docs\/launch\/v\$\{verified\.version\}\.md`/
  )
  assert.match(source, /name: npm-packages-\$\{\{ github\.sha \}\}/)
})

test('keeps reviewed v1 release notes project-focused', () => {
  assert.match(v1ReleaseNotes, /^# Primitree 1\.0\.0$/m)
  for (const phrase of [
    'DTCG 2025.10',
    '`primitree diff`',
    '`@primitree/hooks`',
    '`@primitree/mcp`',
    'Node.js 24',
  ]) {
    assert.ok(v1ReleaseNotes.includes(phrase), `release notes need ${phrase}`)
  }
  assert.doesNotMatch(
    v1ReleaseNotes,
    /NPM_TOKEN|OIDC|GitHub Actions|workflow|provenance|publish job|bootstrap/i
  )
  assert.match(
    v1ReleaseNotes,
    /\[README\]\(https:\/\/github\.com\/marklearst\/primitree\/blob\/v1\.0\.0\/README\.md\)/
  )
  assert.doesNotMatch(v1ReleaseNotes, /\[README\]\(\.\.\/\.\.\/README\.md\)/)
  assert.doesNotMatch(v1ReleaseNotes, /—/)
})

test('documents the unscoped launcher and next channel in prerelease notes', () => {
  assert.match(nextReleaseNotes, /^# Primitree 1\.0\.0-next\.0$/m)
  assert.match(nextReleaseNotes, /npx primitree@next check/)
  assert.match(nextReleaseNotes, /forwards to `@primitree\/cli`/)
  assert.match(nextReleaseNotes, /`latest` does not point to the prerelease/)
  assert.match(nextReleaseNotes, /blob\/v1\.0\.0-next\.0\/README\.md/)
  assert.doesNotMatch(nextReleaseNotes, /—/)
})

test('dates public release copy before creating a tag', () => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  const tagPhase = extractMarkdownSection(
    external,
    '### 5. Tag, publish, and create the GitHub prerelease'
  )

  assert.match(tagPhase, /all six package changelogs/i)
  assert.match(tagPhase, /`1\.0\.0-next\.0`/)
  assert.match(tagPhase, /`Status: Released YYYY-MM-DD\.`/)
  assert.match(tagPhase, /tag-mode metadata check rejects[\s\S]*Unreleased/i)
  assert.match(
    tagPhase,
    /git tag -a "v\$VERSION" "\$FINAL_COMMIT" -m "Primitree \$VERSION"/
  )
  assertInOrder(
    tagPhase,
    [
      'Update the release copy before creating the tag.',
      'GITHUB_REF_TYPE=tag GITHUB_REF_NAME="v$VERSION" pnpm run check:release-metadata',
      'git tag -a "v$VERSION"',
    ],
    'release copy and tag order'
  )
})

test('links one release runbook from maintainer and launch documentation', () => {
  assert.notEqual(releaseRunbook, '', 'docs/releasing.md must exist')
  assert.match(contributing, /\[release runbook\]\(docs\/releasing\.md\)/i)
  assert.match(announcement, /\[release runbook\]\(\.\.\/releasing\.md\)/i)
  assert.doesNotMatch(announcement, /npm publish/)
  assertNoBlanketTagPush(announcement)
})

test('documents exact contributor and version pull request boundaries', () => {
  assert.match(contributing, /Node 24\.18\.0/)
  assert.match(contributing, /pnpm 11\.10\.0/)
  assert.match(contributing, /public packages[\s\S]*Node >=24\.0\.0/i)
  assert.doesNotMatch(contributing, /Node >=22\.13\.0|Node 20\.0\.0/)

  const versionPullRequests = extractMarkdownSection(
    releaseRunbook,
    '## Version pull requests'
  )
  assert.match(
    versionPullRequests,
    /launcher pull request[\s\S]*initial versioned release candidate/i
  )
  assert.match(
    versionPullRequests,
    /no second initial Changesets version[\s\S]*pull request/i
  )
  assert.match(
    versionPullRequests,
    /keep prerelease mode active[\s\S]*later `next` releases/i
  )
  assert.match(
    versionPullRequests,
    /exit prerelease mode[\s\S]*stable `1\.0\.0`/i
  )
  assert.match(
    versionPullRequests,
    /GitHub\s+Actions[\s\S]*create and approve pull requests/i
  )
  assert.match(versionPullRequests, /can_approve_pull_request_reviews == true/)
  assert.match(
    versionPullRequests,
    /GitHub does not run[\s\S]*`pull_request` workflow[\s\S]*`github\.token` creates/i
  )
  assert.match(
    versionPullRequests,
    /close and reopen[\s\S]*maintainer[\s\S]*exact head commit/i
  )
  assert.match(versionPullRequests, /quality[\s\S]*packed-consumer/i)
  assert.match(versionPullRequests, /`github\.token`/)
  assert.match(versionPullRequests, /never publishes/i)
  assert.match(
    versionPullRequests,
    /receives no\s+npm token[\s\S]*does not request[\s\S]*OIDC identity token/i
  )
})

test('freezes the launch administration order and credential boundaries', () => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  const packageSecurity = extractMarkdownSubsection(
    external,
    '### 9. Require package MFA and disallow token publishing'
  )
  const checklist = [...external.matchAll(/^- \[([ xX])\] /gm)]
  assert.equal(checklist.length, 11)
  assert.ok(checklist.every(item => item[1] === ' '))
  assertInOrder(
    external,
    [
      '### 1. Branch preflight',
      '### 2. Merge and bind exact main',
      '### 3. Verify the automatic main deployment',
      '### 4. Create the bootstrap credential and protected environment',
      '### 5. Tag, publish, and create the GitHub prerelease',
      '### 6. Configure all six trusted publishers',
      '### 7. Delete the GitHub environment secret',
      '### 8. Revoke the exact bootstrap token',
      '### 9. Require package MFA and disallow token publishing',
      '### 10. Verify replacements and migration',
      '### 11. Deprecate the sole legacy target: 4.0.0',
    ],
    'launch administration phases'
  )

  assert.match(external, /granular npm token[\s\S]*expires after one day/i)
  assert.match(external, /protected GitHub `npm` environment/)
  assert.equal(occurrences(external, GITHUB_SECRET_SET_COMMAND), 1)
  assert.equal(occurrences(external, GITHUB_SECRET_DELETE_COMMAND), 1)
  assert.equal(occurrences(external, GITHUB_SECRET_LIST_COMMAND), 2)
  assert.doesNotMatch(
    external,
    /^gh secret (?:set|delete|list)[^\n]*--env npm(?![^\n]*--repo marklearst\/primitree)[^\n]*$/gm
  )
  assert.doesNotMatch(
    external,
    /gh secret set NPM_TOKEN[^\n]*(?:--body|-b\b)|(?:echo|printf)[^\n]*NPM_TOKEN|NPM_TOKEN=['"][^'"]+/
  )
  assertInOrder(
    external,
    [
      GITHUB_SECRET_SET_COMMAND,
      'git push origin "refs/tags/v$VERSION"',
      ...TRUST_COMMANDS,
      GITHUB_SECRET_DELETE_COMMAND,
      'npm token list --json',
      'npm token revoke "$BOOTSTRAP_TOKEN_ID"',
      'Require two-factor authentication and disallow tokens',
    ],
    'credential retirement'
  )
  assert.match(external, /BOOTSTRAP_TOKEN_ID/)
  assert.match(external, /exact token ID/i)
  assert.match(
    external,
    /bootstrap granular access token[\s\S]*cannot authorize `npm trust`/i
  )
  assert.match(external, /browser-authenticated[\s\S]*npm >=11\.15/i)
  for (const command of [...TRUST_COMMANDS, ...TRUST_LIST_COMMANDS]) {
    assert.equal(occurrences(external, command), 1, `runbook needs ${command}`)
  }
  assert.doesNotMatch(packageSecurity, /npm access set mfa=/)
  assert.match(
    packageSecurity,
    /npm CLI does not expose[\s\S]*disallow-tokens setting/i
  )
  assert.match(
    packageSecurity,
    /refresh[\s\S]*Require two-factor authentication and disallow tokens/i
  )
  for (const { name } of RELEASE_PUBLISH_PACKAGES) {
    assert.equal(
      occurrences(packageSecurity, `\`${name}\``),
      1,
      `package security checklist needs ${name}`
    )
  }
  assert.match(
    external,
    /`npm trust list`[\s\S]*saved configuration[\s\S]*cannot prove GitHub OIDC/i
  )
  assert.match(
    external,
    /next token-free release[\s\S]*proves[\s\S]*GitHub OIDC/i
  )
  assert.match(external, /trusted OIDC[\s\S]*remains\s+available/i)
})

test('records a healthy rollback target before merging main', () => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  assertInOrder(
    external,
    [
      'PREVIOUS_PRODUCTION_JSON=$(vercel api "/v13/deployments/$PREVIOUS_PRODUCTION_ID"',
      `test "$(jq -r '.projectId' <<<"$PREVIOUS_PRODUCTION_JSON")" = "$PROJECT_ID"`,
      'PREVIOUS_PRODUCTION_HOME=$(',
      '--connect-timeout 5',
      '--max-time 20',
      '--location',
      "grep -F '<title>Primitree'",
      'grep -F \'name="description"\'',
      'grep -F \'property="og:title"\'',
      'https://primitree.com/docs',
      'https://primitree.com/playground',
      'https://primitree.com/docs/hooks/migration',
      "'https://primitree.com/api/search?query=figma'",
      `grep -F '"url":"/docs/concepts/figma-mcp"'`,
      'RELEASE_EVENT_BASELINE_JSON=$(',
      'RELEASE_EVENT_BASELINE_ID=$(',
      'POST_HEALTH_PRODUCTION_SUMMARY=$(',
      `test "$(jq -r '.id' <<<"$POST_HEALTH_PRODUCTION_SUMMARY")" =`,
      'git switch main',
    ],
    'pre-merge rollback health'
  )
})

test('automatic production route verifiers fail closed on every fetch and content assertion', () => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  const vercelPhase = extractMarkdownSubsection(
    external,
    '### 3. Verify the automatic main deployment'
  )
  const verifierBlock = extractBashBlockContaining(
    vercelPhase,
    'verify_public_health()',
    'automatic production verification'
  )
  const definitions = verifierBlock.slice(
    verifierBlock.indexOf('public_get()'),
    verifierBlock.indexOf(
      "FINAL_COMMIT='<full main commit SHA recorded in step 2>'"
    )
  )
  const mocks = String.raw`
route_body() {
  case "$1" in
    /)
      [[ "$OMIT_MARKER" == "Govern token change. Know every consequence." ]] ||
        printf '%s\n' 'Govern token change. Know every consequence.'
      [[ "$OMIT_MARKER" == "<title>Primitree" ]] || printf '%s\n' '<title>Primitree'
      [[ "$OMIT_MARKER" == 'name="description"' ]] || printf '%s\n' 'name="description"'
      [[ "$OMIT_MARKER" == 'property="og:title"' ]] || printf '%s\n' 'property="og:title"'
      ;;
    /docs)
      [[ "$OMIT_MARKER" == "<title>Build token files · Primitree" ]] ||
        printf '%s\n' '<title>Build token files · Primitree'
      [[ "$OMIT_MARKER" == "Primitree checks a local DTCG token file" ]] ||
        printf '%s\n' 'Primitree checks a local DTCG token file'
      ;;
    /playground)
      [[ "$OMIT_MARKER" == "<title>Playground · Primitree" ]] ||
        printf '%s\n' '<title>Playground · Primitree'
      [[ "$OMIT_MARKER" == "This page calls the same build function as" ]] ||
        printf '%s\n' 'This page calls the same build function as'
      ;;
    /docs/hooks/migration)
      [[ "$OMIT_MARKER" == "<title>Migration from @figma-vars/hooks · Primitree" ]] ||
        printf '%s\n' '<title>Migration from @figma-vars/hooks · Primitree'
      [[ "$OMIT_MARKER" == "Primitree 1.0 moves the hooks package from" ]] ||
        printf '%s\n' 'Primitree 1.0 moves the hooks package from'
      ;;
    '/api/search?query=figma')
      [[ "$OMIT_MARKER" == '"url":"/docs/concepts/figma-mcp"' ]] ||
        printf '%s\n' '"url":"/docs/concepts/figma-mcp"'
      ;;
    *)
      return 64
      ;;
  esac
}

curl() {
  local url=''
  local path=''
  for required in --fail --location --silent --show-error --connect-timeout 5 --max-time 20 --max-redirs 5 --write-out; do
    [[ " $* " == *" $required "* ]] || return 67
  done
  for url in "$@"; do :; done
  path="${'$'}{url#https://primitree.com}"
  [[ -n "$path" ]] || path=/
  [[ "$path" == "$FAIL_PATH" ]] && return 66
  route_body "$path"
  printf '\n%s' "${'$'}{EFFECTIVE_URL:-$url}"
}
`
  const markers = [
    'Govern token change. Know every consequence.',
    '<title>Primitree',
    'name="description"',
    'property="og:title"',
    '<title>Build token files · Primitree',
    '<title>Playground · Primitree',
    '<title>Migration from @figma-vars/hooks · Primitree',
    'Primitree checks a local DTCG token file',
    'This page calls the same build function as',
    'Primitree 1.0 moves the hooks package from',
    '"url":"/docs/concepts/figma-mcp"',
  ]
  const paths = [
    '/',
    '/docs',
    '/playground',
    '/docs/hooks/migration',
    '/api/search?query=figma',
  ]

  const baseline = runBash(
    `${definitions}\n${mocks}\nOMIT_MARKER=''\nFAIL_PATH=''\nEFFECTIVE_URL=''\nverify_public_site`
  )
  assert.equal(baseline.status, 0, baseline.stderr)

  for (const marker of markers) {
    const result = runBash(
      `${definitions}\n${mocks}\nOMIT_MARKER=${JSON.stringify(marker)}\nFAIL_PATH=''\nEFFECTIVE_URL=''\nverify_public_site`
    )
    assert.notEqual(
      result.status,
      0,
      `verify_public_site must reject missing marker ${marker}`
    )
  }
  for (const marker of [
    '<title>Build token files · Primitree',
    '<title>Playground · Primitree',
    '<title>Migration from @figma-vars/hooks · Primitree',
  ]) {
    const result = runBash(
      `${definitions}\n${mocks}\nOMIT_MARKER=${JSON.stringify(marker)}\nFAIL_PATH=''\nEFFECTIVE_URL=''\nverify_public_health`
    )
    assert.notEqual(
      result.status,
      0,
      `verify_public_health must reject missing route marker ${marker}`
    )
  }
  for (const verifier of ['verify_public_health', 'verify_public_site']) {
    for (const path of paths) {
      const result = runBash(
        `${definitions}\n${mocks}\nOMIT_MARKER=''\nFAIL_PATH=${JSON.stringify(path)}\nEFFECTIVE_URL=''\n${verifier}`
      )
      assert.notEqual(
        result.status,
        0,
        `${verifier} must reject a failed fetch for ${path}`
      )
    }
  }
  for (const effectiveUrl of [
    'https://vercel.com/login',
    'https://example.com/docs',
    'https://primitree.com/',
  ]) {
    const result = runBash(
      `${definitions}\n${mocks}\nOMIT_MARKER=''\nFAIL_PATH=''\nEFFECTIVE_URL=${JSON.stringify(effectiveUrl)}\npublic_get https://primitree.com/docs`
    )
    assert.notEqual(
      result.status,
      0,
      `public_get must reject redirect destination ${effectiveUrl}`
    )
  }
  const trailingSlash = runBash(
    `${definitions}\n${mocks}\nOMIT_MARKER=''\nFAIL_PATH=''\nEFFECTIVE_URL='https://primitree.com/docs/'\npublic_get https://primitree.com/docs`
  )
  assert.equal(trailingSlash.status, 0, trailingSlash.stderr)
})

test('automatic production rollback restores and verifies the recorded deployment', t => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  const vercelPhase = extractMarkdownSubsection(
    external,
    '### 3. Verify the automatic main deployment'
  )
  const verificationBlock = extractBashBlockContaining(
    vercelPhase,
    'restore_previous_production()',
    'automatic production verification'
  )
  const functionStart = verificationBlock.indexOf(
    'restore_previous_production()'
  )
  const functionEnd =
    verificationBlock.indexOf('\n}\n\nFINAL_COMMIT=', functionStart) + 3
  assert.ok(
    functionEnd > functionStart,
    'rollback function must be extractable'
  )
  const rollbackFunction = verificationBlock.slice(functionStart, functionEnd)
  const temp = mkdtempSync(join(tmpdir(), 'primitree-vercel-gates-'))
  const callLog = join(temp, 'calls.log')
  const currentId = join(temp, 'current-id')
  t.after(() => rmSync(temp, { recursive: true, force: true }))

  const mocks = String.raw`
vercel() {
  if [[ "$1" == inspect ]]; then
    printf '{"id":"%s"}\n' "$(cat "$CURRENT_ID")"
    return 0
  fi
  if [[ "$1" == rollback ]]; then
    printf '%s\n' rollback >>"$CALL_LOG"
    [[ "$ROLLBACK_REBINDS" == true ]] && printf '%s\n' "$PREVIOUS_PRODUCTION_ID" >"$CURRENT_ID"
    return 0
  fi
  return 64
}

verify_public_health() {
  [[ "$HEALTHY" == true ]]
}

require_release_main_unchanged() {
  [[ "$MAIN_UNCHANGED" == true ]]
}

verify_previous_production_identity() {
  [[ "$PREVIOUS_IDENTITY_VALID" == true ]]
}

verify_current_release_identity() {
  [[ "$CURRENT_IDENTITY_VALID" == true ]]
}

verify_previous_is_release_predecessor() {
  [[ "$PREDECESSOR_VALID" == true ]]
}

sleep() {
  return 0
}
`

  const base = `${rollbackFunction}\n${mocks}\nPREVIOUS_PRODUCTION_ID=dpl_previous\nPRODUCTION_DEPLOYMENT_ID=dpl_candidate\nCURRENT_ID=${JSON.stringify(currentId)}\nCALL_LOG=${JSON.stringify(callLog)}\nMAIN_UNCHANGED=true\nPREVIOUS_IDENTITY_VALID=true\nCURRENT_IDENTITY_VALID=true\nPREDECESSOR_VALID=true`

  writeFileSync(currentId, 'dpl_previous\n')
  writeFileSync(callLog, '')
  const alreadyRestored = runBash(
    `${base}\nROLLBACK_REBINDS=true\nHEALTHY=true\nrestore_previous_production`
  )
  assert.equal(alreadyRestored.status, 0, alreadyRestored.stderr)
  assert.equal(readFileSync(callLog, 'utf8'), '')

  writeFileSync(currentId, 'dpl_candidate\n')
  writeFileSync(callLog, '')
  const restored = runBash(
    `${base}\nROLLBACK_REBINDS=true\nHEALTHY=true\nrestore_previous_production`
  )
  assert.equal(restored.status, 0, restored.stderr)
  assert.equal(readFileSync(callLog, 'utf8'), 'rollback\n')

  for (const failure of [
    ['false', 'true'],
    ['true', 'false'],
  ]) {
    const [rebinds, healthy] = failure
    writeFileSync(currentId, 'dpl_candidate\n')
    writeFileSync(callLog, '')
    const result = runBash(
      `${base}\nROLLBACK_REBINDS=${rebinds}\nHEALTHY=${healthy}\nrestore_previous_production`
    )
    assert.notEqual(result.status, 0, `rollback must reject ${failure}`)
  }

  writeFileSync(currentId, '\n')
  writeFileSync(callLog, '')
  const missingCurrent = runBash(
    `${base}\nROLLBACK_REBINDS=true\nHEALTHY=true\nrestore_previous_production`
  )
  assert.notEqual(missingCurrent.status, 0)
  assert.equal(readFileSync(callLog, 'utf8'), '')

  for (const safetyGate of [
    ['false', 'true', 'true', 'true'],
    ['true', 'false', 'true', 'true'],
    ['true', 'true', 'false', 'true'],
    ['true', 'true', 'true', 'false'],
  ]) {
    const [
      mainUnchanged,
      previousIdentityValid,
      currentIdentityValid,
      predecessorValid,
    ] = safetyGate
    writeFileSync(currentId, 'dpl_candidate\n')
    writeFileSync(callLog, '')
    const result = runBash(
      `${rollbackFunction}\n${mocks}\nPREVIOUS_PRODUCTION_ID=dpl_previous\nPRODUCTION_DEPLOYMENT_ID=dpl_candidate\nCURRENT_ID=${JSON.stringify(currentId)}\nCALL_LOG=${JSON.stringify(callLog)}\nMAIN_UNCHANGED=${mainUnchanged}\nPREVIOUS_IDENTITY_VALID=${previousIdentityValid}\nCURRENT_IDENTITY_VALID=${currentIdentityValid}\nPREDECESSOR_VALID=${predecessorValid}\nROLLBACK_REBINDS=true\nHEALTHY=true\nrestore_previous_production`
    )
    assert.notEqual(result.status, 0, `rollback must reject ${safetyGate}`)
    assert.equal(
      readFileSync(callLog, 'utf8'),
      '',
      'rollback must not run after a main or deployment identity mismatch'
    )
  }
})

test('automatic rollback accepts only release alias events after capture', () => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  const vercelPhase = extractMarkdownSubsection(
    external,
    '### 3. Verify the automatic main deployment'
  )
  const verificationBlock = extractBashBlockContaining(
    vercelPhase,
    'verify_previous_is_release_predecessor()',
    'automatic production verification'
  )
  const functionStart = verificationBlock.indexOf(
    'verify_previous_is_release_predecessor()'
  )
  const functionEnd = verificationBlock.indexOf(
    '\n}\n\npause_automatic_production_domains()',
    functionStart
  )
  assert.ok(
    functionEnd > functionStart,
    'predecessor verifier must be extractable'
  )
  const predecessorFunction = verificationBlock.slice(
    functionStart,
    functionEnd + 3
  )
  const mock = String.raw`
vercel() {
  printf '%s\n' "$ALIAS_EVENTS"
}
`
  const base = `${predecessorFunction}\n${mock}\nPROJECT_ID=prj_test\nPRODUCTION_DEPLOYMENT_ID=dpl_release\nPREVIOUS_PRODUCTION_ID=dpl_previous\nRELEASE_EVENT_BASELINE_ID=uev_baseline`
  const aliasEvent = deploymentId => ({
    type: 'aliases-assigned',
    payload: {
      projectId: 'prj_test',
      deployment: { id: deploymentId },
    },
  })

  const immediate = runBash(
    `${base}\nALIAS_EVENTS=${JSON.stringify(
      JSON.stringify({
        events: [
          { id: 'uev_release', ...aliasEvent('dpl_release') },
          { id: 'uev_baseline', ...aliasEvent('dpl_previous') },
        ],
      })
    )}\nverify_previous_is_release_predecessor`
  )
  assert.equal(immediate.status, 0, immediate.stderr)

  const skippedDeployment = runBash(
    `${base}\nALIAS_EVENTS=${JSON.stringify(
      JSON.stringify({
        events: [
          { id: 'uev_release', ...aliasEvent('dpl_release') },
          { id: 'uev_intermediate', ...aliasEvent('dpl_intermediate') },
          { id: 'uev_baseline', ...aliasEvent('dpl_previous') },
        ],
      })
    )}\nverify_previous_is_release_predecessor`
  )
  assert.notEqual(skippedDeployment.status, 0)
})

test('failed automatic deployment containment pauses, cancels, and then restores', t => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  const vercelPhase = extractMarkdownSubsection(
    external,
    '### 3. Verify the automatic main deployment'
  )
  const verificationBlock = extractBashBlockContaining(
    vercelPhase,
    'contain_failed_release()',
    'automatic production verification'
  )
  const functionStart = verificationBlock.indexOf(
    'pause_automatic_production_domains()'
  )
  const functionEnd = verificationBlock.indexOf(
    '\n}\n\nverify_production_domain_id()',
    functionStart
  )
  assert.ok(
    functionEnd > functionStart,
    'containment functions must be extractable'
  )
  const containmentFunctions = verificationBlock.slice(
    functionStart,
    functionEnd + 3
  )
  const temp = mkdtempSync(join(tmpdir(), 'primitree-vercel-contain-'))
  const callLog = join(temp, 'calls.log')
  const releaseState = join(temp, 'release-state')
  t.after(() => rmSync(temp, { recursive: true, force: true }))

  const mocks = String.raw`
vercel() {
  if [[ "$1" == inspect ]]; then
    [[ -n "$CURRENT_ID" ]] || { printf '%s\n' '{}'; return 0; }
    printf '{"id":"%s"}\n' "$CURRENT_ID"
    return 0
  fi
  if [[ "$1" != api ]]; then
    return 64
  fi
  local endpoint="$2"
  if [[ "$endpoint" == "/v9/projects/$PROJECT_ID" && " $* " == *" -X PATCH "* ]]; then
    printf '%s\n' pause >>"$CALL_LOG"
    return 0
  fi
  if [[ "$endpoint" == "/v9/projects/$PROJECT_ID" ]]; then
    local auto_assign=false
    if [[ "$FLIP_AFTER_CANCEL" == true && "$(cat "$RELEASE_STATE")" == CANCELED ]]; then
      auto_assign=true
    fi
    printf '{"id":"%s","name":"primitree","autoAssignCustomDomains":%s}\n' \
      "$PROJECT_ID" "$auto_assign"
    return 0
  fi
  if [[ "$endpoint" == /v7/deployments* ]]; then
    if [[ "$RELEASE_COUNT" == 0 ]]; then
      printf '%s\n' '{"deployments":[]}'
    else
      printf '%s\n' '{"deployments":[{"uid":"dpl_release","projectId":"prj_test","source":"git","target":"production","meta":{"githubCommitRef":"main","githubCommitSha":"0123456789012345678901234567890123456789"}}]}'
    fi
    return 0
  fi
  if [[ "$endpoint" == "/v13/deployments/dpl_release" ]]; then
    printf '{"id":"dpl_release","projectId":"%s","name":"primitree","source":"git","target":"production","readyState":"%s","meta":{"githubCommitRef":"main","githubCommitSha":"%s"}}\n' \
      "$PROJECT_ID" "$(cat "$RELEASE_STATE")" "$FINAL_COMMIT"
    return 0
  fi
  if [[ "$endpoint" == "/v12/deployments/dpl_release/cancel" ]]; then
    printf '%s\n' cancel >>"$CALL_LOG"
    printf '%s\n' CANCELED >"$RELEASE_STATE"
    printf '{"id":"dpl_release","projectId":"%s","readyState":"CANCELED"}\n' "$PROJECT_ID"
    return 0
  fi
  return 65
}

verify_current_release_identity() {
  [[ "$CURRENT_IDENTITY_VALID" == true ]]
}

require_release_main_unchanged() {
  [[ "$MAIN_UNCHANGED" == true ]]
}

restore_previous_production() {
  printf '%s\n' restore >>"$CALL_LOG"
}

sleep() {
  return 0
}
`
  const base = `${containmentFunctions}\n${mocks}\nPROJECT_ID=prj_test\nFINAL_COMMIT=0123456789012345678901234567890123456789\nPREVIOUS_PRODUCTION_ID=dpl_previous\nCALL_LOG=${JSON.stringify(callLog)}\nRELEASE_STATE=${JSON.stringify(releaseState)}\nMAIN_UNCHANGED=true\nCURRENT_IDENTITY_VALID=true\nFLIP_AFTER_CANCEL=false`

  writeFileSync(callLog, '')
  writeFileSync(releaseState, 'BUILDING\n')
  const contained = runBash(
    `${base}\nCURRENT_ID=dpl_previous\nRELEASE_COUNT=1\ncontain_failed_release`
  )
  assert.equal(contained.status, 0, contained.stderr)
  assert.equal(readFileSync(callLog, 'utf8'), 'pause\ncancel\nrestore\n')

  writeFileSync(callLog, '')
  writeFileSync(releaseState, 'BUILDING\n')
  const unexpected = runBash(
    `${base}\nCURRENT_ID=dpl_unexpected\nCURRENT_IDENTITY_VALID=false\nMAIN_UNCHANGED=true\nRELEASE_COUNT=1\ncontain_failed_release`
  )
  assert.notEqual(unexpected.status, 0)
  assert.equal(
    readFileSync(callLog, 'utf8'),
    'pause\ncancel\n',
    'an unexpected production ID must contain the exact candidate without rolling back'
  )

  for (const unsafe of [
    ['dpl_previous', 'false'],
    ['', 'true'],
  ]) {
    const [currentId, mainUnchanged] = unsafe
    writeFileSync(callLog, '')
    writeFileSync(releaseState, 'BUILDING\n')
    const result = runBash(
      `${base}\nCURRENT_ID=${JSON.stringify(currentId)}\nCURRENT_IDENTITY_VALID=false\nMAIN_UNCHANGED=${mainUnchanged}\nRELEASE_COUNT=1\ncontain_failed_release`
    )
    assert.notEqual(result.status, 0, `containment must reject ${unsafe}`)
    assert.equal(
      readFileSync(callLog, 'utf8'),
      'pause\ncancel\n',
      'containment must pause and cancel before refusing rollback'
    )
  }

  writeFileSync(callLog, '')
  writeFileSync(releaseState, 'BUILDING\n')
  const resumedAssignment = runBash(
    `${base}\nCURRENT_ID=dpl_previous\nRELEASE_COUNT=1\nFLIP_AFTER_CANCEL=true\ncontain_failed_release`
  )
  assert.notEqual(resumedAssignment.status, 0)
  assert.equal(readFileSync(callLog, 'utf8'), 'pause\ncancel\nrestore\n')
})

test('automatic production verification retries propagation and rechecks the domain', t => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  const vercelPhase = extractMarkdownSubsection(
    external,
    '### 3. Verify the automatic main deployment'
  )
  const verificationBlock = extractBashBlockContaining(
    vercelPhase,
    'wait_for_verified_public_site()',
    'automatic production verification'
  )
  const functionStart = verificationBlock.indexOf(
    'wait_for_verified_public_site()'
  )
  const functionEnd =
    verificationBlock.indexOf(
      '\n}\n\nrestore_previous_production()',
      functionStart
    ) + 3
  assert.ok(functionEnd > functionStart, 'retry function must be extractable')
  const retryFunction = verificationBlock.slice(functionStart, functionEnd)
  const temp = mkdtempSync(join(tmpdir(), 'primitree-vercel-public-'))
  const publicCalls = join(temp, 'public-calls')
  const domainCalls = join(temp, 'domain-calls')
  const sleepCalls = join(temp, 'sleep-calls')
  t.after(() => rmSync(temp, { recursive: true, force: true }))

  const mocks = String.raw`
verify_public_site() {
  local calls
  calls=$(cat "$PUBLIC_CALLS")
  calls=$((calls + 1))
  printf '%s\n' "$calls" >"$PUBLIC_CALLS"
  [[ "$calls" -ge "$PUBLIC_SUCCEEDS_AT" ]]
}

verify_production_domain_id() {
  local calls
  calls=$(cat "$DOMAIN_CALLS")
  calls=$((calls + 1))
  printf '%s\n' "$calls" >"$DOMAIN_CALLS"
  [[ "$DOMAIN_MATCHES" == true ]]
}

sleep() {
  local calls
  calls=$(cat "$SLEEP_CALLS")
  printf '%s\n' "$((calls + 1))" >"$SLEEP_CALLS"
}
`
  const base = `${retryFunction}\n${mocks}\nPUBLIC_CALLS=${JSON.stringify(publicCalls)}\nDOMAIN_CALLS=${JSON.stringify(domainCalls)}\nSLEEP_CALLS=${JSON.stringify(sleepCalls)}`

  for (const file of [publicCalls, domainCalls, sleepCalls]) {
    writeFileSync(file, '0\n')
  }
  const propagated = runBash(
    `${base}\nPUBLIC_SUCCEEDS_AT=2\nDOMAIN_MATCHES=true\nwait_for_verified_public_site`
  )
  assert.equal(propagated.status, 0, propagated.stderr)
  assert.equal(readFileSync(publicCalls, 'utf8'), '2\n')
  assert.equal(readFileSync(domainCalls, 'utf8'), '1\n')
  assert.equal(readFileSync(sleepCalls, 'utf8'), '1\n')

  for (const file of [publicCalls, domainCalls, sleepCalls]) {
    writeFileSync(file, '0\n')
  }
  const movedDomain = runBash(
    `${base}\nPUBLIC_SUCCEEDS_AT=1\nDOMAIN_MATCHES=false\nwait_for_verified_public_site`
  )
  assert.notEqual(movedDomain.status, 0)
  assert.equal(readFileSync(publicCalls, 'utf8'), '12\n')
  assert.equal(readFileSync(domainCalls, 'utf8'), '12\n')
  assert.equal(readFileSync(sleepCalls, 'utf8'), '11\n')
})

test('automatic production polling retries a transient deployment identity read', t => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  const vercelPhase = extractMarkdownSubsection(
    external,
    '### 3. Verify the automatic main deployment'
  )
  const verificationBlock = extractBashBlockContaining(
    vercelPhase,
    'UNEXPECTED_PRODUCTION_ID=',
    'automatic production verification'
  )
  const pollStart =
    verificationBlock.indexOf('\nPRODUCTION_DEPLOYMENT_ID=\nPRODUCTION_JSON=') +
    1
  const pollEnd = verificationBlock.indexOf(
    '\nif [[ -n "$UNEXPECTED_PRODUCTION_ID" ]]',
    pollStart
  )
  assert.ok(
    pollStart >= 0 && pollEnd > pollStart,
    'poll loop must be extractable'
  )
  const pollBlock = verificationBlock.slice(pollStart, pollEnd)
  const temp = mkdtempSync(join(tmpdir(), 'primitree-vercel-poll-'))
  const identityCalls = join(temp, 'identity-calls')
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  writeFileSync(identityCalls, '0\n')

  const mocks = String.raw`
vercel() {
  if [[ "$1" == inspect ]]; then
    printf '%s\n' '{"id":"dpl_release"}'
    return 0
  fi
  if [[ "$1" == api && "$2" == "/v13/deployments/dpl_release" ]]; then
    local calls
    calls=$(cat "$IDENTITY_CALLS")
    calls=$((calls + 1))
    printf '%s\n' "$calls" >"$IDENTITY_CALLS"
    if ((calls == 1)); then
      return 1
    fi
    printf '{"id":"dpl_release","projectId":"%s","name":"primitree","source":"git","readyState":"READY","target":"production","meta":{"githubCommitRef":"main","githubCommitSha":"%s"}}\n' \
      "$PROJECT_ID" "$FINAL_COMMIT"
    return 0
  fi
  return 64
}

sleep() {
  return 0
}
`
  const result = runBash(
    `${mocks}\nPROJECT_ID=prj_test\nFINAL_COMMIT=0123456789012345678901234567890123456789\nPREVIOUS_PRODUCTION_ID=dpl_previous\nIDENTITY_CALLS=${JSON.stringify(identityCalls)}\n${pollBlock}\n[[ "$PRODUCTION_DEPLOYMENT_ID" == dpl_release ]]\n[[ -z "$UNEXPECTED_PRODUCTION_ID" ]]`
  )
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(identityCalls, 'utf8'), '2\n')
})

test('automatic deployment recovery verifies the fixed deployment before reenabling domains', t => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  const recoveryBlock = extractBashBlockContaining(
    external,
    "FIXED_DEPLOYMENT_ID='<exact verified fixed deployment ID>'",
    'automatic deployment recovery'
  )
  assert.match(recoveryBlock, /^set -euo pipefail\n/)
  assertInOrder(
    recoveryBlock,
    [
      'FIXED_JSON=$(',
      `jq -r '.projectId' <<<"$FIXED_JSON"`,
      `jq -r '.source' <<<"$FIXED_JSON"`,
      `jq -r '.target' <<<"$FIXED_JSON"`,
      `jq -r '.readyState' <<<"$FIXED_JSON"`,
      `jq -r '.meta.githubCommitRef' <<<"$FIXED_JSON"`,
      `jq -r '.meta.githubCommitSha' <<<"$FIXED_JSON"`,
      'vercel promote "$FIXED_DEPLOYMENT_ID"',
      '-F autoAssignCustomDomains=false',
      `jq -r '.autoAssignCustomDomains' <<<"$PROJECT_JSON"`,
      'verify_fixed_public_site',
      `test "$(git rev-parse 'origin/main^{commit}')" = "$FIXED_COMMIT"`,
      '-F autoAssignCustomDomains=true',
      `jq -r '.autoAssignCustomDomains' <<<"$PROJECT_JSON"`,
      'FINAL_SUMMARY=$(',
      `jq -r '.id // empty' <<<"$FINAL_SUMMARY"`,
    ],
    'fixed deployment recovery'
  )

  const temp = mkdtempSync(join(tmpdir(), 'primitree-vercel-recover-'))
  const callLog = join(temp, 'calls.log')
  const mainCalls = join(temp, 'main-calls')
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const fixedCommit = '0123456789012345678901234567890123456789'
  const runnable = recoveryBlock.replace(
    "FIXED_DEPLOYMENT_ID='<exact verified fixed deployment ID>'",
    'FIXED_DEPLOYMENT_ID=dpl_fixed'
  )
  const mocks = String.raw`
git() {
  if [[ "$1" == fetch ]]; then
    return 0
  fi
  if [[ "$1 $2" == "rev-parse origin/main^{commit}" ]]; then
    local calls
    calls=$(cat "$MAIN_CALLS")
    calls=$((calls + 1))
    printf '%s\n' "$calls" >"$MAIN_CALLS"
    if [[ "$MAIN_STABLE" == false && "$calls" -ge 2 ]]; then
      printf '%s\n' 'abcdefabcdefabcdefabcdefabcdefabcdefabcd'
    else
      printf '%s\n' "$MOCK_FIXED_COMMIT"
    fi
    return 0
  fi
  return 64
}

vercel() {
  if [[ "$1" == api && "$2" == "/v13/deployments/dpl_fixed" ]]; then
    printf '{"id":"dpl_fixed","url":"primitree-fixed.vercel.app","projectId":"%s","name":"primitree","source":"git","target":"production","readyState":"READY","meta":{"githubCommitRef":"main","githubCommitSha":"%s"}}\n' \
      "$PROJECT_ID" "$MOCK_FIXED_COMMIT"
    return 0
  fi
  if [[ "$1" == inspect ]]; then
    printf '%s\n' '{"id":"dpl_fixed"}'
    return 0
  fi
  if [[ "$1" == promote ]]; then
    printf '%s\n' promote >>"$CALL_LOG"
    [[ "$PROMOTE_SUCCEEDS" == true ]]
    return
  fi
  if [[ "$1" == api && "$2" == "/v9/projects/$PROJECT_ID" && " $* " == *" -X PATCH "* ]]; then
    if [[ " $* " == *" autoAssignCustomDomains=true "* ]]; then
      printf '%s\n' enable >>"$CALL_LOG"
    else
      printf '%s\n' pause >>"$CALL_LOG"
    fi
    return 0
  fi
  if [[ "$1" == api && "$2" == "/v9/projects/$PROJECT_ID" ]]; then
    local auto_assign="$INITIAL_AUTO_ASSIGN"
    if grep -q '^enable$' "$CALL_LOG"; then
      auto_assign=true
    fi
    printf '{"id":"%s","name":"primitree","autoAssignCustomDomains":%s}\n' \
      "$PROJECT_ID" "$auto_assign"
    return 0
  fi
  return 66
}

curl() {
  local url=''
  local path=''
  for url in "$@"; do :; done
  path="${'$'}{url#https://primitree.com}"
  [[ -n "$path" ]] || path=/
  case "$path" in
    /)
      [[ "$PUBLIC_VALID" == true ]] &&
        printf '%s\n' 'Govern token change. Know every consequence.'
      ;;
    /docs) printf '%s\n' 'Primitree checks a local DTCG token file' ;;
    /playground) printf '%s\n' 'This page calls the same build function as' ;;
    /docs/hooks/migration)
      printf '%s\n' 'Primitree 1.0 moves the hooks package from'
      ;;
    '/api/search?query=figma')
      printf '%s\n' '"url":"/docs/concepts/figma-mcp"'
      ;;
    *) return 67 ;;
  esac
  printf '\n%s' "$url"
}

sleep() {
  return 0
}
`
  const base = `${mocks}\nPROJECT_ID=prj_test\nMOCK_FIXED_COMMIT=${fixedCommit}\nCALL_LOG=${JSON.stringify(callLog)}\nMAIN_CALLS=${JSON.stringify(mainCalls)}\nINITIAL_AUTO_ASSIGN=false`

  writeFileSync(callLog, '')
  writeFileSync(mainCalls, '0\n')
  const assignmentAlreadyEnabled = runBash(
    `${base}\nINITIAL_AUTO_ASSIGN=true\nPROMOTE_SUCCEEDS=true\nPUBLIC_VALID=true\nMAIN_STABLE=true\n${runnable}`
  )
  assert.notEqual(assignmentAlreadyEnabled.status, 0)
  assert.equal(readFileSync(callLog, 'utf8'), '')

  writeFileSync(callLog, '')
  writeFileSync(mainCalls, '0\n')
  const failedPromote = runBash(
    `${base}\nPROMOTE_SUCCEEDS=false\nPUBLIC_VALID=true\nMAIN_STABLE=true\n${runnable}`
  )
  assert.notEqual(failedPromote.status, 0)
  assert.equal(readFileSync(callLog, 'utf8'), 'promote\n')

  writeFileSync(callLog, '')
  writeFileSync(mainCalls, '0\n')
  const failedPublic = runBash(
    `${base}\nPROMOTE_SUCCEEDS=true\nPUBLIC_VALID=false\nMAIN_STABLE=true\n${runnable}`
  )
  assert.notEqual(failedPublic.status, 0)
  assert.equal(readFileSync(callLog, 'utf8'), 'promote\npause\n')

  writeFileSync(callLog, '')
  writeFileSync(mainCalls, '0\n')
  const advancedMain = runBash(
    `${base}\nPROMOTE_SUCCEEDS=true\nPUBLIC_VALID=true\nMAIN_STABLE=false\n${runnable}`
  )
  assert.notEqual(advancedMain.status, 0)
  assert.equal(readFileSync(callLog, 'utf8'), 'promote\npause\n')

  writeFileSync(callLog, '')
  writeFileSync(mainCalls, '0\n')
  const recovered = runBash(
    `${base}\nPROMOTE_SUCCEEDS=true\nPUBLIC_VALID=true\nMAIN_STABLE=true\n${runnable}`
  )
  assert.equal(recovered.status, 0, recovered.stderr)
  assert.equal(readFileSync(callLog, 'utf8'), 'promote\npause\nenable\n')
})

test('credential retirement blocks on retained GitHub secrets and npm tokens', t => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  const secretBlock = extractFirstBashBlock(
    extractMarkdownSubsection(
      external,
      '### 7. Delete the GitHub environment secret'
    ),
    'GitHub secret deletion'
  )
  const secretMock = String.raw`
gh() {
  if [[ "$1 $2" == "secret delete" ]]; then
    return 0
  fi
  if [[ "$1 $2" == "secret list" ]]; then
    printf '%s\n' "$GH_SECRET_LIST_JSON"
    return "${'$'}{GH_SECRET_LIST_STATUS:-0}"
  fi
  return 81
}
`
  const retainedSecret = runBash(
    `${secretMock}\nGH_SECRET_LIST_JSON='[{"name":"NPM_TOKEN"}]'\n${secretBlock}`
  )
  assert.notEqual(
    retainedSecret.status,
    0,
    'secret phase must stop when NPM_TOKEN remains listed'
  )
  const removedSecret = runBash(
    `${secretMock}\nGH_SECRET_LIST_JSON='[]'\nGH_SECRET_LIST_STATUS=0\n${secretBlock}`
  )
  assert.equal(removedSecret.status, 0, removedSecret.stderr)
  const failedSecretReadback = runBash(
    `${secretMock}\nGH_SECRET_LIST_JSON='[]'\nGH_SECRET_LIST_STATUS=83\n${secretBlock}`
  )
  assert.notEqual(
    failedSecretReadback.status,
    0,
    'secret phase must reject absence-looking output from a failed list command'
  )

  const tokenBlock = extractFirstBashBlock(
    extractMarkdownSubsection(
      external,
      '### 8. Revoke the exact bootstrap token'
    ),
    'npm token revocation'
  ).replace(
    "BOOTSTRAP_TOKEN_ID='<exact token ID from npm token list --json>'",
    "BOOTSTRAP_TOKEN_ID='token-id-123'"
  )
  const tokenState = join(
    mkdtempSync(join(tmpdir(), 'primitree-token-retirement-')),
    'revoked'
  )
  t.after(() =>
    rmSync(tokenState.slice(0, tokenState.lastIndexOf('/')), {
      recursive: true,
      force: true,
    })
  )
  const tokenMock = String.raw`
npm() {
  if [[ "$1 $2" == "token list" ]]; then
    if [[ -e "$TOKEN_STATE" && "$KEEP_REVOKED_TOKEN" != true ]]; then
      printf '%s\n' '[]'
    else
      printf '%s\n' '[{"key":"token-id-123","token":"npm_example"}]'
    fi
    if [[ ! -e "$TOKEN_STATE" && "$TOKEN_LIST_FAIL_WHEN" == before ]] ||
      [[ -e "$TOKEN_STATE" && "$TOKEN_LIST_FAIL_WHEN" == after ]]; then
      return 84
    fi
    return 0
  fi
  if [[ "$1 $2" == "token revoke" ]]; then
    : >"$TOKEN_STATE"
    return 0
  fi
  return 82
}
`
  const retainedToken = runBash(
    `${tokenMock}\nTOKEN_STATE=${JSON.stringify(tokenState)}\nKEEP_REVOKED_TOKEN=true\nTOKEN_LIST_FAIL_WHEN=''\n${tokenBlock}`
  )
  assert.notEqual(
    retainedToken.status,
    0,
    'token phase must stop when the exact token ID remains listed'
  )
  rmSync(tokenState, { force: true })
  const removedToken = runBash(
    `${tokenMock}\nTOKEN_STATE=${JSON.stringify(tokenState)}\nKEEP_REVOKED_TOKEN=false\nTOKEN_LIST_FAIL_WHEN=''\n${tokenBlock}`
  )
  assert.equal(removedToken.status, 0, removedToken.stderr)
  for (const failure of ['before', 'after']) {
    rmSync(tokenState, { force: true })
    const failedReadback = runBash(
      `${tokenMock}\nTOKEN_STATE=${JSON.stringify(tokenState)}\nKEEP_REVOKED_TOKEN=false\nTOKEN_LIST_FAIL_WHEN=${failure}\n${tokenBlock}`
    )
    assert.notEqual(
      failedReadback.status,
      0,
      `token phase must reject a failed ${failure}-revoke list command`
    )
  }
  const absentIdAndFailedRevoke = runBash(String.raw`
npm() {
  if [[ "$1 $2" == "token list" ]]; then
    printf '%s\n' '[]'
    return 0
  fi
  if [[ "$1 $2" == "token revoke" ]]; then
    return 85
  fi
  return 86
}
${tokenBlock}
`)
  assert.notEqual(
    absentIdAndFailedRevoke.status,
    0,
    'token phase must stop when the chosen ID is absent and revocation fails'
  )
})

test('requires exact automatic main verification before legacy deprecation', () => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  const normalizedExternal = external.replace(/\s+/g, ' ')
  const mergeBlock = extractBashBlockContaining(
    external,
    'git switch main',
    'exact main merge'
  )
  assert.match(mergeBlock, /^set -euo pipefail\n/)

  for (const phrase of [
    VERCEL_PROJECT_ID,
    `test "$(jq -r '.rootDirectory' <<<"$PROJECT_JSON")" = apps/docs`,
    `test "$(jq -r '.sourceFilesOutsideRootDirectory' <<<"$PROJECT_JSON")" = true`,
    '`autoAssignCustomDomains` must be `true`',
    'Successful Vercel deployments from the configured `main` production branch assign the production domains.',
    'Record the current production deployment before merging',
    'previous production deployment ID',
    'exact commit',
    `test "$(jq -r '.target' <<<"$PREVIOUS_PRODUCTION_JSON")" = production`,
    `test "$(jq -r '.projectId' <<<"$PREVIOUS_PRODUCTION_JSON")" = "$PROJECT_ID"`,
    'vercel rollback "$PREVIOUS_PRODUCTION_ID"',
    'restore_previous_production',
    'pause_automatic_production_domains',
    'cancel_unfinished_release_deployment',
    'contain_failed_release',
  ]) {
    assert.ok(
      normalizedExternal.includes(phrase),
      `Vercel phase needs ${phrase}`
    )
  }
  assertInOrder(
    external,
    [
      `PROJECT_ID=${VERCEL_PROJECT_ID}`,
      'vercel api "/v9/projects/$PROJECT_ID"',
      'jq -r \'.link.type\' <<<"$PROJECT_JSON"',
      'jq -r \'.link.org\' <<<"$PROJECT_JSON"',
      'jq -r \'.link.repo\' <<<"$PROJECT_JSON"',
      'jq -r \'.link.productionBranch\' <<<"$PROJECT_JSON"',
      'jq -r \'.autoAssignCustomDomains\' <<<"$PROJECT_JSON"',
      'PREVIOUS_PRODUCTION_SUMMARY=$(vercel inspect primitree.com',
      'PREVIOUS_PRODUCTION_ID=$(jq -er',
      'PREVIOUS_PRODUCTION_JSON=$(vercel api "/v13/deployments/$PREVIOUS_PRODUCTION_ID"',
      `test "$(jq -r '.projectId' <<<"$PREVIOUS_PRODUCTION_JSON")" = "$PROJECT_ID"`,
      'PREVIOUS_PRODUCTION_HOME=$(',
      'PREVIOUS_PRODUCTION_SEARCH=$(',
      'RELEASE_EVENT_BASELINE_JSON=$(',
      'RELEASE_EVENT_BASELINE_ID=$(',
      'POST_HEALTH_PRODUCTION_SUMMARY=$(',
      'git switch main',
      "FINAL_COMMIT=$(git rev-parse 'origin/main^{commit}')",
      'printf \'Final main commit: %s\\n\' "$FINAL_COMMIT"',
      'verify_current_release_identity()',
      'verify_previous_is_release_predecessor()',
      'pause_automatic_production_domains()',
      'cancel_unfinished_release_deployment()',
      'contain_failed_release()',
      'restore_previous_production()',
      "FINAL_COMMIT='<full main commit SHA recorded in step 2>'",
      "PREVIOUS_PRODUCTION_ID='<deployment ID recorded before merge>'",
      "RELEASE_EVENT_BASELINE_ID='<alias-event ID recorded before merge>'",
      'if PRODUCTION_SUMMARY=$(',
      'vercel inspect primitree.com --format=json --scope marklearst',
      'OBSERVED_DEPLOYMENT_ID=$(',
      'vercel api "/v13/deployments/$OBSERVED_DEPLOYMENT_ID"',
      'PRODUCTION_DEPLOYMENT_ID="$OBSERVED_DEPLOYMENT_ID"',
      `test "$(jq -r '.meta.githubCommitSha' <<<"$PRODUCTION_JSON")" =`,
      'wait_for_verified_public_site',
      'npm view "@primitree/core@1.0.0-next.0"',
      LEGACY_DEPRECATION_COMMAND,
    ],
    'automatic production and deprecation'
  )
  assert.doesNotMatch(external, /--prod --skip-domain|protection-bypass/)
  assert.doesNotMatch(external, /\.meta\.gitCommitSha/)
  assert.match(
    external,
    /The main branch advanced[\s\S]*Stop without changing production/
  )
  const publicVerifier = external.slice(
    external.indexOf('public_get()'),
    external.indexOf("FINAL_COMMIT='<full main commit SHA recorded in step 2>'")
  )
  assert.match(
    publicVerifier,
    /curl --fail --location --silent --show-error[\s\S]*--connect-timeout 5 --max-time 20/
  )
  assert.doesNotMatch(publicVerifier, /vercel curl/)
  for (const meaningfulContent of [
    'Govern token change. Know every consequence.',
    'Primitree checks a local DTCG token file',
    'This page calls the same build function as',
    'Primitree 1.0 moves the hooks package from',
    '"url":"/docs/concepts/figma-mcp"',
  ]) {
    assert.ok(
      external.includes(meaningfulContent),
      `deployment verification needs ${meaningfulContent}`
    )
  }
  assert.doesNotMatch(external, /jq -r '\.autoAlias' apps\/docs\/vercel\.json/)
  assert.doesNotMatch(external, /vercel alias set|--force/)
  assert.match(
    external,
    /vercel api "\/v9\/projects\/\$PROJECT_ID"[\s\S]*-X PATCH[\s\S]*-F autoAssignCustomDomains=false/
  )
  assert.match(
    external,
    /vercel api "\/v12\/deployments\/\$RELEASE_DEPLOYMENT_ID\/cancel"[\s\S]*-X PATCH/
  )
  assert.equal(
    occurrences(
      external,
      'vercel promote "$FIXED_DEPLOYMENT_ID" --scope marklearst'
    ),
    1,
    'rollback recovery must explicitly restore automatic domain assignment'
  )
  assertInOrder(
    external,
    [
      'vercel rollback "$PREVIOUS_PRODUCTION_ID"',
      'Failure containment pauses automatic production-domain assignment',
      'vercel promote "$FIXED_DEPLOYMENT_ID" --scope marklearst',
      '-F autoAssignCustomDomains=true',
      'Rerun the project, deployment identity, domain, and public route checks',
    ],
    'rollback recovery'
  )
  assert.match(
    external,
    /rollback[\s\S]*exact recorded[\s\S]*previous production deployment/i
  )
  assert.equal(occurrences(external, LEGACY_DEPRECATION_COMMAND), 1)
  assert.match(
    external,
    new RegExp(
      `\\\`${LEGACY_HOOKS_PACKAGE}@4\\.0\\.0\\\` receives no new version`,
      'i'
    )
  )
  assert.match(
    external,
    /six replacement packages[\s\S]*production documentation site[\s\S]*migration page[\s\S]*before deprecation/i
  )
  assert.doesNotMatch(external, /npm deprecate[^\n]*@(?:\*|[^"\s]+@\*)/)
})

test('binds previous and automatic production deployments to immutable identities', () => {
  const external = extractMarkdownSection(
    releaseRunbook,
    '## External npm and GitHub steps'
  )
  assertInOrder(
    external,
    [
      'PREVIOUS_PRODUCTION_SUMMARY=$(vercel inspect primitree.com',
      "PREVIOUS_PRODUCTION_ID=$(jq -er '.id |",
      'PREVIOUS_PRODUCTION_JSON=$(vercel api "/v13/deployments/$PREVIOUS_PRODUCTION_ID"',
      `test "$(jq -r '.id' <<<"$PREVIOUS_PRODUCTION_JSON")" = "$PREVIOUS_PRODUCTION_ID"`,
      `test "$(jq -r '.projectId' <<<"$PREVIOUS_PRODUCTION_JSON")" = "$PROJECT_ID"`,
      'git switch main',
      "FINAL_COMMIT=$(git rev-parse 'origin/main^{commit}')",
      'printf \'Final main commit: %s\\n\' "$FINAL_COMMIT"',
      'require_release_main_unchanged',
      'verify_current_release_identity()',
      'if PRODUCTION_SUMMARY=$(',
      'OBSERVED_DEPLOYMENT_ID=$(',
      'vercel api "/v13/deployments/$OBSERVED_DEPLOYMENT_ID"',
      `[[ "$(jq -r '.projectId' <<<"$PRODUCTION_JSON")" ==`,
      'PRODUCTION_DEPLOYMENT_ID="$OBSERVED_DEPLOYMENT_ID"',
      `test "$(jq -r '.id' <<<"$PRODUCTION_JSON")" = "$PRODUCTION_DEPLOYMENT_ID"`,
      `test "$(jq -r '.meta.githubCommitSha' <<<"$PRODUCTION_JSON")" =`,
      'wait_for_verified_public_site',
      'verify_production_domain_id',
    ],
    'deployment identity'
  )
  assert.equal(occurrences(external, 'PREVIOUS_PRODUCTION_ID=$(jq -er'), 1)
  assert.equal(occurrences(external, 'OBSERVED_DEPLOYMENT_ID=$('), 1)
  assert.match(
    external,
    /production domain[\s\S]*exact deployment ID[\s\S]*exact merged commit/i
  )
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

test('documents stable and next channels with the exact eight-file artifact boundary', () => {
  const semantics = extractMarkdownSection(
    releaseRunbook,
    '## Release channel semantics'
  )
  assert.match(semantics, /all six public packages share one version/i)
  assert.doesNotMatch(semantics, /public and private workspaces/i)
  assert.match(semantics, /tag\s+must be the exact version prefixed with `v`/i)
  assert.match(semantics, /`latest` dist-tag/)
  assert.match(semantics, /`-next\.N` use `next`/i)
  assert.match(semantics, /removes[\s\S]*unexpected `latest`/i)

  const artifactBoundary = extractMarkdownSection(
    releaseRunbook,
    '## Release artifact boundary'
  )
  const expectedFiles = [
    'primitree-core-$VERSION.tgz',
    'primitree-dtcg-$VERSION.tgz',
    'primitree-cli-$VERSION.tgz',
    'primitree-hooks-$VERSION.tgz',
    'primitree-mcp-$VERSION.tgz',
    'primitree-$VERSION.tgz',
    'manifest.json',
    'SHA256SUMS',
  ]
  assert.deepEqual(extractOrderedCodeList(artifactBoundary), expectedFiles)
  assert.match(
    artifactBoundary,
    /contains these eight regular,[\s\S]*non-symlink files and no others/i
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
  const branchPreflight = extractMarkdownSubsection(
    external,
    '### 1. Branch preflight'
  )
  const tagPhase = extractMarkdownSubsection(
    external,
    '### 5. Tag, publish, and create the GitHub prerelease'
  )
  const checklist = [...external.matchAll(/^- \[([ xX])\] /gm)]
  assert.equal(checklist.length, 11)
  assert.ok(checklist.every(item => item[1] === ' '))
  assert.doesNotMatch(external, /stale `v4\.2\.0` tag/i)
  assert.match(
    branchPreflight,
    /REMOTE_TAG_REFS=\$\([\s\S]*git ls-remote --tags origin[\s\S]*\)[\s\S]*test -z "\$REMOTE_TAG_REFS"/
  )
  assert.match(
    branchPreflight,
    /GITHUB_RELEASES=\$\([\s\S]*gh release list --repo marklearst\/primitree --json tagName[\s\S]*\)[\s\S]*test "\$GITHUB_RELEASES" = '\[\]'/
  )
  assert.match(
    tagPhase,
    /^- \[ \] Create `v1\.0\.0-next\.0` at the final verified commit and no other commit, push the single intended tag, and approve publication\.$/m
  )
  assert.doesNotMatch(tagPhase, /^- \[ \] Recreate `v1\.0\.0`/m)
  for (const phrase of [
    '@primitree ownership, 2FA, and new-package rights',
    'token-authenticated publish',
    'trusted publishing for all six packages',
    'protected npm and GitHub environments and rulesets',
    'GitHub environment `npm`',
    '`v1.0.0-next.0` at the final verified commit and no other commit',
    'single intended tag',
    'immutable releases',
    'release tag updates and deletions',
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
  assert.match(
    releaseRunbook,
    /isolation[\s\S]*blocks credential reads[\s\S]*OIDC discovery[\s\S]*registry requests/i
  )
  assert.match(
    releaseRunbook,
    /dry-run[\s\S]*cannot prove npm access[\s\S]*provenance/i
  )
  assert.match(
    releaseRunbook,
    /workflow[\s\S]*creates or resumes[\s\S]*GitHub Release/i
  )
  assert.match(external, /may create an unprotected environment record/i)
  assert.match(external, /administrator[\s\S]*before a tag run/i)
  assert.match(external, /Administration[\s\S]*read/)
  assert.match(external, /job-scoped `GITHUB_TOKEN`[\s\S]*cannot perform/i)
  assert.match(
    external,
    /ruleset[\s\S]*release tag updates and deletions[\s\S]*immutable-release protection[\s\S]*after\s+publication/i
  )
  assert.match(
    external,
    /X-GitHub-Api-Version: 2026-03-10[\s\S]*\/repos\/marklearst\/primitree\/immutable-releases[\s\S]*--jq '\.enabled == true'[\s\S]*= true/
  )
})

test('freezes same-byte recovery queries and retries in dependency order', () => {
  const recovery = extractMarkdownSection(
    releaseRunbook,
    '## Partial publication recovery'
  )
  const viewCommands = RELEASE_PUBLISH_PACKAGES.map(
    ({ name }) =>
      `npm view "${name}@$VERSION" version --registry=https://registry.npmjs.org`
  )
  const publishCommands = RELEASE_PUBLISH_PACKAGES.map(
    ({ stem }) =>
      `npm publish "$ARTIFACT_DIR/primitree-${stem === 'primitree' ? '' : `${stem}-`}$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag="$RELEASE_CHANNEL" --ignore-scripts`
  )

  assertInOrder(recovery, viewCommands, 'partial publication queries')
  assertInOrder(recovery, publishCommands, 'same-byte publication retries')
  for (const command of viewCommands) {
    assert.equal(occurrences(releaseRunbook, command), 2)
  }
  for (const command of publishCommands) {
    assert.equal(occurrences(releaseRunbook, command), 1)
  }
  assert.match(
    recovery,
    /treats npm `E404`, and no other response, as missing/i
  )
  assert.match(recovery, /Any other error[\s\S]*stops[\s\S]*recovery/i)
  assert.match(recovery, /verified tarballs/i)
  assert.match(recovery, /Never rebuild/i)
  assert.match(recovery, /shasum -a 256 -c SHA256SUMS/)
  assert.match(recovery, /Linux[\s\S]*sha256sum --check SHA256SUMS/i)
  assert.match(recovery, /Re-run failed jobs/)
  assert.match(recovery, /sole\s+supported selective recovery path/i)
  assert.match(
    recovery,
    /`npm publish` commands[\s\S]*do not execute[\s\S]*from a local machine/i
  )
})

test('documents dist-tag, invalid-content, and immutable artifact recovery', () => {
  const recovery = extractMarkdownSection(
    releaseRunbook,
    '## Partial publication recovery'
  )
  for (const command of [
    'npm dist-tag ls "@primitree/core" --registry=https://registry.npmjs.org',
    'npm dist-tag add "@primitree/core@$VERSION" next --registry=https://registry.npmjs.org',
    'npm dist-tag rm "@primitree/core" latest --registry=https://registry.npmjs.org',
    'npm deprecate "@primitree/core@$VERSION" "Use 1.0.1; this release contains invalid package contents" --registry=https://registry.npmjs.org',
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
  assert.match(recovery, /run ID and commit SHA/i)
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
    /pushed wrong tag[\s\S]*publish job never started[\s\S]*all six/i
  )
  assert.match(recovery, /started publish job[\s\S]*blocks tag movement/i)
  assert.match(recovery, /preserve provenance/i)
  assert.match(
    recovery,
    /GitHub Release[\s\S]*re-run failed jobs[\s\S]*without moving the tag/i
  )
  assert.match(
    recovery,
    /credential[\s\S]*preserve the artifact and checksums[\s\S]*retries packages[\s\S]*missing[\s\S]*verified tarballs/i
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
  assert.match(recovery, /Cancel an active old run/i)
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
