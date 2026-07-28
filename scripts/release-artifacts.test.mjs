import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  accessSync,
  chmodSync,
  constants as fsConstants,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const VERSION = '1.0.0'
const EXPECTED_NAMES = [
  '@primitree/core',
  '@primitree/dtcg',
  '@primitree/cli',
  '@primitree/hooks',
  '@primitree/mcp',
]
const EXPECTED_FILES = [
  'primitree-core-1.0.0.tgz',
  'primitree-dtcg-1.0.0.tgz',
  'primitree-cli-1.0.0.tgz',
  'primitree-hooks-1.0.0.tgz',
  'primitree-mcp-1.0.0.tgz',
]
const SCRIPT_PATH = fileURLToPath(
  new URL('./release-artifacts.mjs', import.meta.url)
)
const RELEASE_CONFIG_PATH = fileURLToPath(
  new URL('./release-config.mjs', import.meta.url)
)
const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url))
const PUBLIC_NPM_REGISTRY = 'https://registry.npmjs.org/'

function findExecutable(command) {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (directory === '') continue
    const candidate = path.join(directory, command)
    try {
      accessSync(candidate, fsConstants.X_OK)
      return realpathSync(candidate)
    } catch {
      // Try the next PATH entry.
    }
  }
  throw new Error(`unable to find executable: ${command}`)
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function checksumText(artifacts) {
  return `${artifacts.map(item => `${item.sha256}  ${item.file}`).join('\n')}\n`
}

function writeManifest(directory, manifest) {
  writeFileSync(
    path.join(directory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  )
}

function writeChecksums(directory, value) {
  writeFileSync(path.join(directory, 'SHA256SUMS'), value)
}

function makeFixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'primitree-artifacts-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))

  const artifacts = EXPECTED_NAMES.map((name, index) => {
    const file = EXPECTED_FILES[index]
    const bytes = Buffer.from(`fixture:${name}\n`)
    writeFileSync(path.join(directory, file), bytes)
    return { name, file, sha256: digest(bytes) }
  })
  const manifest = { version: VERSION, artifacts }
  writeManifest(directory, manifest)
  writeChecksums(directory, checksumText(artifacts))

  return {
    artifacts,
    directory,
    manifest,
    rewriteChecksums(value = checksumText(manifest.artifacts)) {
      writeChecksums(directory, value)
    },
    rewriteManifest() {
      writeManifest(directory, manifest)
    },
  }
}

function createSymlinkOrSkip(t, target, linkPath, type) {
  try {
    symlinkSync(target, linkPath, type)
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.skip(`symlinks unavailable: ${error.code}`)
      return false
    }
    throw error
  }
  return true
}

