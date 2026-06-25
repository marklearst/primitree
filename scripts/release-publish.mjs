#!/usr/bin/env node

import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { verifyReleaseArtifacts } from './release-artifacts.mjs'
import { PUBLIC_RELEASE_PACKAGES } from './release-config.mjs'

export const PUBLIC_NPM_REGISTRY = 'https://registry.npmjs.org/'
export const REQUIRED_NPM_VERSION = '11.18.0'

const COMMAND_TIMEOUT_MS = 15_000
const FETCH_TIMEOUT_MS = 10_000
const DEFAULT_POLL_ATTEMPTS = 10
const DEFAULT_POLL_DELAY_MS = 3_000
const PROVENANCE_PREDICATE = 'https://slsa.dev/provenance/v1'
const STATEMENT_TYPE = 'https://in-toto.io/Statement/v1'
const REPOSITORY = 'https://github.com/marklearst/figmavars'
const WORKFLOW_PATH = '.github/workflows/ci.yml'

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function requireCommandSuccess(result, label) {
  if (result?.status !== 0) {
    const stderr =
      typeof result?.stderr === 'string' ? result.stderr.trim() : ''
    throw new Error(`${label} failed${stderr === '' ? '' : `: ${stderr}`}`)
  }
  return result
}

function defaultRunCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env,
    input: options.input,
    timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
  })
  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`)
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function commandOutput(command, args, options, runCommand) {
  return requireCommandSuccess(
    runCommand(command, args, options),
    `${command} ${args.join(' ')}`
  ).stdout.trim()
}

export function assertNpmVersion(output) {
  if (typeof output !== 'string' || output.trim() !== REQUIRED_NPM_VERSION) {
    throw new Error(`release commands require npm ${REQUIRED_NPM_VERSION}`)
  }
}

export function verifyExactMain({
  githubRef,
  githubSha,
  runCommand = defaultRunCommand,
}) {
  if (!/^refs\/tags\/v\d+\.\d+\.\d+$/.test(githubRef ?? '')) {
    throw new Error('release ref must be a stable vMAJOR.MINOR.PATCH tag')
  }
  if (!/^[a-f0-9]{40}$/.test(githubSha ?? '')) {
    throw new Error('GITHUB_SHA must be a full lowercase commit SHA')
  }

  requireCommandSuccess(
    runCommand('git', [
      'fetch',
      '--force',
      '--no-tags',
      'origin',
      'refs/heads/main:refs/remotes/origin/main',
    ]),
    'fresh origin/main fetch'
  )
  const tagCommit = commandOutput(
    'git',
    ['rev-parse', `${githubRef}^{commit}`],
    {},
    runCommand
  )
  const mainCommit = commandOutput(
    'git',
    ['rev-parse', 'refs/remotes/origin/main^{commit}'],
    {},
    runCommand
  )
  if (tagCommit !== githubSha) {
    throw new Error('release tag commit does not equal GITHUB_SHA')
  }
  if (mainCommit !== githubSha || mainCommit !== tagCommit) {
    throw new Error('fresh origin/main commit does not equal GITHUB_SHA')
  }
  return { mainCommit, tagCommit }
}

function expectedAttestationUrl(registry, name, version) {
  const base = new URL(registry)
  if (base.pathname !== '/') {
    throw new Error('npm registry URL must end at the origin root')
  }
  return new URL(
    `/-/npm/v1/attestations/${name.replace('/', '%2f')}@${version}`,
    base
  ).href
}

function decodeStatement(attestation) {
  if (!isPlainObject(attestation) || !Array.isArray(attestation.attestations)) {
    throw new Error('npm attestation response must contain attestations')
  }
  const provenanceEntries = attestation.attestations.filter(
    entry => entry?.predicateType === PROVENANCE_PREDICATE
  )
  if (provenanceEntries.length !== 1) {
    throw new Error('npm attestation response must contain one SLSA provenance')
  }
  const payload = provenanceEntries[0]?.bundle?.dsseEnvelope?.payload
  if (typeof payload !== 'string' || payload === '') {
    throw new Error('SLSA provenance payload is missing')
  }
  let statement
  try {
    statement = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
  } catch {
    throw new Error('SLSA provenance payload is not valid JSON')
  }
  if (!isPlainObject(statement)) {
    throw new Error('SLSA provenance statement must be an object')
  }
  return statement
}

export function validatePublishedPackage({
  artifactPath,
  attestation,
  metadata,
  expected,
}) {
  if (!isPlainObject(metadata)) {
    throw new Error(`${expected.name}@${expected.version}: metadata is invalid`)
  }
  if (
    metadata.name !== expected.name ||
    metadata.version !== expected.version
  ) {
    throw new Error(
      `${expected.name}@${expected.version}: registry identity mismatch`
    )
  }
  if (metadata['dist-tags']?.latest !== expected.version) {
    throw new Error(
      `${expected.name}@${expected.version}: latest dist-tag mismatch`
    )
  }

  const artifactBytes = readFileSync(artifactPath)
  const sha512Hex = createHash('sha512').update(artifactBytes).digest('hex')
  const integrity = `sha512-${Buffer.from(sha512Hex, 'hex').toString('base64')}`
  if (metadata.dist?.integrity !== integrity) {
    throw new Error(
      `${expected.name}@${expected.version}: tarball integrity mismatch`
    )
  }
  const attestationUrl = metadata.dist?.attestations?.url
  if (
    attestationUrl !==
    expectedAttestationUrl(expected.registry, expected.name, expected.version)
  ) {
    throw new Error(
      `${expected.name}@${expected.version}: attestation URL mismatch`
    )
  }
  if (
    metadata.dist?.attestations?.provenance?.predicateType !==
    PROVENANCE_PREDICATE
  ) {
    throw new Error(
      `${expected.name}@${expected.version}: provenance predicate mismatch`
    )
  }

  const statement = decodeStatement(attestation)
  if (
    statement._type !== STATEMENT_TYPE ||
    statement.predicateType !== PROVENANCE_PREDICATE
  ) {
    throw new Error(
      `${expected.name}@${expected.version}: invalid SLSA statement type`
    )
  }
  if (!Array.isArray(statement.subject) || statement.subject.length !== 1) {
    throw new Error(
      `${expected.name}@${expected.version}: expected one provenance subject`
    )
  }
  const subject = statement.subject[0]
  const expectedPurl = `pkg:npm/${expected.name.replace('@', '%40')}@${
    expected.version
  }`
  if (subject?.name !== expectedPurl || subject?.digest?.sha512 !== sha512Hex) {
    throw new Error(
      `${expected.name}@${expected.version}: provenance subject mismatch`
    )
  }

  const workflow =
    statement.predicate?.buildDefinition?.externalParameters?.workflow
  if (
    workflow?.repository !== expected.repository ||
    workflow?.path !== expected.workflowPath ||
    workflow?.ref !== expected.tagRef
  ) {
    throw new Error(
      `${expected.name}@${expected.version}: provenance workflow identity mismatch`
    )
  }
  const dependencies =
    statement.predicate?.buildDefinition?.resolvedDependencies
  if (!Array.isArray(dependencies)) {
    throw new Error(
      `${expected.name}@${expected.version}: resolved dependencies are missing`
    )
  }
  const matchingCommits = dependencies.filter(
    dependency =>
      dependency?.uri === `git+${expected.repository}@${expected.tagRef}` &&
      dependency?.digest?.gitCommit === expected.commitSha
  )
  if (matchingCommits.length !== 1) {
    throw new Error(
      `${expected.name}@${expected.version}: resolved gitCommit mismatch`
    )
  }
}

function sanitizedNpmEnvironment(
  environment,
  { userConfigPath, cachePath, homePath, keepOidc }
) {
  const result = { ...environment }
  for (const key of Object.keys(result)) {
    const upper = key.toUpperCase()
    if (
      upper === 'NPM_TOKEN' ||
      upper === 'NODE_AUTH_TOKEN' ||
      upper === 'SIGSTORE_ID_TOKEN' ||
      upper === 'GH_TOKEN' ||
      upper === 'GITHUB_TOKEN' ||
      /^NPM_CONFIG_.*(?:AUTH|TOKEN|OTP)$/.test(upper) ||
      (!keepOidc && upper.startsWith('ACTIONS_ID_TOKEN_REQUEST_')) ||
      (!keepOidc && upper === 'NPM_CONFIG_PROVENANCE')
    ) {
      delete result[key]
    }
  }
  result.NPM_CONFIG_USERCONFIG = userConfigPath
  result.npm_config_userconfig = userConfigPath
  if (cachePath !== undefined) {
    result.NPM_CONFIG_CACHE = cachePath
    result.npm_config_cache = cachePath
  }
  if (homePath !== undefined) result.HOME = homePath
  return result
}

async function defaultFetchJson(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  let value
  try {
    value = await response.json()
  } catch {
    throw new Error(`${url}: response is not valid JSON`)
  }
  return { status: response.status, value }
}

function parseRegistryMetadata(name, version, result) {
  if (result.status !== 0) {
    if (/^npm (?:error|ERR!) code E404\s*$/m.test(result.stderr ?? '')) {
      return { kind: 'missing' }
    }
    throw new Error(
      `${name}@${version}: npm registry request failed${
        result.stderr?.trim() ? `: ${result.stderr.trim()}` : ''
      }`
    )
  }
  let metadata
  try {
    metadata = JSON.parse(result.stdout)
  } catch {
    throw new Error(`${name}@${version}: registry metadata is not valid JSON`)
  }
  if (!isPlainObject(metadata)) {
    throw new Error(`${name}@${version}: registry metadata must be an object`)
  }
  return { kind: 'present', metadata }
}

async function inspectRegistryPackage({
  artifact,
  commandEnvironment,
  commitSha,
  fetchJson,
  registry,
  runCommand,
  tagRef,
  version,
}) {
  const result = runCommand(
    'npm',
    [
      'view',
      `${artifact.name}@${version}`,
      '--json',
      `--registry=${registry}`,
      '--fetch-retries=0',
      `--fetch-timeout=${FETCH_TIMEOUT_MS}`,
    ],
    {
      env: commandEnvironment,
      timeoutMs: COMMAND_TIMEOUT_MS,
    }
  )
  const state = parseRegistryMetadata(artifact.name, version, result)
  if (state.kind === 'missing') return state

  const url = state.metadata.dist?.attestations?.url
  if (typeof url !== 'string') {
    throw new Error(`${artifact.name}@${version}: attestation URL is missing`)
  }
  let attestationResponse
  try {
    attestationResponse = await fetchJson(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error(
        `${artifact.name}@${version}: attestation request timed out`
      )
    }
    throw new Error(
      `${artifact.name}@${version}: attestation request failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
  if (attestationResponse?.status === 404) {
    return { kind: 'pending', metadata: state.metadata }
  }
  if (attestationResponse?.status !== 200) {
    throw new Error(
      `${artifact.name}@${version}: attestation request returned ${
        attestationResponse?.status ?? 'no status'
      }`
    )
  }
  validatePublishedPackage({
    artifactPath: artifact.path,
    attestation: attestationResponse.value,
    metadata: state.metadata,
    expected: {
      name: artifact.name,
      version,
      repository: REPOSITORY,
      workflowPath: WORKFLOW_PATH,
      tagRef,
      commitSha,
      registry,
    },
  })
  return state
}

