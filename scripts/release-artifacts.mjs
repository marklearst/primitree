import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PUBLIC_RELEASE_PACKAGES } from './release-config.mjs'

const RELEASE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const MANIFEST_NAME = 'manifest.json'
const CHECKSUMS_NAME = 'SHA256SUMS'
const REPOSITORY_ROOT_URL = new URL('../', import.meta.url)
const REPOSITORY_ROOT = fileURLToPath(REPOSITORY_ROOT_URL)
const ARTIFACT_PARENT = fileURLToPath(
  new URL('artifacts/', REPOSITORY_ROOT_URL)
)
const ARTIFACT_DIRECTORY = path.join(ARTIFACT_PARENT, 'npm')
const SUBPROCESS_MAX_BUFFER = 32 * 1024 * 1024

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function sameStringSet(actual, expected) {
  if (
    !Array.isArray(actual) ||
    !actual.every(item => typeof item === 'string') ||
    new Set(actual).size !== actual.length
  ) {
    return false
  }
  const actualSorted = [...actual].sort()
  const expectedSorted = [...expected].sort()
  return (
    actualSorted.length === expectedSorted.length &&
    actualSorted.every((item, index) => item === expectedSorted[index])
  )
}

function requireExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be a plain object`)
  }
  if (!sameStringSet(Object.keys(value), expectedKeys)) {
    throw new Error(`${label} keys must be exactly ${expectedKeys.join(', ')}`)
  }
}

function resolveArtifactDirectory(value) {
  if (value instanceof URL) {
    if (value.protocol !== 'file:') {
      throw new Error('artifactDirectory must be an absolute path or file URL')
    }
    return fileURLToPath(value)
  }
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new Error('artifactDirectory must be an absolute path or file URL')
  }
  return path.resolve(value)
}

function requireRealDirectory(directory) {
  let stats
  try {
    stats = lstatSync(directory)
  } catch (error) {
    throw new Error(
      `unable to inspect artifact directory ${directory}: ${error.message}`
    )
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error('artifact directory must be a real directory')
  }
}

function readRegularFile(filePath, label) {
  let initialStats
  try {
    initialStats = lstatSync(filePath)
  } catch (error) {
    throw new Error(
      `${label} must be a regular file and must not be a symlink: ${error.message}`
    )
  }
  if (initialStats.isSymbolicLink() || !initialStats.isFile()) {
    throw new Error(`${label} must be a regular file and must not be a symlink`)
  }

  let descriptor
  try {
    descriptor = openSync(
      filePath,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
    )
    const openedStats = fstatSync(descriptor)
    if (
      !openedStats.isFile() ||
      openedStats.dev !== initialStats.dev ||
      openedStats.ino !== initialStats.ino
    ) {
      throw new Error('file changed while it was being opened')
    }
    return readFileSync(descriptor)
  } catch (error) {
    throw new Error(
      `${label} must be a regular file and must not be a symlink: ${error.message}`
    )
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

function parseManifest(bytes) {
  let manifest
  try {
    manifest = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`manifest.json must contain valid JSON: ${error.message}`)
  }
  requireExactKeys(manifest, ['version', 'artifacts'], 'manifest.json')
  if (
    typeof manifest.version !== 'string' ||
    !RELEASE_VERSION_PATTERN.test(manifest.version)
  ) {
    throw new Error('manifest version must use MAJOR.MINOR.PATCH')
  }
  if (!Array.isArray(manifest.artifacts)) {
    throw new Error('manifest artifacts must be an array')
  }
  if (manifest.artifacts.length !== PUBLIC_RELEASE_PACKAGES.length) {
    throw new Error(
      `manifest must contain exactly ${PUBLIC_RELEASE_PACKAGES.length} artifact entries`
    )
  }
  return manifest
}

export function expectedArtifacts(version) {
  if (typeof version !== 'string' || !RELEASE_VERSION_PATTERN.test(version)) {
    throw new Error('release version must use MAJOR.MINOR.PATCH')
  }
  return PUBLIC_RELEASE_PACKAGES.map(config => ({
    name: config.name,
    file: `figmavars-${config.name.slice('@figmavars/'.length)}-${version}.tgz`,
  }))
}

function validateManifestArtifacts(manifest) {
  const expected = expectedArtifacts(manifest.version)
  const names = new Set()
  const files = new Set()

  const artifacts = manifest.artifacts.map((entry, index) => {
    const label = `artifact entry ${index + 1}`
    requireExactKeys(entry, ['name', 'file', 'sha256'], label)

    if (typeof entry.name !== 'string') {
      throw new Error(`${label} name must be a string`)
    }
    if (names.has(entry.name)) {
      throw new Error(`duplicate artifact name ${entry.name}`)
    }
    names.add(entry.name)
    if (entry.name !== expected[index].name) {
      throw new Error(`${label} name must be ${expected[index].name}`)
    }

    if (typeof entry.file !== 'string') {
      throw new Error(`${label} file must be a string`)
    }
    if (files.has(entry.file)) {
      throw new Error(`duplicate artifact filename ${entry.file}`)
    }
    files.add(entry.file)
    if (entry.file !== expected[index].file) {
      throw new Error(`${label} file must be ${expected[index].file}`)
    }

    if (
      typeof entry.sha256 !== 'string' ||
      !SHA256_PATTERN.test(entry.sha256)
    ) {
      throw new Error(`${label} sha256 must be 64 lowercase hexadecimal digits`)
    }

    return { ...entry }
  })

  return artifacts
}

function canonicalChecksums(artifacts) {
  return `${artifacts
    .map(artifact => `${artifact.sha256}  ${artifact.file}`)
    .join('\n')}\n`
}

function inspectPath(filePath, label) {
  try {
    return lstatSync(filePath)
  } catch (error) {
    throw new Error(`unable to inspect ${label}: ${error.message}`)
  }
}

export function assertRealPathComponents(
  rootDirectory,
  relativePath,
  { leafKind = 'directory' } = {}
) {
  if (
    typeof rootDirectory !== 'string' ||
    !path.isAbsolute(rootDirectory) ||
    typeof relativePath !== 'string' ||
    relativePath === '' ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      'safe path validation requires an absolute root and relative path'
    )
  }
  const components = relativePath.split(/[\\/]/)
  if (
    components.some(
      component => component === '' || component === '.' || component === '..'
    )
  ) {
    throw new Error(`${relativePath} must be a normalized relative path`)
  }

  const root = path.resolve(rootDirectory)
  const rootStats = inspectPath(root, 'path validation root')
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error('path validation root must be a real directory')
  }

  const target = path.resolve(root, ...components)
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${relativePath} escapes its root directory`)
  }

  let current = root
  for (let index = 0; index < components.length; index += 1) {
    current = path.join(current, components[index])
    const label = components.slice(0, index + 1).join('/')
    const stats = inspectPath(current, label)
    if (stats.isSymbolicLink()) {
      throw new Error(`${label} must not be a symlink`)
    }
    const isLeaf = index === components.length - 1
    if (!isLeaf && !stats.isDirectory()) {
      throw new Error(`${label} must be a directory`)
    }
    if (isLeaf && leafKind === 'directory' && !stats.isDirectory()) {
      throw new Error(`${label} must be a directory`)
    }
    if (
      isLeaf &&
      leafKind === 'file-or-directory' &&
      !stats.isFile() &&
      !stats.isDirectory()
    ) {
      throw new Error(`${label} must be a regular file or directory`)
    }
  }
  return target
}