function makeHostileNpmProbe(
  t,
  {
    expectedRepository = REPOSITORY_ROOT,
    realNpmConfig = false,
    realPnpmPack = false,
    validateIsolation = true,
    wrongRegistry = false,
  } = {}
) {
  const directory = mkdtempSync(path.join(tmpdir(), 'primitree-npm-probe-'))
  const binDirectory = path.join(directory, 'bin')
  const hostileHome = path.join(directory, 'hostile-home')
  const hostileProject = path.join(directory, 'hostile-project')
  const logPath = path.join(directory, 'calls.jsonl')
  mkdirSync(binDirectory)
  mkdirSync(hostileHome)
  mkdirSync(hostileProject)
  writeFileSync(logPath, '')
  writeFileSync(
    path.join(hostileHome, '.npmrc'),
    'registry=https://home.invalid/\n//registry.npmjs.org/:_authToken=home-secret\n'
  )
  writeFileSync(
    path.join(hostileProject, '.npmrc'),
    'registry=https://project.invalid/\n@primitree:registry=https://scope.invalid/\n'
  )
  writeFileSync(
    path.join(directory, 'hostile-global-npmrc'),
    'registry=https://global.invalid/\n'
  )
  writeFileSync(
    path.join(directory, 'hostile-user-npmrc'),
    '//registry.npmjs.org/:_authToken=user-secret\n'
  )

  const probeSource = `#!/usr/bin/env node
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const registry = ${JSON.stringify(PUBLIC_NPM_REGISTRY)}
const args = process.argv.slice(2)
const command = path.basename(process.argv[1])
appendFileSync(
  process.env.PROBE_LOG,
  JSON.stringify({ args, command, cwd: process.cwd() }) + '\\n'
)

function fail(message) {
  process.stderr.write(message + '\\n')
  process.exit(90)
}

function runRealCommand(executable) {
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  process.exit(result.status ?? 91)
}

if (process.env.PROBE_VALIDATE_ISOLATION === '1') {
  const allowedNpmConfig = new Set([
    'NPM_CONFIG_CACHE',
    'NPM_CONFIG_GLOBALCONFIG',
    'NPM_CONFIG_USERCONFIG',
  ])
  for (const key of Object.keys(process.env)) {
    const upper = key.toUpperCase()
    if (upper.startsWith('NPM_CONFIG_')) {
      if (!allowedNpmConfig.has(upper)) {
        fail('unexpected npm config variable: ' + key)
      }
      continue
    }
    if (upper.startsWith('PNPM_CONFIG_')) {
      fail('unexpected pnpm config variable: ' + key)
    }
    if (
      upper.includes('TOKEN') ||
      upper.includes('AUTH') ||
      upper.includes('CREDENTIAL') ||
      upper.includes('PASSWORD') ||
      upper.includes('SECRET') ||
      upper.endsWith('_OTP') ||
      upper.startsWith('ACTIONS_ID_TOKEN_REQUEST_')
    ) {
      fail('unexpected credential variable: ' + key)
    }
    if (upper === 'NODE_OPTIONS') {
      fail('unexpected Node options')
    }
  }

  const home = process.env.HOME
  const cache = process.env.NPM_CONFIG_CACHE
  const userConfig = process.env.NPM_CONFIG_USERCONFIG
  const globalConfig = process.env.NPM_CONFIG_GLOBALCONFIG
  const controlledRoot = path.dirname(home)
  if (
    home === process.env.PROBE_HOSTILE_HOME ||
    path.dirname(cache) !== controlledRoot ||
    path.dirname(userConfig) !== controlledRoot ||
    path.dirname(globalConfig) !== controlledRoot ||
    !existsSync(cache)
  ) {
    fail('npm paths are not controlled by one temporary root')
  }
  if (readFileSync(userConfig, 'utf8') !== '') {
    fail('npm user config must be empty')
  }
  if (
    readFileSync(globalConfig, 'utf8') !==
    'registry=' + registry + '\\n@primitree:registry=' + registry + '\\n'
  ) {
    fail('npm global config must contain only the public registries')
  }
  const controlledWork = realpathSync(path.join(controlledRoot, 'work'))
  for (const key of [
    'INIT_CWD',
    'PNPM_HOME',
    'PWD',
    'XDG_CACHE_HOME',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'XDG_STATE_HOME',
  ]) {
    if (
      !realpathSync(process.env[key]).startsWith(
        realpathSync(controlledRoot) + path.sep
      )
    ) {
      fail(key + ' must be controlled')
    }
  }
  if (
    process.cwd() !== controlledWork &&
    !process.cwd().startsWith(controlledWork + path.sep)
  ) {
    fail('npm subprocess cwd must be controlled')
  }
  if (
    command === 'pnpm' &&
    (!args.includes('--config.registry=' + registry) ||
      !args.includes('--config.@primitree:registry=' + registry))
  ) {
    fail('pnpm registry overrides are missing')
  }
  if (command === 'pnpm' && args.includes('pack')) {
    const packageDirectory = realpathSync(args[args.indexOf('--dir') + 1])
    const expectedRepository = realpathSync(
      process.env.PROBE_EXPECTED_REPOSITORY
    )
    if (
      !packageDirectory.startsWith(
        path.join(expectedRepository, 'packages') + path.sep
      )
    ) {
      fail('pnpm pack directory is outside the repository')
    }
  }
  if (
    ['attw', 'publint'].includes(command) &&
    !realpathSync(process.argv[1]).startsWith(
      realpathSync(process.env.PROBE_EXPECTED_REPOSITORY) + path.sep
    )
  ) {
    fail('inspection tool is outside the repository')
  }
  if (
    command === 'npm' &&
    ['install', 'publish'].includes(args[0]) &&
    !args.includes('--registry=' + registry)
  ) {
    fail('npm registry override is missing')
  }
}

if (command === 'npm' && args[0] === 'config' && args[1] === 'get') {
  if (process.env.PROBE_REAL_NPM_CONFIG === '1') {
    runRealCommand(process.env.PROBE_REAL_NPM_PATH)
  }
  process.stdout.write(
    (process.env.PROBE_WRONG_REGISTRY === '1'
      ? 'https://effective.invalid/'
      : registry) + '\\n'
  )
  process.exit(0)
}

if (command === 'pnpm' && args.includes('pack')) {
  if (process.env.PROBE_REAL_PNPM_PACK === '1') {
    runRealCommand(process.env.PROBE_REAL_PNPM_PATH)
  }
  const packageDirectory = args[args.indexOf('--dir') + 1]
  const manifest = JSON.parse(
    readFileSync(path.join(packageDirectory, 'package.json'), 'utf8')
  )
  const outputPattern = args[args.indexOf('--out') + 1]
  const filename = outputPattern
    .replace('%s', manifest.name.replace('@primitree/', 'primitree-'))
    .replace('%v', manifest.version)
  mkdirSync(path.dirname(filename), { recursive: true })
  writeFileSync(filename, 'packed:' + manifest.name + '\\n')
  process.stdout.write(
    JSON.stringify({
      files: [],
      filename,
      name: manifest.name,
      version: manifest.version,
    })
  )
}
`
  for (const command of ['npm', 'pnpm']) {
    const commandPath = path.join(binDirectory, command)
    writeFileSync(commandPath, probeSource)
    chmodSync(commandPath, 0o755)
  }

  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return {
    binDirectory,
    directory,
    environment: {
      ...process.env,
      ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'oidc-secret',
      ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.invalid/',
      GITHUB_TOKEN: 'github-secret',
      HOME: hostileHome,
      INIT_CWD: hostileProject,
      NODE_AUTH_TOKEN: 'node-secret',
      NPM_CONFIG_CACHE: path.join(directory, 'hostile-cache'),
      NPM_CONFIG_PROVENANCE: 'true',
      NPM_CONFIG_REGISTRY: 'https://environment.invalid/',
      NPM_CONFIG_TOKEN: 'config-secret',
      NPM_CONFIG_USERCONFIG: path.join(directory, 'hostile-user-npmrc'),
      NPM_TOKEN: 'npm-secret',
      NODE_OPTIONS: '--no-warnings',
      PATH: `${binDirectory}${path.delimiter}${process.env.PATH}`,
      PNPM_HOME: path.join(directory, 'hostile-pnpm-home'),
      PNPM_CONFIG_AUTH_TOKEN: 'pnpm-secret',
      PNPM_CONFIG_REGISTRY: 'https://pnpm-environment.invalid/',
      PROBE_EXPECTED_REPOSITORY: expectedRepository,
      PROBE_HOSTILE_HOME: hostileHome,
      PROBE_LOG: logPath,
      PROBE_REAL_NPM_CONFIG: realNpmConfig ? '1' : '0',
      PROBE_REAL_NPM_PATH: realNpmConfig ? findExecutable('npm') : '',
      PROBE_REAL_PNPM_PACK: realPnpmPack ? '1' : '0',
      PROBE_REAL_PNPM_PATH: realPnpmPack ? findExecutable('pnpm') : '',
      PROBE_VALIDATE_ISOLATION: validateIsolation ? '1' : '0',
      PROBE_WRONG_REGISTRY: wrongRegistry ? '1' : '0',
      PWD: hostileProject,
      RELEASE_PASSWORD: 'release-secret',
      SIGSTORE_ID_TOKEN: 'sigstore-secret',
      XDG_CACHE_HOME: path.join(directory, 'hostile-xdg-cache'),
      XDG_CONFIG_HOME: path.join(directory, 'hostile-xdg-config'),
      XDG_DATA_HOME: path.join(directory, 'hostile-xdg-data'),
      XDG_STATE_HOME: path.join(directory, 'hostile-xdg-state'),
      npm_config_globalconfig: path.join(directory, 'hostile-global-npmrc'),
      npm_config_scope_registry: 'https://scope-environment.invalid/',
    },
    hostileProject,
    logPath,
  }
}