function requireReleaseContext(version, githubRef, githubSha) {
  if (githubRef !== `refs/tags/v${version}`) {
    throw new Error('release tag does not match the artifact version')
  }
  if (!/^[a-f0-9]{40}$/.test(githubSha ?? '')) {
    throw new Error('GITHUB_SHA must be a full lowercase commit SHA')
  }
}

function publishArguments(artifactPath, registry) {
  return [
    'publish',
    artifactPath,
    '--provenance',
    '--access=public',
    '--tag=latest',
    '--ignore-scripts',
    `--registry=${registry}`,
    '--fetch-retries=0',
    `--fetch-timeout=${FETCH_TIMEOUT_MS}`,
  ]
}

export async function runReleasePublish({
  artifactDirectory,
  environment = process.env,
  fetchJson = defaultFetchJson,
  githubRef,
  githubSha,
  maxPollAttempts = DEFAULT_POLL_ATTEMPTS,
  registry = PUBLIC_NPM_REGISTRY,
  retryDelayMs = DEFAULT_POLL_DELAY_MS,
  runCommand = defaultRunCommand,
  sleep = milliseconds =>
    new Promise(resolve => setTimeout(resolve, milliseconds)),
}) {
  if (
    !Number.isInteger(maxPollAttempts) ||
    maxPollAttempts < 1 ||
    !Number.isInteger(retryDelayMs) ||
    retryDelayMs < 0
  ) {
    throw new Error('registry polling limits must be finite positive integers')
  }
  const verified = verifyReleaseArtifacts({ artifactDirectory })
  requireReleaseContext(verified.version, githubRef, githubSha)
  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), 'figmavars-publish-auth-')
  )
  const userConfigPath = path.join(temporaryRoot, 'npmrc')
  const token =
    typeof environment.NPM_TOKEN === 'string'
      ? environment.NPM_TOKEN.trim()
      : ''
  const mode = token === '' ? 'oidc' : 'bootstrap'
  const registryUrl = new URL(registry)
  const tokenConfig =
    mode === 'bootstrap'
      ? `//${registryUrl.host}${registryUrl.pathname}:_authToken=${token}\n`
      : ''
  writeFileSync(userConfigPath, tokenConfig, { mode: 0o600 })
  const commandEnvironment = sanitizedNpmEnvironment(environment, {
    userConfigPath,
    keepOidc: true,
  })

  try {
    const npmVersion = commandOutput(
      'npm',
      ['--version'],
      { env: commandEnvironment, timeoutMs: COMMAND_TIMEOUT_MS },
      runCommand
    )
    assertNpmVersion(npmVersion)

    for (const artifact of verified.artifacts) {
      const state = await inspectRegistryPackage({
        artifact,
        commandEnvironment,
        commitSha: githubSha,
        fetchJson,
        registry,
        runCommand,
        tagRef: githubRef,
        version: verified.version,
      })
      if (state.kind === 'missing') {
        requireCommandSuccess(
          runCommand('npm', publishArguments(artifact.path, registry), {
            env: commandEnvironment,
            timeoutMs: COMMAND_TIMEOUT_MS,
          }),
          `npm publish ${artifact.name}@${verified.version}`
        )
      }
    }

    let pending = verified.artifacts
    for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
      const nextPending = []
      for (const artifact of pending) {
        const state = await inspectRegistryPackage({
          artifact,
          commandEnvironment,
          commitSha: githubSha,
          fetchJson,
          registry,
          runCommand,
          tagRef: githubRef,
          version: verified.version,
        })
        if (state.kind !== 'present') nextPending.push(artifact)
      }
      if (nextPending.length === 0) {
        return {
          mode,
          publishedPackages: verified.artifacts.map(artifact => artifact.name),
        }
      }
      pending = nextPending
      if (attempt < maxPollAttempts) await sleep(retryDelayMs)
    }
    throw new Error(
      `registry polling exhausted after ${maxPollAttempts} attempts: ${pending
        .map(artifact => artifact.name)
        .join(', ')}`
    )
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