function ensureBuildInputs() {
  for (const config of PUBLIC_RELEASE_PACKAGES) {
    assertRealPathComponents(REPOSITORY_ROOT, config.path)

    for (const requiredFile of config.requiredFiles) {
      assertRealPathComponents(
        REPOSITORY_ROOT,
        path.posix.join(config.path, requiredFile),
        { leafKind: 'file-or-directory' }
      )
    }
  }
}

function repositoryReleaseVersion() {
  const versions = new Set()
  for (const config of PUBLIC_RELEASE_PACKAGES) {
    const bytes = readRegularFile(
      path.resolve(REPOSITORY_ROOT, config.manifestPath),
      config.manifestPath
    )
    let manifest
    try {
      manifest = JSON.parse(bytes.toString('utf8'))
    } catch (error) {
      throw new Error(
        `${config.manifestPath} must contain JSON: ${error.message}`
      )
    }
    if (!isPlainObject(manifest)) {
      throw new Error(`${config.manifestPath} must contain a plain object`)
    }
    versions.add(manifest.version)
  }
  const [version] = versions
  if (
    versions.size !== 1 ||
    typeof version !== 'string' ||
    !RELEASE_VERSION_PATTERN.test(version)
  ) {
    throw new Error('public package versions must share one MAJOR.MINOR.PATCH')
  }
  return version
}