function makePackRepository(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'primitree-pack-repo-'))
  const scriptsDirectory = path.join(directory, 'scripts')
  mkdirSync(scriptsDirectory)
  copyFileSync(
    SCRIPT_PATH,
    path.join(scriptsDirectory, 'release-artifacts.mjs')
  )
  copyFileSync(
    RELEASE_CONFIG_PATH,
    path.join(scriptsDirectory, 'release-config.mjs')
  )

  for (const name of EXPECTED_NAMES) {
    const packageName = name.slice('@primitree/'.length)
    const packageDirectory = path.join(directory, 'packages', packageName)
    mkdirSync(path.join(packageDirectory, 'dist'), { recursive: true })
    writeFileSync(
      path.join(packageDirectory, 'package.json'),
      `${JSON.stringify({ name, version: VERSION })}\n`
    )
    if (name === '@primitree/dtcg') {
      writeFileSync(
        path.join(packageDirectory, 'README.md'),
        'Read the [changelog](CHANGELOG.md).\n'
      )
      writeFileSync(
        path.join(packageDirectory, 'CHANGELOG.md'),
        '# Changelog\n'
      )
    }
    if (name === '@primitree/hooks') {
      mkdirSync(path.join(packageDirectory, 'scripts'))
      writeFileSync(
        path.join(packageDirectory, 'scripts', 'export-variables.mjs'),
        ''
      )
    }
  }

  t.after(() => rmSync(directory, { recursive: true, force: true }))
  return {
    directory,
    scriptPath: path.join(scriptsDirectory, 'release-artifacts.mjs'),
  }
}

function prepareArtifactCheckRepository(repository, fixture, probe) {
  const artifactDirectory = path.join(repository.directory, 'artifacts', 'npm')
  const localBinDirectory = path.join(
    repository.directory,
    'node_modules',
    '.bin'
  )
  mkdirSync(artifactDirectory, { recursive: true })
  mkdirSync(localBinDirectory, { recursive: true })
  for (const file of ['manifest.json', 'SHA256SUMS', ...EXPECTED_FILES]) {
    copyFileSync(
      path.join(fixture.directory, file),
      path.join(artifactDirectory, file)
    )
  }
  for (const command of ['publint', 'attw']) {
    const commandPath = path.join(localBinDirectory, command)
    copyFileSync(path.join(probe.binDirectory, 'pnpm'), commandPath)
    chmodSync(commandPath, 0o755)
  }
}

function runArtifactCli(scriptPath, args, { cwd, environment }) {
  return spawnSync(process.execPath, [realpathSync(scriptPath), ...args], {
    cwd,
    encoding: 'utf8',
    env: environment,
  })
}

async function releaseArtifactsModule() {
  return import('./release-artifacts.mjs')
}

async function expectInvalid(t, mutate, pattern) {
  const fixture = makeFixture(t)
  await mutate(fixture)
  const { verifyReleaseArtifacts } = await releaseArtifactsModule()
  assert.throws(
    () => verifyReleaseArtifacts({ artifactDirectory: fixture.directory }),
    pattern
  )
}

test('derives the expected artifacts in dependency order', async () => {
  const { expectedArtifacts } = await releaseArtifactsModule()
  assert.deepEqual(
    expectedArtifacts(VERSION),
    EXPECTED_NAMES.map((name, index) => ({
      name,
      file: EXPECTED_FILES[index],
    }))
  )
  assert.throws(() => expectedArtifacts('v1.0.0'), /MAJOR\.MINOR\.PATCH/)
  assert.throws(() => expectedArtifacts('1.0.0-beta.1'), /MAJOR\.MINOR\.PATCH/)
})

test('constructs stable public npm publish dry-run arguments', async () => {
  const { npmPublishDryRunArgs } = await releaseArtifactsModule()
  const artifactPath = path.join(
    tmpdir(),
    'primitree-artifacts',
    EXPECTED_FILES[0]
  )

  assert.deepEqual(npmPublishDryRunArgs(artifactPath), [
    'publish',
    artifactPath,
    '--dry-run',
    '--offline',
    '--provenance=false',
    '--access=public',
    '--tag=latest',
    '--ignore-scripts',
    '--registry=https://registry.npmjs.org/',
  ])
  assert.throws(
    () => npmPublishDryRunArgs(EXPECTED_FILES[0]),
    /absolute tarball path/i
  )
})

