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

const SHORT_COMMAND_TIMEOUT_MS = 15_000
const PUBLISH_COMMAND_TIMEOUT_MS = 5 * 60_000
const INSTALL_COMMAND_TIMEOUT_MS = 5 * 60_000
const AUDIT_COMMAND_TIMEOUT_MS = 3 * 60_000
const FETCH_TIMEOUT_MS = 10_000
const DEFAULT_POLL_ATTEMPTS = 10
const DEFAULT_POLL_DELAY_MS = 3_000
const PROVENANCE_PREDICATE = 'https://slsa.dev/provenance/v1'
const STATEMENT_TYPE = 'https://in-toto.io/Statement/v1'
const REPOSITORY = 'https://github.com/marklearst/primitree'
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
    timeout: options.timeoutMs ?? SHORT_COMMAND_TIMEOUT_MS,
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
  if (
    base.href !== PUBLIC_NPM_REGISTRY ||
    base.protocol !== 'https:' ||
    base.username !== '' ||
    base.password !== '' ||
    base.search !== '' ||
    base.hash !== ''
  ) {
    throw new Error('npm registry must be exactly the public npm registry')
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

function isMissingRegistryField(value) {
  return value === undefined || value === null || value === ''
}

function validateAvailableField(value, expectedValue, mismatchMessage) {
  if (isMissingRegistryField(value)) return false
  if (value !== expectedValue) throw new Error(mismatchMessage)
  return true
}

function optionalRegistryObject(value, mismatchMessage) {
  if (value === undefined || value === null) return undefined
  if (!isPlainObject(value)) throw new Error(mismatchMessage)
  return value
}

function validateRegistryMetadata({ artifactPath, metadata, expected }) {
  const label = `${expected.name}@${expected.version}`
  if (!isPlainObject(metadata)) {
    throw new Error(`${label}: metadata is invalid`)
  }

  const artifactBytes = readFileSync(artifactPath)
  const sha512Hex = createHash('sha512').update(artifactBytes).digest('hex')
  const integrity = `sha512-${Buffer.from(sha512Hex, 'hex').toString('base64')}`
  const expectedUrl = expectedAttestationUrl(
    expected.registry,
    expected.name,
    expected.version
  )
  let complete = true
  complete =
    validateAvailableField(
      metadata.name,
      expected.name,
      `${label}: registry identity mismatch`
    ) && complete
  complete =
    validateAvailableField(
      metadata.version,
      expected.version,
      `${label}: registry identity mismatch`
    ) && complete

  const distTags = optionalRegistryObject(
    metadata['dist-tags'],
    `${label}: dist-tags metadata is invalid`
  )
  const dist = optionalRegistryObject(
    metadata.dist,
    `${label}: dist metadata is invalid`
  )
  const attestations = optionalRegistryObject(
    dist?.attestations,
    `${label}: attestation metadata is invalid`
  )
  const provenance = optionalRegistryObject(
    attestations?.provenance,
    `${label}: provenance metadata is invalid`
  )
  complete =
    validateAvailableField(
      distTags?.latest,
      expected.version,
      `${label}: latest dist-tag mismatch`
    ) && complete
  complete =
    validateAvailableField(
      dist?.integrity,
      integrity,
      `${label}: tarball integrity mismatch`
    ) && complete
  complete =
    validateAvailableField(
      attestations?.url,
      expectedUrl,
      `${label}: attestation URL mismatch`
    ) && complete
  complete =
    validateAvailableField(
      provenance?.predicateType,
      PROVENANCE_PREDICATE,
      `${label}: provenance predicate mismatch`
    ) && complete
  return complete
    ? { kind: 'ready', sha512Hex }
    : { kind: 'pending', sha512Hex }
}

function validateAttestation({ attestation, expected, sha512Hex }) {
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

export function validatePublishedPackage({
  artifactPath,
  attestation,
  metadata,
  expected,
}) {
  const metadataState = validateRegistryMetadata({
    artifactPath,
    metadata,
    expected,
  })
  if (metadataState.kind !== 'ready') {
    throw new Error(
      `${expected.name}@${expected.version}: registry metadata is incomplete`
    )
  }
  validateAttestation({
    attestation,
    expected,
    sha512Hex: metadataState.sha512Hex,
  })
}

function sanitizedNpmEnvironment(
  environment,
  { userConfigPath, globalConfigPath, cachePath, homePath, keepOidc }
) {
  const result = {}
  for (const [key, value] of Object.entries(environment)) {
    const upper = key.toUpperCase()
    const oidcRequestVariable =
      upper === 'ACTIONS_ID_TOKEN_REQUEST_URL' ||
      upper === 'ACTIONS_ID_TOKEN_REQUEST_TOKEN'
    const credentialVariable =
      upper.includes('TOKEN') ||
      upper.includes('AUTH') ||
      upper.includes('CREDENTIAL') ||
      upper.includes('PASSWORD') ||
      upper.includes('SECRET') ||
      upper.endsWith('_OTP')
    if (
      upper.startsWith('NPM_CONFIG_') ||
      credentialVariable ||
      upper.startsWith('ACTIONS_ID_TOKEN_REQUEST_')
    ) {
      if (keepOidc && oidcRequestVariable) result[key] = value
      continue
    }
    result[key] = value
  }
  result.NPM_CONFIG_USERCONFIG = userConfigPath
  result.npm_config_userconfig = userConfigPath
  result.NPM_CONFIG_GLOBALCONFIG = globalConfigPath
  result.npm_config_globalconfig = globalConfigPath
  result.NPM_CONFIG_CACHE = cachePath
  result.npm_config_cache = cachePath
  result.HOME = homePath
  return result
}

function controlledRegistryConfig(registry) {
  if (registry !== PUBLIC_NPM_REGISTRY) {
    throw new Error('release commands require the public npm registry')
  }
  return `registry=${registry}\n@primitree:registry=${registry}\n`
}

function createNpmExecutionContext({
  environment,
  keepOidc,
  prefix,
  registry,
  token = '',
}) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), prefix))
  const homeDirectory = path.join(temporaryRoot, 'home')
  const cacheDirectory = path.join(temporaryRoot, 'npm-cache')
  const workingDirectory = path.join(temporaryRoot, 'work')
  const userConfigPath = path.join(temporaryRoot, 'npmrc')
  const globalConfigPath = path.join(temporaryRoot, 'global-npmrc')
  mkdirSync(homeDirectory)
  mkdirSync(cacheDirectory)
  mkdirSync(workingDirectory)
  const registryConfig = controlledRegistryConfig(registry)
  writeFileSync(globalConfigPath, registryConfig, { mode: 0o600 })
  const registryUrl = new URL(registry)
  const tokenConfig =
    token === ''
      ? ''
      : `//${registryUrl.host}${registryUrl.pathname}:_authToken=${token}\n`
  writeFileSync(userConfigPath, tokenConfig, { mode: 0o600 })
  const commandEnvironment = sanitizedNpmEnvironment(environment, {
    userConfigPath,
    globalConfigPath,
    cachePath: cacheDirectory,
    homePath: homeDirectory,
    keepOidc,
  })
  return {
    cleanup() {
      rmSync(temporaryRoot, { recursive: true, force: true })
    },
    commandEnvironment,
    globalConfigPath,
    temporaryRoot,
    userConfigPath,
    workingDirectory,
  }
}