function ensureArtifactParent() {
  let parentStats
  try {
    parentStats = lstatSync(ARTIFACT_PARENT)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`unable to inspect artifacts parent: ${error.message}`)
    }
    mkdirSync(ARTIFACT_PARENT)
    parentStats = lstatSync(ARTIFACT_PARENT)
  }
  if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) {
    throw new Error('artifacts parent must be a real directory')
  }

  try {
    const artifactStats = lstatSync(ARTIFACT_DIRECTORY)
    if (artifactStats.isSymbolicLink() || !artifactStats.isDirectory()) {
      throw new Error('artifacts/npm must be a real directory')
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

function formatCommand(command, args) {
  return [command, ...args].map(value => JSON.stringify(value)).join(' ')
}

function spawnChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: SUBPROCESS_MAX_BUFFER,
    ...options,
  })
  if (
    result.error !== undefined ||
    result.signal !== null ||
    result.status === null ||
    result.status !== 0
  ) {
    const details = [
      `command failed: ${formatCommand(command, args)}`,
      `status: ${String(result.status)}`,
      `signal: ${String(result.signal)}`,
      `error: ${result.error?.message ?? '(none)'}`,
      `stdout:\n${result.stdout ?? ''}`,
      `stderr:\n${result.stderr ?? ''}`,
    ]
    throw new Error(details.join('\n'))
  }
  return result
}

function parsePackResult(stdout, config, version, expectedPath) {
  let result
  try {
    result = JSON.parse(stdout)
  } catch (error) {
    throw new Error(
      `pnpm pack for ${config.name} must emit exactly one JSON object: ${error.message}`
    )
  }
  if (!isPlainObject(result)) {
    throw new Error(`pnpm pack for ${config.name} must emit one JSON object`)
  }
  if (result.name !== config.name) {
    throw new Error(`pnpm pack returned the wrong name for ${config.name}`)
  }
  if (result.version !== version) {
    throw new Error(`pnpm pack returned the wrong version for ${config.name}`)
  }
  if (!Array.isArray(result.files)) {
    throw new Error(`pnpm pack returned malformed files for ${config.name}`)
  }
  if (
    typeof result.filename !== 'string' ||
    path.basename(result.filename) !== path.basename(expectedPath) ||
    path.resolve(result.filename) !== expectedPath
  ) {
    throw new Error(`pnpm pack returned an unsafe filename for ${config.name}`)
  }
}