test('packing refuses repository and package npm config before pnpm', t => {
  for (const relativeConfigPath of ['.npmrc', 'packages/dtcg/.npmrc']) {
    const repository = makePackRepository(t)
    const probe = makeHostileNpmProbe(t, {
      expectedRepository: repository.directory,
      validateIsolation: false,
    })
    writeFileSync(
      path.join(repository.directory, relativeConfigPath),
      'registry=https://project.invalid/\n'
    )

    const result = runArtifactCli(repository.scriptPath, ['pack'], {
      cwd: probe.hostileProject,
      environment: probe.environment,
    })

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /project npm config.*not allowed/i)
    assert.equal(readFileSync(probe.logPath, 'utf8'), '')
  }
})

test('real offline packing isolates every pnpm subprocess from hostile npm state', t => {
  const repository = makePackRepository(t)
  const probe = makeHostileNpmProbe(t, {
    expectedRepository: repository.directory,
    realPnpmPack: true,
  })

  const result = runArtifactCli(repository.scriptPath, ['pack'], {
    cwd: probe.hostileProject,
    environment: probe.environment,
  })

  assert.equal(
    result.status,
    0,
    `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  )
  const calls = readFileSync(probe.logPath, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  assert.equal(calls.length, EXPECTED_NAMES.length)
  assert.ok(calls.every(call => call.command === 'pnpm'))
  assert.ok(calls.every(call => call.args.includes('--ignore-workspace')))
  assert.ok(
    calls.every(call => call.args.includes('--config.ignore-scripts=true'))
  )
  assert.ok(calls.every(call => call.args.includes('--config.offline=true')))
  assert.ok(
    calls.every(call =>
      call.args.some(
        argument => argument === `--config.registry=${PUBLIC_NPM_REGISTRY}`
      )
    )
  )
  assert.ok(
    calls.every(call =>
      call.args.some(
        argument =>
          argument === `--config.@primitree:registry=${PUBLIC_NPM_REGISTRY}`
      )
    )
  )
})

test('real npm registry lookup ignores hostile artifact-check state', t => {
  const fixture = makeFixture(t)
  const repository = makePackRepository(t)
  const probe = makeHostileNpmProbe(t, {
    expectedRepository: repository.directory,
    realNpmConfig: true,
  })
  prepareArtifactCheckRepository(repository, fixture, probe)

  const result = runArtifactCli(repository.scriptPath, ['check'], {
    cwd: probe.hostileProject,
    environment: probe.environment,
  })

  assert.equal(
    result.status,
    0,
    `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  )
  const calls = readFileSync(probe.logPath, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  const installIndex = calls.findIndex(
    call => call.command === 'npm' && call.args[0] === 'install'
  )
  assert.notEqual(installIndex, -1)
  assert.deepEqual(
    calls
      .slice(installIndex - 2, installIndex)
      .map(call => call.args.slice(0, 3)),
    [
      ['config', 'get', 'registry'],
      ['config', 'get', '@primitree:registry'],
    ]
  )
})

test('artifact consumer fails closed before install on registry mismatch', t => {
  const fixture = makeFixture(t)
  const repository = makePackRepository(t)
  const probe = makeHostileNpmProbe(t, {
    expectedRepository: repository.directory,
    validateIsolation: false,
    wrongRegistry: true,
  })
  prepareArtifactCheckRepository(repository, fixture, probe)
  const artifactDirectory = path.join(repository.directory, 'artifacts', 'npm')
  const before = new Map(
    ['manifest.json', 'SHA256SUMS', ...EXPECTED_FILES].map(file => [
      file,
      readFileSync(path.join(artifactDirectory, file)),
    ])
  )

  const result = runArtifactCli(repository.scriptPath, ['check'], {
    cwd: probe.hostileProject,
    environment: probe.environment,
  })

  assert.notEqual(result.status, 0)
  assert.match(
    result.stderr,
    /effective npm registry must be https:\/\/registry\.npmjs\.org\//
  )
  const calls = readFileSync(probe.logPath, 'utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line))
  assert.equal(
    calls.some(call => call.command === 'npm' && call.args[0] === 'install'),
    false
  )
  for (const [file, bytes] of before) {
    assert.deepEqual(readFileSync(path.join(artifactDirectory, file)), bytes)
  }
})

test('accepts exactly five ordered artifacts and performs no writes', async t => {
  const fixture = makeFixture(t)
  const before = new Map(
    ['manifest.json', 'SHA256SUMS', ...EXPECTED_FILES].map(file => [
      file,
      readFileSync(path.join(fixture.directory, file)),
    ])
  )
  const { verifyReleaseArtifacts } = await releaseArtifactsModule()

  const result = verifyReleaseArtifacts({
    artifactDirectory: pathToFileURL(`${fixture.directory}${path.sep}`),
  })

  assert.equal(result.version, VERSION)
  assert.deepEqual(
    result.artifacts.map(({ name, file }) => ({ name, file })),
    EXPECTED_NAMES.map((name, index) => ({
      name,
      file: EXPECTED_FILES[index],
    }))
  )
  for (const artifact of result.artifacts) {
    assert.equal(artifact.path, path.join(fixture.directory, artifact.file))
    assert.match(artifact.sha256, /^[a-f0-9]{64}$/)
  }
  for (const [file, bytes] of before) {
    assert.deepEqual(readFileSync(path.join(fixture.directory, file)), bytes)
  }
})

test('release checks require all seven artifact files to remain byte-identical', async t => {
  const fixture = makeFixture(t)
  const { checkReleaseArtifacts, verifyReleaseArtifacts } =
    await releaseArtifactsModule()

  const unchanged = checkReleaseArtifacts({
    artifactDirectory: fixture.directory,
    runChecks: () => {},
  })
  assert.equal(unchanged.version, VERSION)

  assert.throws(
    () =>
      checkReleaseArtifacts({
        artifactDirectory: fixture.directory,
        runChecks: () => {
          for (const artifact of fixture.manifest.artifacts) {
            const bytes = Buffer.from(`coherent replacement:${artifact.name}\n`)
            writeFileSync(path.join(fixture.directory, artifact.file), bytes)
            artifact.sha256 = digest(bytes)
          }
          fixture.rewriteManifest()
          fixture.rewriteChecksums()
        },
      }),
    /release artifact bytes changed during validation checks/
  )

  const coherentlyReplaced = verifyReleaseArtifacts({
    artifactDirectory: fixture.directory,
  })
  assert.equal(coherentlyReplaced.version, VERSION)
  assert.deepEqual(
    coherentlyReplaced.artifacts.map(artifact => artifact.sha256),
    fixture.manifest.artifacts.map(artifact => artifact.sha256)
  )
})

test('release checks verify artifact bytes when a validator fails', async t => {
  const fixture = makeFixture(t)
  const { checkReleaseArtifacts } = await releaseArtifactsModule()

  assert.throws(
    () =>
      checkReleaseArtifacts({
        artifactDirectory: fixture.directory,
        runChecks: () => {
          for (const artifact of fixture.manifest.artifacts) {
            const bytes = Buffer.from(`failed replacement:${artifact.name}\n`)
            writeFileSync(path.join(fixture.directory, artifact.file), bytes)
            artifact.sha256 = digest(bytes)
          }
          fixture.rewriteManifest()
          fixture.rewriteChecksums()
          throw new Error('validator failed after mutating artifacts')
        },
      }),
    /release artifact bytes changed during validation checks/
  )
})

test('release checks reject asynchronous check injection', async t => {
  const fixture = makeFixture(t)
  const { checkReleaseArtifacts } = await releaseArtifactsModule()
  assert.throws(
    () =>
      checkReleaseArtifacts({
        artifactDirectory: fixture.directory,
        runChecks: async () => {},
      }),
    /runChecks must be a synchronous function/
  )
})

test('rejects an invalid artifact directory', async t => {
  await t.test('missing', async t => {
    const parent = mkdtempSync(path.join(tmpdir(), 'primitree-missing-'))
    t.after(() => rmSync(parent, { recursive: true, force: true }))
    const { verifyReleaseArtifacts } = await releaseArtifactsModule()
    assert.throws(
      () =>
        verifyReleaseArtifacts({
          artifactDirectory: path.join(parent, 'missing'),
        }),
      /artifact directory.*exist|unable to inspect artifact directory/i
    )
  })

  await t.test('regular file', async t => {
    const parent = mkdtempSync(path.join(tmpdir(), 'primitree-file-'))
    t.after(() => rmSync(parent, { recursive: true, force: true }))
    const file = path.join(parent, 'artifacts')
    writeFileSync(file, 'not a directory')
    const { verifyReleaseArtifacts } = await releaseArtifactsModule()
    assert.throws(
      () => verifyReleaseArtifacts({ artifactDirectory: file }),
      /artifact directory.*real directory/i
    )
  })

  await t.test('symlink', async t => {
    const target = mkdtempSync(path.join(tmpdir(), 'primitree-target-'))
    const parent = mkdtempSync(path.join(tmpdir(), 'primitree-link-'))
    t.after(() => rmSync(target, { recursive: true, force: true }))
    t.after(() => rmSync(parent, { recursive: true, force: true }))
    const link = path.join(parent, 'artifacts')
    if (!createSymlinkOrSkip(t, target, link, 'dir')) return
    const { verifyReleaseArtifacts } = await releaseArtifactsModule()
    assert.throws(
      () => verifyReleaseArtifacts({ artifactDirectory: link }),
      /artifact directory.*real directory/i
    )
  })

  await t.test('symlinked parent', async t => {
    const fixture = makeFixture(t)
    const external = mkdtempSync(
      path.join(tmpdir(), 'primitree-parent-target-')
    )
    const root = mkdtempSync(path.join(tmpdir(), 'primitree-parent-link-'))
    t.after(() => rmSync(external, { recursive: true, force: true }))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    renameSync(fixture.directory, path.join(external, 'npm'))
    if (
      !createSymlinkOrSkip(t, external, path.join(root, 'artifacts'), 'dir')
    ) {
      return
    }

    const { verifyReleaseArtifacts } = await releaseArtifactsModule()
    assert.throws(
      () =>
        verifyReleaseArtifacts({
          artifactDirectory: path.join(root, 'artifacts', 'npm'),
        }),
      /artifact directory parent.*real directory/i
    )
  })

  await t.test('relative path', async () => {
    const { verifyReleaseArtifacts } = await releaseArtifactsModule()
    assert.throws(
      () => verifyReleaseArtifacts({ artifactDirectory: 'artifacts/npm' }),
      /absolute path or file URL/i
    )
  })
})

test('rejects malformed manifest metadata', async t => {
  const cases = [
    [
      'missing manifest',
      f => unlinkSync(path.join(f.directory, 'manifest.json')),
      /manifest\.json.*regular file/i,
    ],
    [
      'invalid JSON',
      f => writeFileSync(path.join(f.directory, 'manifest.json'), '{'),
      /manifest\.json.*JSON/i,
    ],
    [
      'null manifest',
      f => writeFileSync(path.join(f.directory, 'manifest.json'), 'null'),
      /manifest\.json.*plain object/i,
    ],
    [
      'array manifest',
      f => writeFileSync(path.join(f.directory, 'manifest.json'), '[]'),
      /manifest\.json.*plain object/i,
    ],
    [
      'missing version',
      f => {
        delete f.manifest.version
        f.rewriteManifest()
      },
      /manifest\.json.*keys/i,
    ],
    [
      'extra top-level key',
      f => {
        f.manifest.generated = true
        f.rewriteManifest()
      },
      /manifest\.json.*keys/i,
    ],
    [
      'non-string version',
      f => {
        f.manifest.version = 5
        f.rewriteManifest()
      },
      /version.*MAJOR\.MINOR\.PATCH/i,
    ],
    [
      'missing version value',
      f => {
        f.manifest.version = ''
        f.rewriteManifest()
      },
      /version.*MAJOR\.MINOR\.PATCH/i,
    ],
    [
      'invalid version',
      f => {
        f.manifest.version = '5.0'
        f.rewriteManifest()
      },
      /version.*MAJOR\.MINOR\.PATCH/i,
    ],
    [
      'prerelease version',
      f => {
        f.manifest.version = '1.0.0-next.1'
        f.rewriteManifest()
      },
      /version.*MAJOR\.MINOR\.PATCH/i,
    ],
    [
      'missing artifacts',
      f => {
        delete f.manifest.artifacts
        f.rewriteManifest()
      },
      /manifest\.json.*keys/i,
    ],
    [
      'non-array artifacts',
      f => {
        f.manifest.artifacts = {}
        f.rewriteManifest()
      },
      /artifacts.*array/i,
    ],
  ]

  for (const [name, mutate, pattern] of cases) {
    await t.test(name, t => expectInvalid(t, mutate, pattern))
  }

  await t.test('manifest path is a directory', async t => {
    await expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, 'manifest.json'))
        mkdirSync(path.join(f.directory, 'manifest.json'))
      },
      /manifest\.json.*regular file/i
    )
  })

  await t.test('manifest path is a symlink', async t => {
    const external = path.join(
      tmpdir(),
      `primitree-manifest-${process.pid}.json`
    )
    writeFileSync(external, '{}')
    t.after(() => rmSync(external, { force: true }))
    await expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, 'manifest.json'))
        createSymlinkOrSkip(
          t,
          external,
          path.join(f.directory, 'manifest.json')
        )
      },
      /manifest\.json.*regular file/i
    )
  })
})