function commandOptions(context, timeoutMs = SHORT_COMMAND_TIMEOUT_MS) {
  return {
    cwd: context.workingDirectory,
    env: context.commandEnvironment,
    timeoutMs,
  }
}

function assertEffectiveRegistry(context, registry, runCommand) {
  for (const key of ['registry', '@primitree:registry']) {
    const actual = commandOutput(
      'npm',
      ['config', 'get', key],
      commandOptions(context),
      runCommand
    )
    if (actual !== registry) {
      throw new Error(`effective npm ${key} must be ${registry}`)
    }
  }
}

export async function fetchAttestationJson(
  url,
  { fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS } = {}
) {
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    redirect: 'error',
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
  commandContext,
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
    commandOptions(commandContext)
  )
  const state = parseRegistryMetadata(artifact.name, version, result)
  if (state.kind === 'missing') return state

  const expected = {
    name: artifact.name,
    version,
    repository: REPOSITORY,
    workflowPath: WORKFLOW_PATH,
    tagRef,
    commitSha,
    registry,
  }
  const metadataState = validateRegistryMetadata({
    artifactPath: artifact.path,
    metadata: state.metadata,
    expected,
  })
  if (metadataState.kind === 'pending') {
    return { kind: 'pending', metadata: state.metadata }
  }
  const url = state.metadata.dist.attestations.url
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
  validateAttestation({
    attestation: attestationResponse.value,
    expected,
    sha512Hex: metadataState.sha512Hex,
  })
  return { kind: 'present', metadata: state.metadata }
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
  fetchJson = fetchAttestationJson,
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
  const token =
    typeof environment.NPM_TOKEN === 'string'
      ? environment.NPM_TOKEN.trim()
      : ''
  const mode = token === '' ? 'oidc' : 'bootstrap'
  const commandContext = createNpmExecutionContext({
    environment,
    keepOidc: true,
    prefix: 'primitree-publish-',
    registry,
    token,
  })

  try {
    const npmVersion = commandOutput(
      'npm',
      ['--version'],
      commandOptions(commandContext),
      runCommand
    )
    assertNpmVersion(npmVersion)
    assertEffectiveRegistry(commandContext, registry, runCommand)

    for (const artifact of verified.artifacts) {
      let published = false
      let accepted = false
      for (let attempt = 1; attempt <= maxPollAttempts; attempt += 1) {
        const state = await inspectRegistryPackage({
          artifact,
          commandContext,
          commitSha: githubSha,
          fetchJson,
          registry,
          runCommand,
          tagRef: githubRef,
          version: verified.version,
        })
        if (state.kind === 'present') {
          accepted = true
          break
        }
        if (state.kind === 'missing' && published === false) {
          requireCommandSuccess(
            runCommand(
              'npm',
              publishArguments(artifact.path, registry),
              commandOptions(commandContext, PUBLISH_COMMAND_TIMEOUT_MS)
            ),
            `npm publish ${artifact.name}@${verified.version}`
          )
          published = true
        }
        if (attempt < maxPollAttempts) await sleep(retryDelayMs)
      }
      if (!accepted) {
        throw new Error(
          `registry polling exhausted for ${artifact.name} after ${maxPollAttempts} attempts`
        )
      }
    }

    for (const artifact of verified.artifacts) {
      const state = await inspectRegistryPackage({
        artifact,
        commandContext,
        commitSha: githubSha,
        fetchJson,
        registry,
        runCommand,
        tagRef: githubRef,
        version: verified.version,
      })
      if (state.kind !== 'present') {
        throw new Error(
          `final registry verification failed for ${artifact.name}: ${state.kind}`
        )
      }
    }
    return {
      mode,
      publishedPackages: verified.artifacts.map(artifact => artifact.name),
    }
  } finally {
    commandContext.cleanup()
  }
}

