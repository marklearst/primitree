import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  PUBLIC_RELEASE_PACKAGES,
  RELEASE_BUGS,
  RELEASE_FUNDING,
  RELEASE_FUNDING_TYPE,
  RELEASE_HOMEPAGE,
  RELEASE_REPOSITORY,
  RELEASE_REPOSITORY_TYPE,
} from './release-config.mjs'

const RELEASE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const EXPECTED_AUTHOR = 'Mark Learst'
const EXPECTED_LICENSE = 'MIT'
const EXPECTED_CONSUMER_ENGINE = '>=20.0.0'
const DEPENDENCY_FIELDS = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
]
const ROOT_LICENSE = readFileSync(
  new URL('../LICENSE', import.meta.url),
  'utf8'
).trimEnd()
const INVENTORY_BY_MANIFEST = new Map(
  PUBLIC_RELEASE_PACKAGES.map(config => [config.manifestPath, config])
)
const INVENTORY_NAMES = new Set(
  PUBLIC_RELEASE_PACKAGES.map(config => config.name)
)

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function exactStringArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.every(value => typeof value === 'string') &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  )
}

function sameStringSet(actual, expected) {
  if (
    !Array.isArray(actual) ||
    !actual.every(value => typeof value === 'string') ||
    actual.length !== expected.length
  ) {
    return false
  }
  const sortedActual = [...actual].sort()
  const sortedExpected = [...expected].sort()
  return sortedActual.every((value, index) => value === sortedExpected[index])
}

function validateJsonValue(value, label, errors, ancestors = new WeakSet()) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return
  }
  if (typeof value !== 'object') {
    errors.push(`${label} must contain only JSON values`)
    return
  }
  if (ancestors.has(value)) {
    errors.push(`${label} must not contain circular data`)
    return
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    errors.push(`${label} must contain only arrays and plain objects`)
    return
  }

  ancestors.add(value)
  for (const [key, child] of Object.entries(value)) {
    validateJsonValue(child, `${label}.${key}`, errors, ancestors)
  }
  ancestors.delete(value)
}

function containsLegacyNamespace(value, seen = new WeakSet()) {
  if (typeof value === 'string') return value.includes('@figma-vars/')
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return false
  }
  seen.add(value)
  return Object.entries(value).some(
    ([key, child]) =>
      key.includes('@figma-vars/') || containsLegacyNamespace(child, seen)
  )
}

function isSafePackageTarget(target, requiredFiles) {
  if (
    typeof target !== 'string' ||
    !target.startsWith('./') ||
    target.length <= 2 ||
    target.includes('\\') ||
    /[\0-\x1f\x7f]/.test(target)
  ) {
    return false
  }
  const relative = target.slice(2)
  const segments = relative.split('/')
  if (
    segments.some(
      segment => segment === '' || segment === '.' || segment === '..'
    )
  ) {
    return false
  }
  return requiredFiles.some(
    entry => relative === entry || relative.startsWith(`${entry}/`)
  )
}

function collectExportTargets(value, label, requiredFiles, errors) {
  const targets = []
  const ancestors = new WeakSet()

  function visit(node, nodeLabel) {
    if (typeof node === 'string') {
      if (!isSafePackageTarget(node, requiredFiles)) {
        errors.push(`${nodeLabel} must be a safe target included by files`)
      }
      targets.push(node)
      return
    }
    if (!isPlainObject(node) || Object.keys(node).length === 0) {
      errors.push(`${nodeLabel} must be a target string or condition object`)
      return
    }
    if (ancestors.has(node)) {
      errors.push(`${nodeLabel} must not contain circular conditions`)
      return
    }
    ancestors.add(node)
    for (const [condition, child] of Object.entries(node)) {
      visit(child, `${nodeLabel}.${condition}`)
    }
    ancestors.delete(node)
  }

  visit(value, label)
  return targets
}