test('rejects wrong artifact entry count and shape', async t => {
  const cases = [
    [
      'missing entry',
      f => {
        f.manifest.artifacts.pop()
        f.rewriteManifest()
      },
      /exactly 5 artifact entries/i,
    ],
    [
      'extra entry',
      f => {
        f.manifest.artifacts.push({ ...f.manifest.artifacts[0] })
        f.rewriteManifest()
      },
      /exactly 5 artifact entries/i,
    ],
    [
      'null entry',
      f => {
        f.manifest.artifacts[0] = null
        f.rewriteManifest()
      },
      /artifact entry 1.*plain object/i,
    ],
    [
      'array entry',
      f => {
        f.manifest.artifacts[0] = []
        f.rewriteManifest()
      },
      /artifact entry 1.*plain object/i,
    ],
    [
      'missing key',
      f => {
        delete f.manifest.artifacts[0].sha256
        f.rewriteManifest()
      },
      /artifact entry 1.*keys/i,
    ],
    [
      'extra key',
      f => {
        f.manifest.artifacts[0].version = VERSION
        f.rewriteManifest()
      },
      /artifact entry 1.*keys/i,
    ],
  ]
  for (const [name, mutate, pattern] of cases) {
    await t.test(name, t => expectInvalid(t, mutate, pattern))
  }
})

