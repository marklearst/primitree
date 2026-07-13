import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PUBLIC_PACKAGE_NAMES = new Map([
  ['packages/core/package.json', '@figmavars/core'],
  ['packages/dtcg/package.json', '@figmavars/dtcg'],
  ['packages/cli/package.json', '@figmavars/cli'],
  ['packages/hooks/package.json', '@figmavars/hooks'],
  ['packages/mcp/package.json', '@figmavars/mcp'],
])

const RELEASE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const ROOT_LICENSE = readFileSync(
  new URL('../LICENSE', import.meta.url),
  'utf8'
).trimEnd()

export function validateReleaseManifests({
  publicPackages,
  privatePackages,
  tag,
}) {
  const errors = []
  const versions = new Set()

  for (const { path, manifest, licenseText } of publicPackages) {
    const expectedName = PUBLIC_PACKAGE_NAMES.get(path)
    if (manifest.name !== expectedName) {
      errors.push(`${path} must be named ${expectedName}`)
    }
    if (manifest.private === true) {
      errors.push(`${path} must be publishable`)
    }
    if (licenseText?.trimEnd() !== ROOT_LICENSE) {
      errors.push(
        `${path.replace(/package\.json$/, 'LICENSE')} must match the repository LICENSE`
      )
    }
    versions.add(manifest.version)
  }

  const publicPaths = new Set(publicPackages.map(pkg => pkg.path))
  for (const path of PUBLIC_PACKAGE_NAMES.keys()) {
    if (!publicPaths.has(path)) {
      errors.push(`missing public workspace ${path}`)
    }
  }

  if (publicPackages.length !== PUBLIC_PACKAGE_NAMES.size) {
    errors.push(`expected ${PUBLIC_PACKAGE_NAMES.size} public packages`)
  }

  const [version] = versions
  if (versions.size !== 1 || typeof version !== 'string') {
    errors.push('all public packages must use one version')
  } else if (!RELEASE_VERSION_PATTERN.test(version)) {
    errors.push(`package version ${version} must use MAJOR.MINOR.PATCH`)
  }

  for (const { path, manifest } of privatePackages) {
    if (manifest.private !== true) {
      errors.push(`${path} must be private`)
    }
    if (typeof version === 'string' && manifest.version !== version) {
      errors.push(`${path} must use version ${version}`)
    }
  }

  if (tag !== undefined) {
    if (
      !new RegExp(`^v${RELEASE_VERSION_PATTERN.source.slice(1, -1)}$`).test(tag)
    ) {
      errors.push(`release tag ${tag} must use vMAJOR.MINOR.PATCH`)
    } else if (typeof version === 'string' && tag !== `v${version}`) {
      errors.push(`tag ${tag} does not match package version ${version}`)
    }
  }

  if (errors.length > 0) {
    throw new Error(`Release metadata check failed:\n- ${errors.join('\n- ')}`)
  }

  return {
    version,
    publicNames: publicPackages.map(pkg => pkg.manifest.name),
  }
}

function discoverWorkspaceManifestPaths(rootUrl) {
  return ['packages', 'apps'].flatMap(group => {
    const groupUrl = new URL(`${group}/`, rootUrl)

    return readdirSync(groupUrl, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => `${group}/${entry.name}/package.json`)
      .filter(path => existsSync(fileURLToPath(new URL(path, rootUrl))))
  })
}

function readManifest(rootUrl, path) {
  const manifestUrl = new URL(path, rootUrl)
  const licenseUrl = new URL('LICENSE', manifestUrl)

  return {
    path,
    manifest: JSON.parse(readFileSync(manifestUrl, 'utf8')),
    licenseText: existsSync(fileURLToPath(licenseUrl))
      ? readFileSync(licenseUrl, 'utf8')
      : undefined,
  }
}

function checkRepository() {
  const rootUrl = new URL('../', import.meta.url)
  const workspaces = discoverWorkspaceManifestPaths(rootUrl).map(path =>
    readManifest(rootUrl, path)
  )
  const publicPackages = workspaces.filter(pkg =>
    PUBLIC_PACKAGE_NAMES.has(pkg.path)
  )
  const privatePackages = workspaces.filter(
    pkg => !PUBLIC_PACKAGE_NAMES.has(pkg.path)
  )
  const tag =
    process.env.GITHUB_REF_TYPE === 'tag'
      ? process.env.GITHUB_REF_NAME
      : undefined

  const result = validateReleaseManifests({
    publicPackages,
    privatePackages,
    tag,
  })
  console.log(
    `Release metadata valid for ${result.publicNames.length} public packages at ${result.version}`
  )
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  checkRepository()
}