function validateCanonicalMetadata(pkg, config, errors) {
  const { manifest, manifestPath, licenseText } = pkg
  if (!isPlainObject(manifest)) {
    errors.push(`${manifestPath} manifest must be a plain object`)
    return
  }
  validateJsonValue(manifest, `${manifestPath} manifest`, errors)

  if (manifest.name !== config.name) {
    errors.push(`${manifestPath} must be named ${config.name}`)
  }
  if (manifest.private !== undefined && manifest.private !== false) {
    errors.push(`${manifestPath} must be publishable`)
  }
  if (licenseText?.trimEnd() !== ROOT_LICENSE) {
    errors.push(`${config.path}/LICENSE must match the repository LICENSE`)
  }
  if (
    typeof manifest.description !== 'string' ||
    manifest.description.trim() === ''
  ) {
    errors.push(`${manifestPath} must have a description`)
  }
  if (manifest.license !== EXPECTED_LICENSE) {
    errors.push(`${manifestPath} must use the MIT license`)
  }
  if (manifest.author !== EXPECTED_AUTHOR) {
    errors.push(`${manifestPath} must use author ${EXPECTED_AUTHOR}`)
  }
  if (manifest.type !== 'module') {
    errors.push(`${manifestPath} must use package type module`)
  }
  if (manifest.repository?.type !== RELEASE_REPOSITORY_TYPE) {
    errors.push(`${manifestPath} must use the canonical repository type`)
  }
  if (manifest.repository?.url !== RELEASE_REPOSITORY) {
    errors.push(`${manifestPath} must use the canonical repository URL`)
  }
  if (manifest.repository?.directory !== config.path) {
    errors.push(`${manifestPath} repository.directory must be ${config.path}`)
  }
  if (manifest.homepage !== RELEASE_HOMEPAGE) {
    errors.push(`${manifestPath} must use the canonical homepage`)
  }
  if (manifest.bugs?.url !== RELEASE_BUGS) {
    errors.push(`${manifestPath} must use the canonical bugs URL`)
  }
  if (manifest.funding?.type !== RELEASE_FUNDING_TYPE) {
    errors.push(`${manifestPath} must use the canonical funding type`)
  }
  if (manifest.funding?.url !== RELEASE_FUNDING) {
    errors.push(`${manifestPath} must use the canonical funding URL`)
  }
  if (manifest.engines?.node !== EXPECTED_CONSUMER_ENGINE) {
    errors.push(`${manifestPath} must support Node ${EXPECTED_CONSUMER_ENGINE}`)
  }

  const publishConfig = manifest.publishConfig
  if (
    !isPlainObject(publishConfig) ||
    !sameStringSet(Object.keys(publishConfig), ['access', 'provenance'])
  ) {
    errors.push(
      `${manifestPath} publishConfig keys must be exactly access, provenance`
    )
  }
  if (publishConfig?.access !== 'public') {
    errors.push(`${manifestPath} publishConfig.access must be public`)
  }
  if (publishConfig?.provenance !== true) {
    errors.push(`${manifestPath} publishConfig.provenance must be true`)
  }

  if (!exactStringArray(manifest.files, config.requiredFiles)) {
    errors.push(
      `${manifestPath} files must be exactly ${config.requiredFiles.join(', ')}`
    )
  }

  const exportObject = manifest.exports
  const exportKeys = isPlainObject(exportObject)
    ? Object.keys(exportObject)
    : []
  if (
    (exportObject !== undefined && !isPlainObject(exportObject)) ||
    !sameStringSet(exportKeys, config.requiredExports)
  ) {
    errors.push(
      `${manifestPath} exports must be exactly ${config.requiredExports.join(', ') || '(none)'}`
    )
  }
  if (isPlainObject(exportObject)) {
    for (const exportName of config.requiredExports) {
      if (!Object.hasOwn(exportObject, exportName)) continue
      const actualTargets = collectExportTargets(
        exportObject[exportName],
        `${manifestPath} export ${exportName}`,
        config.requiredFiles,
        errors
      )
      if (
        !sameStringSet(
          [...new Set(actualTargets)],
          config.exportTargets[exportName]
        )
      ) {
        errors.push(
          `${manifestPath} export ${exportName} targets must match the release inventory`
        )
      }
    }
  }

  const requiredBins =
    config.requiredBin === undefined ? [] : [config.requiredBin]
  const binObject = manifest.bin
  const binKeys = isPlainObject(binObject) ? Object.keys(binObject) : []
  if (
    (binObject !== undefined && !isPlainObject(binObject)) ||
    !sameStringSet(binKeys, requiredBins)
  ) {
    errors.push(
      `${manifestPath} bins must be exactly ${requiredBins.join(', ') || '(none)'}`
    )
  }
  if (config.requiredBin !== undefined && isPlainObject(binObject)) {
    const target = binObject[config.requiredBin]
    if (
      target !== config.requiredBinTarget ||
      !isSafePackageTarget(target, config.requiredFiles)
    ) {
      errors.push(
        `${manifestPath} bin ${config.requiredBin} must target ${config.requiredBinTarget}`
      )
    }
  }

  const internalRuntimeDependencies = []
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field]
    if (dependencies === undefined) continue
    if (!isPlainObject(dependencies)) {
      errors.push(`${manifestPath} ${field} must be a plain object`)
      continue
    }
    for (const [name, specifier] of Object.entries(dependencies)) {
      if (!name.startsWith('@figmavars/')) continue
      if (!INVENTORY_NAMES.has(name)) {
        errors.push(
          `${manifestPath} has unexpected internal dependency ${name}`
        )
      }
      if (field !== 'dependencies') {
        errors.push(
          `${manifestPath} internal dependency ${name} must be in dependencies`
        )
      } else {
        internalRuntimeDependencies.push(name)
      }
      if (specifier !== 'workspace:*') {
        errors.push(
          `${manifestPath} internal dependency ${name} must use workspace:*`
        )
      }
    }
  }
  if (
    !sameStringSet(
      internalRuntimeDependencies,
      config.requiredInternalRuntimeDependencies
    )
  ) {
    errors.push(
      `${manifestPath} internal runtime dependencies must be exactly ${config.requiredInternalRuntimeDependencies.join(', ') || '(none)'}`
    )
  }

  if (containsLegacyNamespace(manifest)) {
    errors.push(`${manifestPath} contains the legacy namespace @figma-vars/`)
  }
}

function assertPackageArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(
      `Release metadata check failed:\n- ${name} must be an array`
    )
  }
}

export function validateReleaseManifests({
  publicPackages,
  privatePackages,
  tag,
}) {
  assertPackageArray(publicPackages, 'publicPackages')
  assertPackageArray(privatePackages, 'privatePackages')

  const errors = []
  const versions = new Set()
  const seenPublic = new Set()
  const seenWorkspaces = new Set()

  for (const pkg of publicPackages) {
    if (!isPlainObject(pkg)) {
      errors.push('public package record must be a plain object')
      continue
    }
    const { path, manifestPath, manifest } = pkg
    if (typeof manifestPath !== 'string') {
      errors.push('public package manifestPath must be a string')
      continue
    }
    if (seenPublic.has(manifestPath)) {
      errors.push(`duplicate public workspace ${manifestPath}`)
      continue
    }
    seenPublic.add(manifestPath)
    if (seenWorkspaces.has(manifestPath)) {
      errors.push(`duplicate workspace ${manifestPath}`)
    }
    seenWorkspaces.add(manifestPath)

    const config = INVENTORY_BY_MANIFEST.get(manifestPath)
    if (config === undefined) {
      errors.push(`unexpected public workspace ${manifestPath}`)
      continue
    }
    if (path !== config.path) {
      errors.push(`${manifestPath} package path must be ${config.path}`)
    }
    validateCanonicalMetadata(pkg, config, errors)
    if (isPlainObject(manifest)) versions.add(manifest.version)
  }

  for (const config of PUBLIC_RELEASE_PACKAGES) {
    if (!seenPublic.has(config.manifestPath)) {
      errors.push(`missing public workspace ${config.manifestPath}`)
    }
  }
  if (publicPackages.length !== PUBLIC_RELEASE_PACKAGES.length) {
    errors.push(`expected ${PUBLIC_RELEASE_PACKAGES.length} public packages`)
  }

  const [version] = versions
  if (versions.size !== 1 || typeof version !== 'string') {
    errors.push('all public packages must use one version')
  } else if (!RELEASE_VERSION_PATTERN.test(version)) {
    errors.push(`package version ${version} must use MAJOR.MINOR.PATCH`)
  }

  for (const pkg of privatePackages) {
    if (!isPlainObject(pkg)) {
      errors.push('private package record must be a plain object')
      continue
    }
    const { manifestPath, manifest } = pkg
    if (typeof manifestPath !== 'string') {
      errors.push('private package manifestPath must be a string')
      continue
    }
    if (seenWorkspaces.has(manifestPath)) {
      errors.push(`duplicate workspace ${manifestPath}`)
      continue
    }
    seenWorkspaces.add(manifestPath)
    if (INVENTORY_BY_MANIFEST.has(manifestPath)) {
      errors.push(`${manifestPath} must be classified as public`)
    }
    if (!isPlainObject(manifest)) {
      errors.push(`${manifestPath} manifest must be a plain object`)
      continue
    }
    validateJsonValue(manifest, `${manifestPath} manifest`, errors)
    if (manifest.private !== true) {
      errors.push(`${manifestPath} must be private`)
    }
    if (typeof version === 'string' && manifest.version !== version) {
      errors.push(`${manifestPath} must use version ${version}`)
    }
  }

  if (tag !== undefined) {
    if (
      typeof tag !== 'string' ||
      !new RegExp(`^v${RELEASE_VERSION_PATTERN.source.slice(1, -1)}$`).test(tag)
    ) {
      errors.push(`release tag ${String(tag)} must use vMAJOR.MINOR.PATCH`)
    } else if (typeof version === 'string' && tag !== `v${version}`) {
      errors.push(`tag ${tag} does not match package version ${version}`)
    }
  }

  if (errors.length > 0) {
    throw new Error(`Release metadata check failed:\n- ${errors.join('\n- ')}`)
  }

  return {
    version,
    publicNames: PUBLIC_RELEASE_PACKAGES.map(config => config.name),
  }
}