test('rejects wrong package names and order', async t => {
  const cases = [
    [
      'unknown name',
      f => {
        f.manifest.artifacts[0].name = '@primitree/unknown'
        f.rewriteManifest()
      },
    ],
    [
      'duplicate name',
      f => {
        f.manifest.artifacts[1].name = f.manifest.artifacts[0].name
        f.rewriteManifest()
      },
    ],
    [
      'reordered names',
      f => {
        ;[f.manifest.artifacts[0], f.manifest.artifacts[1]] = [
          f.manifest.artifacts[1],
          f.manifest.artifacts[0],
        ]
        f.rewriteManifest()
      },
    ],
    [
      'empty name',
      f => {
        f.manifest.artifacts[0].name = ''
        f.rewriteManifest()
      },
    ],
    [
      'non-string name',
      f => {
        f.manifest.artifacts[0].name = 1
        f.rewriteManifest()
      },
    ],
  ]
  for (const [name, mutate] of cases) {
    await t.test(name, t =>
      expectInvalid(t, mutate, /artifact entry .*name|duplicate artifact name/i)
    )
  }
})

test('rejects wrong artifact filenames and order', async t => {
  const cases = [
    ['unknown filename', 'primitree-unknown-1.0.0.tgz'],
    ['wrong version filename', 'primitree-core-5.0.1.tgz'],
    ['absolute filename', '/tmp/primitree-core-1.0.0.tgz'],
    ['traversal filename', '../primitree-core-1.0.0.tgz'],
    ['nested filename', 'nested/primitree-core-1.0.0.tgz'],
    ['backslash filename', '..\\primitree-core-1.0.0.tgz'],
    ['empty filename', ''],
    ['non-string filename', 5],
  ]
  for (const [name, value] of cases) {
    await t.test(name, t =>
      expectInvalid(
        t,
        f => {
          f.manifest.artifacts[0].file = value
          f.rewriteManifest()
        },
        /artifact entry 1.*file/i
      )
    )
  }
  await t.test('duplicate filename', t =>
    expectInvalid(
      t,
      f => {
        f.manifest.artifacts[1].file = f.manifest.artifacts[0].file
        f.rewriteManifest()
      },
      /artifact entry 2.*file|duplicate artifact filename/i
    )
  )
  await t.test('reordered filenames', t =>
    expectInvalid(
      t,
      f => {
        const first = f.manifest.artifacts[0].file
        f.manifest.artifacts[0].file = f.manifest.artifacts[1].file
        f.manifest.artifacts[1].file = first
        f.rewriteManifest()
      },
      /artifact entry .*file/i
    )
  )
})

