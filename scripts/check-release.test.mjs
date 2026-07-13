import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { validateReleaseManifests } from './check-release.mjs'

const licenseText = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8')

const publicPackages = [
  ['packages/core/package.json', '@figmavars/core'],
  ['packages/dtcg/package.json', '@figmavars/dtcg'],
  ['packages/cli/package.json', '@figmavars/cli'],
  ['packages/hooks/package.json', '@figmavars/hooks'],
  ['packages/mcp/package.json', '@figmavars/mcp'],
].map(([path, name]) => ({
  path,
  manifest: { name, version: '5.0.0', private: false },
  licenseText,
}))

const privatePackages = [
  ['packages/plugin-export/package.json', '@figmavars/plugin-export'],
  ['apps/docs/package.json', 'figmavars-docs'],
  ['apps/figma-plugin/package.json', 'figmavars-plugin'],
  ['apps/playground/package.json', 'figmavars-playground'],
].map(([path, name]) => ({
  path,
  manifest: { name, version: '5.0.0', private: true },
}))

test('accepts the five public packages and private internal workspaces', () => {
  const result = validateReleaseManifests({
    publicPackages,
    privatePackages,
    tag: 'v5.0.0',
  })

  assert.equal(result.version, '5.0.0')
  assert.deepEqual(
    result.publicNames,
    publicPackages.map(pkg => pkg.manifest.name)
  )
})

test('rejects a tag that does not match the package version', () => {
  assert.throws(
    () =>
      validateReleaseManifests({
        publicPackages,
        privatePackages,
        tag: 'v5.0.1',
      }),
    /tag v5\.0\.1 does not match package version 5\.0\.0/
  )
})

test('rejects an internal workspace that is publishable', () => {
  const publishableInternals = privatePackages.map(pkg => ({
    ...pkg,
    manifest: { ...pkg.manifest },
  }))
  publishableInternals[0].manifest.private = false

  assert.throws(
    () =>
      validateReleaseManifests({
        publicPackages,
        privatePackages: publishableInternals,
        tag: 'v5.0.0',
      }),
    /packages\/plugin-export\/package\.json must be private/
  )
})

test('rejects a malformed package version without a release tag', () => {
  const malformedVersions = publicPackages.map(pkg => ({
    ...pkg,
    manifest: { ...pkg.manifest, version: 'next' },
  }))

  assert.throws(
    () =>
      validateReleaseManifests({
        publicPackages: malformedVersions,
        privatePackages,
      }),
    /package version next must use MAJOR\.MINOR\.PATCH/
  )
})

test('rejects a publishable workspace outside the public allowlist', () => {
  const unexpectedPublicWorkspace = {
    path: 'packages/experimental/package.json',
    manifest: {
      name: '@figmavars/experimental',
      version: '5.0.0',
      private: false,
    },
  }

  assert.throws(
    () =>
      validateReleaseManifests({
        publicPackages,
        privatePackages: [...privatePackages, unexpectedPublicWorkspace],
      }),
    /packages\/experimental\/package\.json must be private/
  )
})

test('rejects a missing expected public workspace', () => {
  assert.throws(
    () =>
      validateReleaseManifests({
        publicPackages: publicPackages.slice(1),
        privatePackages,
      }),
    /missing public workspace packages\/core\/package\.json/
  )
})

test('rejects a public workspace with the wrong package name', () => {
  const wrongName = publicPackages.map(pkg => ({
    ...pkg,
    manifest: { ...pkg.manifest },
  }))
  wrongName[0].manifest.name = '@figmavars/not-core'

  assert.throws(
    () =>
      validateReleaseManifests({
        publicPackages: wrongName,
        privatePackages,
      }),
    /packages\/core\/package\.json must be named @figmavars\/core/
  )
})

test('rejects a public workspace marked private', () => {
  const privatePublicPackage = publicPackages.map(pkg => ({
    ...pkg,
    manifest: { ...pkg.manifest },
  }))
  privatePublicPackage[0].manifest.private = true

  assert.throws(
    () =>
      validateReleaseManifests({
        publicPackages: privatePublicPackage,
        privatePackages,
      }),
    /packages\/core\/package\.json must be publishable/
  )
})

test('rejects divergent workspace versions', () => {
  const divergentVersions = publicPackages.map(pkg => ({
    ...pkg,
    manifest: { ...pkg.manifest },
  }))
  divergentVersions[0].manifest.version = '5.0.1'

  assert.throws(
    () =>
      validateReleaseManifests({
        publicPackages: divergentVersions,
        privatePackages,
      }),
    /all public packages must use one version/
  )
})

test('rejects a malformed release tag', () => {
  assert.throws(
    () =>
      validateReleaseManifests({
        publicPackages,
        privatePackages,
        tag: 'release-5.0.0',
      }),
    /release tag release-5\.0\.0 must use vMAJOR\.MINOR\.PATCH/
  )
})

test('rejects a public package without the repository license', () => {
  const missingLicense = publicPackages.map(pkg => ({
    ...pkg,
    manifest: { ...pkg.manifest },
  }))
  missingLicense[0].licenseText = undefined

  assert.throws(
    () =>
      validateReleaseManifests({
        publicPackages: missingLicense,
        privatePackages,
      }),
    /packages\/core\/LICENSE must match the repository LICENSE/
  )
})