function rootUrlFrom(root) {
  if (root instanceof URL) return root
  return pathToFileURL(`${resolve(root)}${sep}`)
}

export function discoverWorkspaceManifestPaths(root) {
  const rootUrl = rootUrlFrom(root)
  const paths = []

  for (const group of ['packages', 'apps']) {
    const groupUrl = new URL(`${group}/`, rootUrl)
    for (const entry of readdirSync(groupUrl, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name)
    )) {
      if (entry.isSymbolicLink()) {
        throw new Error(`${group}/${entry.name} must not be a symbolic link`)
      }
      if (!entry.isDirectory()) continue
      const manifestPath = `${group}/${entry.name}/package.json`
      const manifestUrl = new URL(manifestPath, rootUrl)
      let status
      try {
        status = lstatSync(manifestUrl)
      } catch (error) {
        if (error?.code === 'ENOENT') continue
        throw error
      }
      if (status.isSymbolicLink() || !status.isFile()) {
        throw new Error(`${manifestPath} must be a regular file`)
      }
      paths.push(manifestPath)
    }
  }

  return paths
}

function readManifest(rootUrl, manifestPath) {
  const manifestUrl = new URL(manifestPath, rootUrl)
  const licenseUrl = new URL('LICENSE', manifestUrl)
  let licenseText
  if (existsSync(fileURLToPath(licenseUrl))) {
    const status = lstatSync(licenseUrl)
    if (status.isSymbolicLink() || !status.isFile()) {
      throw new Error(
        `${manifestPath.replace(/package\.json$/, 'LICENSE')} must be a regular file`
      )
    }
    licenseText = readFileSync(licenseUrl, 'utf8')
  }

  return {
    path: manifestPath.replace(/\/package\.json$/, ''),
    manifestPath,
    manifest: JSON.parse(readFileSync(manifestUrl, 'utf8')),
    licenseText,
  }
}

export function checkRepository() {
  const rootUrl = new URL('../', import.meta.url)
  const workspaces = discoverWorkspaceManifestPaths(rootUrl).map(path =>
    readManifest(rootUrl, path)
  )
  const publicPackages = workspaces.filter(pkg =>
    INVENTORY_BY_MANIFEST.has(pkg.manifestPath)
  )
  const privatePackages = workspaces.filter(
    pkg => !INVENTORY_BY_MANIFEST.has(pkg.manifestPath)
  )
  const tag =
    process.env.GITHUB_REF_TYPE === 'tag'
      ? (process.env.GITHUB_REF_NAME ?? '')
      : undefined

  const result = validateReleaseManifests({
    publicPackages,
    privatePackages,
    tag,
  })
  console.log(
    `Release metadata valid for ${result.publicNames.length} public packages at ${result.version}`
  )
  return result
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  checkRepository()
}