function exactPackageSpecs(version) {
  return PUBLIC_RELEASE_PACKAGES.map(config => `${config.name}@${version}`)
}

function assertInstalledVersions(consumerDirectory, version) {
  for (const config of PUBLIC_RELEASE_PACKAGES) {
    const manifestPath = path.join(
      consumerDirectory,
      'node_modules',
      ...config.name.split('/'),
      'package.json'
    )
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch {
      throw new Error(`unable to read installed manifest for ${config.name}`)
    }
    if (manifest.name !== config.name || manifest.version !== version) {
      throw new Error(
        `${config.name} did not install at exact version ${version}`
      )
    }
  }
}

function smokeCommand(runCommand, command, args, options) {
  requireCommandSuccess(
    runCommand(command, args, options),
    `${command} ${args.join(' ')}`
  )
}

function runInstalledPackageSmokeChecks({
  consumerDirectory,
  options,
  runCommand,
}) {
  const esmSpecifiers = [
    '@figmavars/core',
    '@figmavars/core/types',
    '@figmavars/dtcg',
    '@figmavars/hooks',
    '@figmavars/hooks/core',
    '@figmavars/mcp',
  ]
  const cjsSpecifiers = [
    '@figmavars/core',
    '@figmavars/core/types',
    '@figmavars/dtcg',
    '@figmavars/hooks',
    '@figmavars/hooks/core',
  ]
  smokeCommand(
    runCommand,
    'node',
    [
      '--input-type=module',
      '--eval',
      esmSpecifiers.map(specifier => `await import('${specifier}')`).join(';'),
    ],
    options
  )
  smokeCommand(
    runCommand,
    'node',
    [
      '--input-type=commonjs',
      '--eval',
      cjsSpecifiers.map(specifier => `require('${specifier}')`).join(';'),
    ],
    options
  )
  for (const bin of ['figma-vars', 'figma-vars-export', 'figma-vars-mcp']) {
    smokeCommand(
      runCommand,
      path.join(consumerDirectory, 'node_modules', '.bin', bin),
      ['--help'],
      options
    )
  }
}