test('rejects malformed manifest digests', async t => {
  const cases = [
    ['non-string', 1],
    ['empty', ''],
    ['short', 'a'.repeat(63)],
    ['uppercase', 'A'.repeat(64)],
    ['nonhex', 'g'.repeat(64)],
  ]
  for (const [name, value] of cases) {
    await t.test(name, t =>
      expectInvalid(
        t,
        f => {
          f.manifest.artifacts[0].sha256 = value
          f.rewriteManifest()
        },
        /artifact entry 1.*sha256/i
      )
    )
  }
})

test('rejects missing, extra, and non-regular artifact files', async t => {
  await t.test('missing tarball', t =>
    expectInvalid(
      t,
      f => unlinkSync(path.join(f.directory, EXPECTED_FILES[0])),
      /primitree-core-1\.0\.0\.tgz.*regular file/i
    )
  )
  await t.test('extra tarball', t =>
    expectInvalid(
      t,
      f =>
        writeFileSync(path.join(f.directory, 'primitree-extra-1.0.0.tgz'), ''),
      /artifact directory.*exactly|unexpected artifact directory entry/i
    )
  )
  await t.test('tarball directory', t =>
    expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, EXPECTED_FILES[0]))
        mkdirSync(path.join(f.directory, EXPECTED_FILES[0]))
      },
      /primitree-core-1\.0\.0\.tgz.*regular file/i
    )
  )
  await t.test('internal tarball symlink', t =>
    expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, EXPECTED_FILES[0]))
        createSymlinkOrSkip(
          t,
          EXPECTED_FILES[1],
          path.join(f.directory, EXPECTED_FILES[0])
        )
      },
      /primitree-core-1\.0\.0\.tgz.*regular file/i
    )
  )
  await t.test('external tarball symlink', async t => {
    const external = path.join(tmpdir(), `primitree-tarball-${process.pid}.tgz`)
    writeFileSync(external, 'external')
    t.after(() => rmSync(external, { force: true }))
    await expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, EXPECTED_FILES[0]))
        createSymlinkOrSkip(
          t,
          external,
          path.join(f.directory, EXPECTED_FILES[0])
        )
      },
      /primitree-core-1\.0\.0\.tgz.*regular file/i
    )
  })
})

test('rejects artifact bytes that do not match both metadata files', async t => {
  await t.test('modified artifact', t =>
    expectInvalid(
      t,
      f => writeFileSync(path.join(f.directory, EXPECTED_FILES[0]), 'modified'),
      /computed SHA-256.*primitree-core/i
    )
  )

  await t.test('manifest digest changed alone', t =>
    expectInvalid(
      t,
      f => {
        f.manifest.artifacts[0].sha256 = 'a'.repeat(64)
        f.rewriteManifest()
      },
      /SHA256SUMS.*required artifact order|computed SHA-256/i
    )
  )

  await t.test('checksum digest changed alone', t =>
    expectInvalid(
      t,
      f => {
        const changed = structuredClone(f.manifest.artifacts)
        changed[0].sha256 = 'a'.repeat(64)
        f.rewriteChecksums(checksumText(changed))
      },
      /SHA256SUMS.*required artifact order/i
    )
  )

  await t.test('both metadata digests changed', t =>
    expectInvalid(
      t,
      f => {
        f.manifest.artifacts[0].sha256 = 'a'.repeat(64)
        f.rewriteManifest()
        f.rewriteChecksums()
      },
      /computed SHA-256.*primitree-core/i
    )
  )
})