function exactPackageSpecs(version) {
  return PUBLIC_RELEASE_PACKAGES.map(config => `${config.name}@${version}`)
}

function assertInstalledVersions(
  consumerDirectory,
  version,
  packages = PUBLIC_RELEASE_PACKAGES
) {
  for (const config of packages) {
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
    '@primitree/core',
    '@primitree/core/policy',
    '@primitree/core/types',
    '@primitree/cli/config',
    '@primitree/dtcg',
    '@primitree/hooks',
    '@primitree/mcp',
  ]
  const cjsSpecifiers = [
    '@primitree/core',
    '@primitree/core/policy',
    '@primitree/core/types',
    '@primitree/dtcg',
    '@primitree/hooks',
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
  for (const bin of ['primitree', 'primitree-mcp']) {
    smokeCommand(
      runCommand,
      path.join(consumerDirectory, 'node_modules', '.bin', bin),
      ['--help'],
      options
    )
  }

  const configuredDirectory = path.join(consumerDirectory, 'configured-cli')
  mkdirSync(configuredDirectory, { recursive: true })
  writeFileSync(
    path.join(configuredDirectory, 'package.json'),
    `${JSON.stringify({ private: true, type: 'commonjs' }, null, 2)}\n`
  )
  writeFileSync(
    path.join(configuredDirectory, 'primitree.config.ts'),
    `import { defineConfig } from '@primitree/cli/config'

export default defineConfig({
  schemaVersion: 1,
  sources: {
    brand: {
      type: 'dtcg',
      file: './tokens.json',
      architecture: {
        layers: [{ id: 'base', roots: ['size'], values: 'literal' }],
      },
      ownership: { default: ['design-systems'] },
    },
  },
})
`
  )
  writeFileSync(
    path.join(configuredDirectory, 'tokens.json'),
    `${JSON.stringify({
      size: { base: { $type: 'number', $value: 4 } },
    })}\n`
  )
  smokeCommand(
    runCommand,
    path.join(consumerDirectory, 'node_modules', '.bin', 'primitree'),
    ['check', '--format', 'json'],
    { ...options, cwd: configuredDirectory }
  )
}

const CLI_ERROR_DETAIL_LIMIT = 160

function boundedErrorText(value) {
  const text = value.trim()
  return text.length <= CLI_ERROR_DETAIL_LIMIT
    ? text
    : `${text.slice(0, CLI_ERROR_DETAIL_LIMIT - 3)}...`
}

function parseCliJson(result, label) {
  const output = requireCommandSuccess(result, label).stdout.trim()
  let report
  try {
    report = JSON.parse(output)
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error)
    throw new Error(
      `${label} did not return valid JSON: ${JSON.stringify(
        boundedErrorText(parseError)
      )}; stdout: ${JSON.stringify(boundedErrorText(output))}`
    )
  }
  if (!isPlainObject(report)) {
    throw new Error(`${label} did not return a JSON object`)
  }
  return report
}

