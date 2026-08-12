import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  PUBLIC_RELEASE_PACKAGES,
  RELEASE_BUGS,
  RELEASE_FUNDING,
  RELEASE_FUNDING_TYPE,
  RELEASE_HOMEPAGE,
  RELEASE_NODE_ENGINE,
  RELEASE_REPOSITORY,
  RELEASE_REPOSITORY_TYPE,
} from './release-config.mjs'

const RELEASE_VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-next\.(0|[1-9]\d*))?$/
const EXPECTED_AUTHOR = 'Mark Learst'
const EXPECTED_LICENSE = 'MIT'
const FORMER_PACKAGE_SCOPES = ['@figma-vars/', '@figmavars/']
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
    return true
  }
  if (typeof value !== 'object') {
    errors.push(`${label} must contain only JSON values`)
    return false
  }
  if (ancestors.has(value)) {
    errors.push(`${label} must not contain circular data`)
    return false
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    errors.push(`${label} must contain only arrays and plain objects`)
    return false
  }

  let valid = true
  ancestors.add(value)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const keys = Reflect.ownKeys(descriptors)
  const dataKeys = Array.isArray(value)
    ? keys.filter(key => key !== 'length')
    : keys

  if (Array.isArray(value)) {
    const expectedKeys = Array.from({ length: value.length }, (_, index) =>
      String(index)
    )
    if (
      !sameStringSet(
        dataKeys.filter(key => typeof key === 'string'),
        expectedKeys
      ) ||
      dataKeys.some(key => typeof key !== 'string')
    ) {
      errors.push(`${label} must be a dense JSON array without extra keys`)
      valid = false
    }
  }

  for (const key of dataKeys) {
    const propertyLabel = `${label}.${String(key)}`
    const descriptor = descriptors[key]
    if (
      typeof key !== 'string' ||
      descriptor === undefined ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, 'value')
    ) {
      errors.push(`${propertyLabel} must be an enumerable data property`)
      valid = false
      continue
    }
    if (
      !validateJsonValue(descriptor.value, propertyLabel, errors, ancestors)
    ) {
      valid = false
    }
  }
  ancestors.delete(value)
  return valid
}

function containsFormerPackageScope(value, seen = new WeakSet()) {
  if (typeof value === 'string') {
    return FORMER_PACKAGE_SCOPES.some(scope => value.includes(scope))
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) {
    return false
  }
  seen.add(value)
  return Object.entries(value).some(
    ([key, child]) =>
      FORMER_PACKAGE_SCOPES.some(scope => key.includes(scope)) ||
      containsFormerPackageScope(child, seen)
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

function exactJsonStructure(actual, expected) {
  if (actual === expected) return true
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      actual.every((value, index) => exactJsonStructure(value, expected[index]))
    )
  }
  if (!isPlainObject(actual) || !isPlainObject(expected)) return false
  const actualKeys = Object.keys(actual)
  const expectedKeys = Object.keys(expected)
  return (
    exactStringArray(actualKeys, expectedKeys) &&
    expectedKeys.every(key => exactJsonStructure(actual[key], expected[key]))
  )
}