test('requires the exact SHA256SUMS bytes', async t => {
  const expectedLines = fixture =>
    checksumText(fixture.manifest.artifacts).trimEnd().split('\n')
  const cases = [
    ['missing line', f => `${expectedLines(f).slice(0, -1).join('\n')}\n`],
    [
      'extra line',
      f =>
        `${checksumText(f.manifest.artifacts)}${'a'.repeat(64)}  extra.tgz\n`,
    ],
    [
      'duplicate line',
      f => `${expectedLines(f)[0]}\n${checksumText(f.manifest.artifacts)}`,
    ],
    [
      'reordered lines',
      f => {
        const lines = expectedLines(f)
        ;[lines[0], lines[1]] = [lines[1], lines[0]]
        return `${lines.join('\n')}\n`
      },
    ],
    [
      'wrong filename',
      f =>
        checksumText(f.manifest.artifacts).replace(
          EXPECTED_FILES[0],
          'wrong.tgz'
        ),
    ],
    [
      'absolute filename',
      f =>
        checksumText(f.manifest.artifacts).replace(
          EXPECTED_FILES[0],
          `/tmp/${EXPECTED_FILES[0]}`
        ),
    ],
    [
      'traversal filename',
      f =>
        checksumText(f.manifest.artifacts).replace(
          EXPECTED_FILES[0],
          `../${EXPECTED_FILES[0]}`
        ),
    ],
    [
      'uppercase digest',
      f =>
        checksumText(f.manifest.artifacts).replace(
          f.manifest.artifacts[0].sha256,
          f.manifest.artifacts[0].sha256.toUpperCase()
        ),
    ],
    [
      'short digest',
      f =>
        checksumText(f.manifest.artifacts).replace(
          f.manifest.artifacts[0].sha256,
          'a'.repeat(63)
        ),
    ],
    [
      'nonhex digest',
      f =>
        checksumText(f.manifest.artifacts).replace(
          f.manifest.artifacts[0].sha256,
          'g'.repeat(64)
        ),
    ],
    [
      'one-space separator',
      f => checksumText(f.manifest.artifacts).replace('  ', ' '),
    ],
    [
      'tab separator',
      f => checksumText(f.manifest.artifacts).replace('  ', '\t'),
    ],
    ['CRLF', f => checksumText(f.manifest.artifacts).replaceAll('\n', '\r\n')],
    [
      'unexpected blank line',
      f => checksumText(f.manifest.artifacts).replace('\n', '\n\n'),
    ],
    [
      'missing final newline',
      f => checksumText(f.manifest.artifacts).trimEnd(),
    ],
    ['extra final newline', f => `${checksumText(f.manifest.artifacts)}\n`],
  ]
  for (const [name, build] of cases) {
    await t.test(name, t =>
      expectInvalid(
        t,
        f => f.rewriteChecksums(build(f)),
        /SHA256SUMS.*required artifact order/i
      )
    )
  }

  await t.test('missing checksum file', t =>
    expectInvalid(
      t,
      f => unlinkSync(path.join(f.directory, 'SHA256SUMS')),
      /SHA256SUMS.*regular file/i
    )
  )
  await t.test('checksum path is a directory', t =>
    expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, 'SHA256SUMS'))
        mkdirSync(path.join(f.directory, 'SHA256SUMS'))
      },
      /SHA256SUMS.*regular file/i
    )
  )
  await t.test('checksum path is a symlink', async t => {
    const external = path.join(tmpdir(), `primitree-checksums-${process.pid}`)
    writeFileSync(external, '')
    t.after(() => rmSync(external, { force: true }))
    await expectInvalid(
      t,
      f => {
        unlinkSync(path.join(f.directory, 'SHA256SUMS'))
        createSymlinkOrSkip(t, external, path.join(f.directory, 'SHA256SUMS'))
      },
      /SHA256SUMS.*regular file/i
    )
  })
})

test('rejects every unexpected directory entry', async t => {
  await t.test('extra regular file', t =>
    expectInvalid(
      t,
      f => writeFileSync(path.join(f.directory, 'notes.txt'), 'unexpected'),
      /unexpected artifact directory entry.*notes\.txt/i
    )
  )
  await t.test('extra subdirectory', t =>
    expectInvalid(
      t,
      f => mkdirSync(path.join(f.directory, 'nested')),
      /unexpected artifact directory entry.*nested/i
    )
  )
  await t.test('extra symlink', t =>
    expectInvalid(
      t,
      f =>
        createSymlinkOrSkip(
          t,
          EXPECTED_FILES[0],
          path.join(f.directory, 'latest.tgz')
        ),
      /unexpected artifact directory entry.*latest\.tgz/i
    )
  )
})

test('verification is independent of the process working directory', t => {
  const fixture = makeFixture(t)
  const cwd = mkdtempSync(path.join(tmpdir(), 'primitree-cwd-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const program = [
    `import { verifyReleaseArtifacts } from ${JSON.stringify(pathToFileURL(SCRIPT_PATH).href)}`,
    `const result = verifyReleaseArtifacts({ artifactDirectory: ${JSON.stringify(fixture.directory)} })`,
    `if (result.version !== ${JSON.stringify(VERSION)}) process.exit(2)`,
  ].join('\n')
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', program],
    {
      cwd,
      encoding: 'utf8',
    }
  )
  assert.equal(
    result.status,
    0,
    `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  )
})

test('CLI rejects missing, unknown, and extra commands without writing artifacts', async t => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'primitree-cli-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))

  for (const args of [[], ['unknown'], ['verify', 'extra']]) {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
      cwd,
      encoding: 'utf8',
    })
    assert.notEqual(
      result.status,
      0,
      `unexpected success for ${args.join(' ')}`
    )
    assert.match(result.stderr, /Usage:.*(pack|verify|check)/)
    assert.equal(result.stdout, '')
    assert.equal(
      result.error,
      undefined,
      `spawn failed for ${args.join(' ')}: ${result.error?.message}`
    )
  }
})

test('required path validation rejects a symlinked top-level packages parent', async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'primitree-path-root-'))
  const external = mkdtempSync(path.join(tmpdir(), 'primitree-path-external-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  t.after(() => rmSync(external, { recursive: true, force: true }))
  mkdirSync(path.join(external, 'core'))
  if (!createSymlinkOrSkip(t, external, path.join(root, 'packages'), 'dir')) {
    return
  }

  const { assertRealPathComponents } = await releaseArtifactsModule()
  assert.throws(
    () => assertRealPathComponents(root, 'packages/core'),
    /packages.*symlink/i
  )
})

test('rejects a non-regular checksum file even if readable', async t => {
  await expectInvalid(
    t,
    f => {
      const checksumPath = path.join(f.directory, 'SHA256SUMS')
      chmodSync(checksumPath, 0o644)
      renameSync(checksumPath, `${checksumPath}.real`)
      createSymlinkOrSkip(t, `${checksumPath}.real`, checksumPath)
    },
    /SHA256SUMS.*regular file/i
  )
})