function runPackedCliUserPath({ consumerDirectory, options, runCommand }) {
  writeFileSync(
    path.join(consumerDirectory, 'primitree.config.ts'),
    `export default {
  schemaVersion: 1,
  sources: {
    brand: {
      type: 'dtcg',
      file: './after.tokens.json',
      architecture: {
        layers: [
          { id: 'base', roots: ['size'], values: 'literal' },
          {
            id: 'meaning',
            roots: ['semantic'],
            values: 'reference',
            references: ['base', 'meaning'],
          },
        ],
      },
      ownership: { default: ['design-systems'] },
    },
  },
}
`
  )
  const tokens = value => ({
    size: { base: { $type: 'number', $value: value } },
    semantic: {
      action: { $type: 'number', $value: '{size.base}' },
    },
  })
  writeFileSync(
    path.join(consumerDirectory, 'before.tokens.json'),
    `${JSON.stringify(tokens(4), null, 2)}\n`
  )
  writeFileSync(
    path.join(consumerDirectory, 'after.tokens.json'),
    `${JSON.stringify(tokens(8), null, 2)}\n`
  )

  const cli = path.join(consumerDirectory, 'node_modules', '.bin', 'primitree')
  const shared = [
    '--config',
    'primitree.config.ts',
    '--source',
    'brand',
    '--format',
    'json',
  ]
  const check = parseCliJson(
    runCommand(cli, ['check', ...shared], options),
    'packed primitree check'
  )
  if (
    check.command !== 'check' ||
    check.source !== 'brand' ||
    check.summary?.active !== 0 ||
    !Array.isArray(check.findings) ||
    check.findings.length !== 0
  ) {
    throw new Error(
      'packed primitree check report did not match the expected command, source, summary, and findings'
    )
  }

  const inspect = parseCliJson(
    runCommand(cli, ['inspect', 'semantic.action', ...shared], options),
    'packed primitree inspect'
  )
  if (
    inspect.command !== 'inspect' ||
    inspect.source !== 'brand' ||
    inspect.resolvedValue !== 8 ||
    inspect.token?.path?.join('.') !== 'semantic.action'
  ) {
    throw new Error(
      'packed primitree inspect report did not match the expected command, source, value, and token path'
    )
  }

  const diff = parseCliJson(
    runCommand(
      cli,
      ['diff', 'before.tokens.json', 'after.tokens.json', ...shared],
      options
    ),
    'packed primitree diff'
  )
  const changedBase = diff.changes?.find(
    change =>
      change?.kind === 'changed' &&
      change.token?.path?.join('.') === 'size.base'
  )
  if (
    diff.command !== 'diff' ||
    diff.source !== 'brand' ||
    changedBase?.impacted?.some(
      token => token?.path?.join('.') === 'semantic.action'
    ) !== true ||
    diff.findings?.added?.length !== 0 ||
    diff.findings?.resolved?.length !== 0
  ) {
    throw new Error(
      'packed primitree diff report did not match the expected command, source, affected token, and findings'
    )
  }
}