function writeAtomic(filePath, value) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`
  )
  try {
    writeFileSync(temporaryPath, value, { flag: 'wx' })
    renameSync(temporaryPath, filePath)
  } finally {
    rmSync(temporaryPath, { force: true })
  }
}

function replaceArtifactDirectory(stagingDirectory) {
  const backupDirectory = path.join(
    ARTIFACT_PARENT,
    `.npm-backup-${randomUUID()}`
  )
  let hasBackup = false
  try {
    try {
      lstatSync(ARTIFACT_DIRECTORY)
      renameSync(ARTIFACT_DIRECTORY, backupDirectory)
      hasBackup = true
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }

    try {
      renameSync(stagingDirectory, ARTIFACT_DIRECTORY)
    } catch (error) {
      if (hasBackup) renameSync(backupDirectory, ARTIFACT_DIRECTORY)
      throw error
    }

    if (hasBackup) rmSync(backupDirectory, { recursive: true, force: true })
  } catch (error) {
    throw new Error(
      `unable to replace artifacts/npm atomically: ${error.message}`
    )
  }
}

function baseSubprocessEnvironment() {
  return {
    ...process.env,
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    npm_config_color: 'false',
  }
}

export function packReleaseArtifacts() {
  ensureBuildInputs()
  ensureArtifactParent()
  const version = repositoryReleaseVersion()
  const expected = expectedArtifacts(version)
  const stagingDirectory = mkdtempSync(
    path.join(ARTIFACT_PARENT, '.npm-staging-')
  )
  let stagingOwned = true

  try {
    const outputPattern = path.join(stagingDirectory, '%s-%v.tgz')
    const artifacts = []
    for (let index = 0; index < PUBLIC_RELEASE_PACKAGES.length; index += 1) {
      const config = PUBLIC_RELEASE_PACKAGES[index]
      const expectedPath = path.join(stagingDirectory, expected[index].file)
      const result = spawnChecked(
        'pnpm',
        [
          '--filter',
          config.name,
          'pack',
          '--json',
          '--out',
          outputPattern,
          '--config.ignore-scripts=true',
        ],
        {
          cwd: REPOSITORY_ROOT,
          env: baseSubprocessEnvironment(),
        }
      )
      parsePackResult(result.stdout, config, version, expectedPath)
      const bytes = readRegularFile(expectedPath, expected[index].file)
      artifacts.push({
        ...expected[index],
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })
    }

    const manifest = { version, artifacts }
    writeAtomic(
      path.join(stagingDirectory, MANIFEST_NAME),
      `${JSON.stringify(manifest, null, 2)}\n`
    )
    writeAtomic(
      path.join(stagingDirectory, CHECKSUMS_NAME),
      canonicalChecksums(artifacts)
    )
    verifyReleaseArtifacts({ artifactDirectory: stagingDirectory })

    replaceArtifactDirectory(stagingDirectory)
    stagingOwned = false
    return verifyReleaseArtifacts({ artifactDirectory: ARTIFACT_DIRECTORY })
  } finally {
    if (stagingOwned) {
      rmSync(stagingDirectory, { recursive: true, force: true })
    }
  }
}

function sanitizedNpmEnvironment(userConfigPath) {
  const environment = baseSubprocessEnvironment()
  for (const key of Object.keys(environment)) {
    if (
      key === 'NODE_AUTH_TOKEN' ||
      key === 'NPM_TOKEN' ||
      key === 'SIGSTORE_ID_TOKEN' ||
      key.startsWith('ACTIONS_ID_TOKEN_REQUEST_') ||
      /^NPM_CONFIG_.*(?:AUTH|TOKEN|OTP|PROVENANCE)$/i.test(key)
    ) {
      delete environment[key]
    }
  }
  environment.NPM_CONFIG_USERCONFIG = userConfigPath
  environment.npm_config_userconfig = userConfigPath
  return environment
}

export function npmPublishDryRunArgs(artifactPath) {
  if (typeof artifactPath !== 'string' || !path.isAbsolute(artifactPath)) {
    throw new Error('npm publish dry-run requires an absolute tarball path')
  }
  return [
    'publish',
    artifactPath,
    '--dry-run',
    '--offline',
    '--provenance=false',
    '--access=public',
    '--tag=latest',
    '--ignore-scripts',
    '--registry=https://registry.npmjs.org/',
  ]
}

export function checkReleaseArtifacts() {
  const before = verifyReleaseArtifacts({
    artifactDirectory: ARTIFACT_DIRECTORY,
  })
  const temporaryRoot = mkdtempSync(
    path.join(tmpdir(), 'figmavars-release-check-')
  )
  try {
    const userConfigPath = path.join(temporaryRoot, 'npmrc')
    writeFileSync(userConfigPath, '')
    const environment = sanitizedNpmEnvironment(userConfigPath)
    const commonOptions = {
      cwd: REPOSITORY_ROOT,
      env: environment,
    }

    for (let index = 0; index < before.artifacts.length; index += 1) {
      const artifact = before.artifacts[index]
      const config = PUBLIC_RELEASE_PACKAGES[index]
      spawnChecked(
        'pnpm',
        ['exec', 'publint', artifact.path, '--strict'],
        commonOptions
      )
      if (config.attwProfile !== null) {
        spawnChecked(
          'pnpm',
          ['exec', 'attw', artifact.path, '--profile', config.attwProfile],
          commonOptions
        )
      }
      spawnChecked('npm', npmPublishDryRunArgs(artifact.path), commonOptions)
    }

    const consumerDirectory = path.join(temporaryRoot, 'consumer')
    mkdirSync(consumerDirectory)
    writeFileSync(
      path.join(consumerDirectory, 'package.json'),
      `${JSON.stringify(
        { name: 'figmavars-release-consumer', version: '0.0.0', private: true },
        null,
        2
      )}\n`
    )
    spawnChecked(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--package-lock=false',
        '--no-save',
        '--audit=false',
        '--fund=false',
        '--registry=https://registry.npmjs.org/',
        ...before.artifacts.map(artifact => artifact.path),
      ],
      {
        cwd: consumerDirectory,
        env: environment,
      }
    )
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }

  return verifyReleaseArtifacts({ artifactDirectory: ARTIFACT_DIRECTORY })
}

export function verifyReleaseArtifacts({ artifactDirectory } = {}) {
  const directory = resolveArtifactDirectory(artifactDirectory)
  requireRealDirectory(directory)

  const manifestBytes = readRegularFile(
    path.join(directory, MANIFEST_NAME),
    MANIFEST_NAME
  )
  const checksumBytes = readRegularFile(
    path.join(directory, CHECKSUMS_NAME),
    CHECKSUMS_NAME
  )
  const manifest = parseManifest(manifestBytes)
  const artifacts = validateManifestArtifacts(manifest)

  const artifactBytes = artifacts.map(artifact => ({
    artifact,
    bytes: readRegularFile(path.join(directory, artifact.file), artifact.file),
  }))

  const expectedDirectoryEntries = new Set([
    MANIFEST_NAME,
    CHECKSUMS_NAME,
    ...artifacts.map(artifact => artifact.file),
  ])
  const directoryEntries = readdirSync(directory, { withFileTypes: true })
  for (const entry of directoryEntries) {
    if (!expectedDirectoryEntries.has(entry.name)) {
      throw new Error(`unexpected artifact directory entry ${entry.name}`)
    }
  }
  if (directoryEntries.length !== PUBLIC_RELEASE_PACKAGES.length + 2) {
    throw new Error('artifact directory must contain exactly seven entries')
  }

  if (checksumBytes.toString('utf8') !== canonicalChecksums(artifacts)) {
    throw new Error('SHA256SUMS must use the canonical ordered byte format')
  }

  for (const { artifact, bytes } of artifactBytes) {
    const computed = createHash('sha256').update(bytes).digest('hex')
    if (computed !== artifact.sha256) {
      throw new Error(`computed SHA-256 does not match ${artifact.file}`)
    }
  }

  return {
    version: manifest.version,
    artifacts: artifacts.map(artifact => ({
      ...artifact,
      path: path.join(directory, artifact.file),
    })),
  }
}

function runCli() {
  const args = process.argv.slice(2)
  if (args.length !== 1 || !['pack', 'verify', 'check'].includes(args[0])) {
    throw new Error('Usage: release-artifacts.mjs <pack|verify|check>')
  }

  let result
  if (args[0] === 'pack') {
    result = packReleaseArtifacts()
  } else if (args[0] === 'verify') {
    result = verifyReleaseArtifacts({ artifactDirectory: ARTIFACT_DIRECTORY })
  } else {
    result = checkReleaseArtifacts()
  }
  console.log(
    `Release artifacts ${args[0]} valid for ${result.artifacts.length} packages at ${result.version}`
  )
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  try {
    runCli()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