function validateCanonicalMetadata(pkg, config, errors) {
  const { manifest, manifestPath, licenseText } = pkg
  if (!isPlainObject(manifest)) {
    errors.push(`${manifestPath} manifest must be a plain object`)
    return false
  }
  if (!validateJsonValue(manifest, `${manifestPath} manifest`, errors)) {
    return false
  }

  if (manifest.name !== config.name) {
    errors.push(`${manifestPath} must be named ${config.name}`)
  }
  if (manifest.private !== undefined && manifest.private !== false) {
    errors.push(`${manifestPath} must be publishable`)
  }
  if (
    typeof licenseText !== 'string' ||
    licenseText.trimEnd() !== ROOT_LICENSE
  ) {
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
    errors.push(
      `${manifestPath} repository.type must be ${RELEASE_REPOSITORY_TYPE}`
    )
  }
  if (manifest.repository?.url !== RELEASE_REPOSITORY) {
    errors.push(`${manifestPath} repository.url must be ${RELEASE_REPOSITORY}`)
  }
  if (manifest.repository?.directory !== config.path) {
    errors.push(`${manifestPath} repository.directory must be ${config.path}`)
  }
  if (manifest.homepage !== RELEASE_HOMEPAGE) {
    errors.push(`${manifestPath} homepage must be ${RELEASE_HOMEPAGE}`)
  }
  if (manifest.bugs?.url !== RELEASE_BUGS) {
    errors.push(`${manifestPath} bugs.url must be ${RELEASE_BUGS}`)
  }
  if (manifest.funding?.type !== RELEASE_FUNDING_TYPE) {
    errors.push(`${manifestPath} funding.type must be ${RELEASE_FUNDING_TYPE}`)
  }
  if (manifest.funding?.url !== RELEASE_FUNDING) {
    errors.push(`${manifestPath} funding.url must be ${RELEASE_FUNDING}`)
  }
  if (manifest.engines?.node !== RELEASE_NODE_ENGINE) {
    errors.push(`${manifestPath} must support Node ${RELEASE_NODE_ENGINE}`)
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
  if (!exactJsonStructure(exportObject, config.expectedExports)) {
    errors.push(
      `${manifestPath} export map structure must match the release inventory`
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
      if (!name.startsWith('@primitree/')) continue
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

  if (containsFormerPackageScope(manifest)) {
    errors.push(
      `${manifestPath} contains a former package scope: ${FORMER_PACKAGE_SCOPES.join(', ')}`
    )
  }
  return true
}

function ownDataValue(object, key, label, errors, required = true) {
  const descriptor = Object.getOwnPropertyDescriptor(object, key)
  if (descriptor === undefined) {
    if (required) errors.push(`${label}.${key} is required`)
    return undefined
  }
  if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
    errors.push(`${label}.${key} must be an enumerable data property`)
    return undefined
  }
  return descriptor.value
}

function readPackageRecord(pkg, label, errors) {
  if (!isPlainObject(pkg)) {
    errors.push(`${label} record must be a plain object`)
    return undefined
  }
  return {
    path: ownDataValue(pkg, 'path', label, errors),
    manifestPath: ownDataValue(pkg, 'manifestPath', label, errors),
    manifest: ownDataValue(pkg, 'manifest', label, errors),
    licenseText: ownDataValue(pkg, 'licenseText', label, errors, false),
  }
}

export function validateReleaseManifests(options) {
  if (!isPlainObject(options)) {
    throw new Error(
      'Release metadata check failed:\n- validation options must be a plain object'
    )
  }

  const optionErrors = []
  const publicPackages = ownDataValue(
    options,
    'publicPackages',
    'validation options',
    optionErrors
  )
  const privatePackages = ownDataValue(
    options,
    'privatePackages',
    'validation options',
    optionErrors
  )
  const tag = ownDataValue(
    options,
    'tag',
    'validation options',
    optionErrors,
    false
  )
  if (!Array.isArray(publicPackages)) {
    optionErrors.push('publicPackages must be an array')
  }
  if (!Array.isArray(privatePackages)) {
    optionErrors.push('privatePackages must be an array')
  }
  if (optionErrors.length > 0) {
    throw new Error(
      `Release metadata check failed:\n- ${optionErrors.join('\n- ')}`
    )
  }

  const errors = []
  const versions = new Set()
  const seenPublic = new Set()
  const seenWorkspaces = new Set()

  for (const input of publicPackages) {
    const pkg = readPackageRecord(input, 'public package', errors)
    if (pkg === undefined) continue
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
    const manifestIsSafe = validateCanonicalMetadata(pkg, config, errors)
    if (manifestIsSafe) versions.add(manifest.version)
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

  for (const input of privatePackages) {
    const pkg = readPackageRecord(input, 'private package', errors)
    if (pkg === undefined) continue
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
    if (!validateJsonValue(manifest, `${manifestPath} manifest`, errors)) {
      continue
    }
    if (manifest.private !== true) {
      errors.push(`${manifestPath} must be private`)
    }
    if (Object.hasOwn(manifest, 'version')) {
      errors.push(`${manifestPath} private package must not declare a version`)
    }
  }

  if (tag !== undefined) {
    if (
      typeof tag !== 'string' ||
      !new RegExp(`^v${RELEASE_VERSION_PATTERN.source.slice(1, -1)}$`).test(tag)
    ) {
      const tagDescription =
        typeof tag === 'string'
          ? tag
          : tag === null
            ? '<null>'
            : `<${typeof tag}>`
      errors.push(`release tag ${tagDescription} must use vMAJOR.MINOR.PATCH`)
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

export function validateWorkspaceRootManifest(manifest) {
  const errors = []
  if (!isPlainObject(manifest)) {
    throw new Error('Workspace root manifest must be a plain object')
  }
  if (!validateJsonValue(manifest, 'Workspace root manifest', errors)) {
    throw new Error(
      `Workspace root manifest check failed:\n- ${errors.join('\n- ')}`
    )
  }
  if (manifest.name !== 'primitree-workspace') {
    errors.push('Workspace root must be named primitree-workspace')
  }
  if (manifest.private !== true) {
    errors.push('Workspace root must be private')
  }
  if (Object.hasOwn(manifest, 'version')) {
    errors.push('Workspace root must not declare a version')
  }
  if (errors.length > 0) {
    throw new Error(
      `Workspace root manifest check failed:\n- ${errors.join('\n- ')}`
    )
  }
}

function rootPathFrom(root) {
  return root instanceof URL ? fileURLToPath(root) : resolve(root)
}

function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  )
}

export function validateReleaseCopy({
  version,
  tag,
  releaseNotes,
  changelogs,
}) {
  if (tag === undefined) {
    return
  }

  const errors = []
  const status =
    typeof releaseNotes === 'string'
      ? releaseNotes.match(/^Status: Released (\d{4}-\d{2}-\d{2})\.$/mu)
      : null
  const releaseDate = status?.[1]

  if (!releaseDate || !isCalendarDate(releaseDate)) {
    errors.push(
      'release notes must contain `Status: Released YYYY-MM-DD.` with a valid UTC date'
    )
  }
  if (
    typeof releaseNotes === 'string' &&
    /\bUnreleased\b/iu.test(releaseNotes)
  ) {
    errors.push('release notes must not contain Unreleased for a tag')
  }

  if (!Array.isArray(changelogs)) {
    errors.push('changelogs must be an array')
  } else {
    const byPath = new Map(
      changelogs
        .filter(
          changelog =>
            isPlainObject(changelog) &&
            typeof changelog.path === 'string' &&
            typeof changelog.content === 'string'
        )
        .map(changelog => [changelog.path, changelog.content])
    )

    for (const config of PUBLIC_RELEASE_PACKAGES) {
      const changelogPath = `${config.path}/CHANGELOG.md`
      const content = byPath.get(changelogPath)
      if (content === undefined) {
        errors.push(`${changelogPath} is required`)
        continue
      }
      if (/\bUnreleased\b/iu.test(content)) {
        errors.push(`${changelogPath} must not contain Unreleased for a tag`)
      }
      if (releaseDate && !content.includes(`## ${version} (${releaseDate})`)) {
        errors.push(
          `${changelogPath} ${version} heading must use release date ${releaseDate}`
        )
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Release copy check failed:\n- ${errors.join('\n- ')}`)
  }
}

export function discoverWorkspaceManifestPaths(root) {
  const rootPath = rootPathFrom(root)
  const paths = []

  for (const group of ['packages', 'apps']) {
    const groupPath = join(rootPath, group)
    const groupStatus = lstatSync(groupPath)
    if (groupStatus.isSymbolicLink() || !groupStatus.isDirectory()) {
      throw new Error(
        `${group} must not be a symbolic link and must be a directory`
      )
    }
    for (const entry of readdirSync(groupPath, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name)
    )) {
      if (entry.isSymbolicLink()) {
        throw new Error(`${group}/${entry.name} must not be a symbolic link`)
      }
      if (!entry.isDirectory()) continue
      const manifestPath = `${group}/${entry.name}/package.json`
      const manifestFilePath = join(groupPath, entry.name, 'package.json')
      let status
      try {
        status = lstatSync(manifestFilePath)
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
  const rootPath = rootPathFrom(rootUrl)
  const manifestFilePath = join(rootPath, ...manifestPath.split('/'))
  const licensePath = join(dirname(manifestFilePath), 'LICENSE')
  let licenseText
  if (existsSync(licensePath)) {
    const status = lstatSync(licensePath)
    if (status.isSymbolicLink() || !status.isFile()) {
      throw new Error(
        `${manifestPath.replace(/package\.json$/, 'LICENSE')} must be a regular file`
      )
    }
    licenseText = readFileSync(licensePath, 'utf8')
  }

  return {
    path: manifestPath.replace(/\/package\.json$/, ''),
    manifestPath,
    manifest: JSON.parse(readFileSync(manifestFilePath, 'utf8')),
    licenseText,
  }
}

export function checkRepository() {
  const rootUrl = new URL('../', import.meta.url)
  validateWorkspaceRootManifest(
    JSON.parse(readFileSync(new URL('package.json', rootUrl), 'utf8'))
  )
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
  if (tag !== undefined) {
    const rootPath = rootPathFrom(rootUrl)
    validateReleaseCopy({
      version: result.version,
      tag,
      releaseNotes: readFileSync(
        join(rootPath, 'docs', 'launch', `v${result.version}.md`),
        'utf8'
      ),
      changelogs: PUBLIC_RELEASE_PACKAGES.map(config => {
        const changelogPath = `${config.path}/CHANGELOG.md`
        return {
          path: changelogPath,
          content: readFileSync(join(rootPath, changelogPath), 'utf8'),
        }
      }),
    })
  }
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