export function runPackedTarballConsumer({
  artifactDirectory,
  environment = process.env,
  registry = PUBLIC_NPM_REGISTRY,
  runCommand = defaultRunCommand,
}) {
  const verified = verifyReleaseArtifacts({ artifactDirectory })
  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), 'figmavars-packed-consumer-')
  )
  const homeDirectory = path.join(temporaryRoot, 'home')
  const cacheDirectory = path.join(temporaryRoot, 'npm-cache')
  const consumerDirectory = path.join(temporaryRoot, 'consumer')
  const userConfigPath = path.join(temporaryRoot, 'npmrc')
  mkdirSync(homeDirectory)
  mkdirSync(cacheDirectory)
  mkdirSync(consumerDirectory)
  writeFileSync(userConfigPath, '', { mode: 0o600 })
  writeFileSync(
    path.join(consumerDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'figmavars-packed-release-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
      },
      null,
      2
    )}\n`
  )
  const commandEnvironment = sanitizedNpmEnvironment(environment, {
    userConfigPath,
    cachePath: cacheDirectory,
    homePath: homeDirectory,
    keepOidc: false,
  })
  const options = {
    cwd: consumerDirectory,
    env: commandEnvironment,
    timeoutMs: COMMAND_TIMEOUT_MS,
  }

  try {
    smokeCommand(
      runCommand,
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--package-lock=false',
        '--no-save',
        '--engine-strict',
        '--audit=false',
        '--fund=false',
        `--registry=${registry}`,
        '--fetch-retries=0',
        `--fetch-timeout=${FETCH_TIMEOUT_MS}`,
        ...verified.artifacts.map(artifact => artifact.path),
      ],
      options
    )
    assertInstalledVersions(consumerDirectory, verified.version)
    runInstalledPackageSmokeChecks({
      consumerDirectory,
      options,
      runCommand,
    })
    return {
      packages: verified.artifacts.map(artifact => artifact.name),
      version: verified.version,
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

export async function runPublicRegistryConsumer({
  version,
  environment = process.env,
  registry = PUBLIC_NPM_REGISTRY,
  runCommand = defaultRunCommand,
}) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? '')) {
    throw new Error('public consumer version must be stable MAJOR.MINOR.PATCH')
  }
  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), 'figmavars-public-consumer-')
  )
  const homeDirectory = path.join(temporaryRoot, 'home')
  const cacheDirectory = path.join(temporaryRoot, 'npm-cache')
  const consumerDirectory = path.join(temporaryRoot, 'consumer')
  const userConfigPath = path.join(temporaryRoot, 'npmrc')
  mkdirSync(homeDirectory)
  mkdirSync(cacheDirectory)
  mkdirSync(consumerDirectory)
  writeFileSync(userConfigPath, '', { mode: 0o600 })
  writeFileSync(
    path.join(consumerDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'figmavars-public-release-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
      },
      null,
      2
    )}\n`
  )
  const commandEnvironment = sanitizedNpmEnvironment(environment, {
    userConfigPath,
    cachePath: cacheDirectory,
    homePath: homeDirectory,
    keepOidc: false,
  })
  const options = {
    cwd: consumerDirectory,
    env: commandEnvironment,
    timeoutMs: COMMAND_TIMEOUT_MS,
  }

  try {
    assertNpmVersion(commandOutput('npm', ['--version'], options, runCommand))
    smokeCommand(
      runCommand,
      'npm',
      [
        'install',
        '--save-exact',
        '--ignore-scripts',
        '--engine-strict',
        '--audit=false',
        '--fund=false',
        `--registry=${registry}`,
        '--fetch-retries=0',
        `--fetch-timeout=${FETCH_TIMEOUT_MS}`,
        ...exactPackageSpecs(version),
      ],
      options
    )
    assertInstalledVersions(consumerDirectory, version)
    smokeCommand(
      runCommand,
      'npm',
      ['audit', 'signatures', `--registry=${registry}`],
      options
    )

    runInstalledPackageSmokeChecks({
      consumerDirectory,
      options,
      runCommand,
    })
    return { packages: exactPackageSpecs(version), version }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
}