export function runPackedCliTarballConsumer({
  artifactDirectory,
  environment = process.env,
  registry = PUBLIC_NPM_REGISTRY,
  runCommand = defaultRunCommand,
}) {
  const verified = verifyReleaseArtifacts({ artifactDirectory })
  const cliPackages = PUBLIC_RELEASE_PACKAGES.filter(config =>
    ['@primitree/core', '@primitree/dtcg', '@primitree/cli'].includes(
      config.name
    )
  )
  const cliPackageNames = new Set(cliPackages.map(config => config.name))
  const cliArtifacts = verified.artifacts.filter(artifact =>
    cliPackageNames.has(artifact.name)
  )
  const commandContext = createNpmExecutionContext({
    environment,
    keepOidc: false,
    prefix: 'primitree-packed-cli-',
    registry,
  })
  const consumerDirectory = commandContext.workingDirectory
  writeFileSync(
    path.join(consumerDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'primitree-packed-cli-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
      },
      null,
      2
    )}\n`
  )
  const options = commandOptions(commandContext)

  try {
    assertEffectiveRegistry(commandContext, registry, runCommand)
    smokeCommand(
      runCommand,
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--offline',
        '--package-lock=false',
        '--no-save',
        '--engine-strict',
        '--audit=false',
        '--fund=false',
        `--registry=${registry}`,
        '--fetch-retries=0',
        `--fetch-timeout=${FETCH_TIMEOUT_MS}`,
        ...cliArtifacts.map(artifact => artifact.path),
      ],
      commandOptions(commandContext, INSTALL_COMMAND_TIMEOUT_MS)
    )
    assertInstalledVersions(consumerDirectory, verified.version, cliPackages)
    smokeCommand(
      runCommand,
      path.join(consumerDirectory, 'node_modules', '.bin', 'primitree'),
      ['--help'],
      options
    )
    runPackedCliUserPath({ consumerDirectory, options, runCommand })
    return { version: verified.version }
  } finally {
    commandContext.cleanup()
  }
}

export function runPackedTarballConsumer({
  artifactDirectory,
  environment = process.env,
  registry = PUBLIC_NPM_REGISTRY,
  runCommand = defaultRunCommand,
}) {
  const verified = verifyReleaseArtifacts({ artifactDirectory })
  runPackedCliTarballConsumer({
    artifactDirectory,
    environment,
    registry,
    runCommand,
  })
  const commandContext = createNpmExecutionContext({
    environment,
    keepOidc: false,
    prefix: 'primitree-packed-consumer-',
    registry,
  })
  const consumerDirectory = commandContext.workingDirectory
  writeFileSync(
    path.join(consumerDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'primitree-packed-release-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
      },
      null,
      2
    )}\n`
  )
  const options = commandOptions(commandContext)

  try {
    assertEffectiveRegistry(commandContext, registry, runCommand)
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
      commandOptions(commandContext, INSTALL_COMMAND_TIMEOUT_MS)
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
    commandContext.cleanup()
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
  const commandContext = createNpmExecutionContext({
    environment,
    keepOidc: false,
    prefix: 'primitree-public-consumer-',
    registry,
  })
  const consumerDirectory = commandContext.workingDirectory
  writeFileSync(
    path.join(consumerDirectory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'primitree-public-release-consumer',
        version: '0.0.0',
        private: true,
        type: 'module',
      },
      null,
      2
    )}\n`
  )
  const options = commandOptions(commandContext)

  try {
    assertNpmVersion(commandOutput('npm', ['--version'], options, runCommand))
    assertEffectiveRegistry(commandContext, registry, runCommand)
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
      commandOptions(commandContext, INSTALL_COMMAND_TIMEOUT_MS)
    )
    assertInstalledVersions(consumerDirectory, version)
    smokeCommand(
      runCommand,
      'npm',
      ['audit', 'signatures', `--registry=${registry}`],
      commandOptions(commandContext, AUDIT_COMMAND_TIMEOUT_MS)
    )

    runInstalledPackageSmokeChecks({
      consumerDirectory,
      options,
      runCommand,
    })
    return { packages: exactPackageSpecs(version), version }
  } finally {
    commandContext.cleanup()
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