async function runCli() {
  const [command] = process.argv.slice(2)
  if (command === 'exact-main') {
    verifyExactMain({
      githubRef: process.env.GITHUB_REF,
      githubSha: process.env.GITHUB_SHA,
    })
    console.log('Release tag equals the freshly fetched origin/main commit')
    return
  }
  if (command === 'publish') {
    const result = await runReleasePublish({
      artifactDirectory: path.resolve('artifacts/npm'),
      githubRef: process.env.GITHUB_REF,
      githubSha: process.env.GITHUB_SHA,
    })
    console.log(
      `Verified ${result.publishedPackages.length} npm packages in ${result.mode} mode`
    )
    return
  }
  if (command === 'packed-consumer') {
    const result = runPackedTarballConsumer({
      artifactDirectory: path.resolve('artifacts/npm'),
    })
    console.log(`Packed tarball consumer verified ${result.version}`)
    return
  }
  if (command === 'public-consumer') {
    const verified = verifyReleaseArtifacts({
      artifactDirectory: path.resolve('artifacts/npm'),
    })
    await runPublicRegistryConsumer({ version: verified.version })
    console.log(`Public registry consumer verified ${verified.version}`)
    return
  }
  throw new Error(
    'Usage: release-publish.mjs <exact-main|packed-consumer|publish|public-consumer>'
  )
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  try {
    await runCli()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
