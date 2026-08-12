import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  isPrereleaseVersion,
  releaseChannelForVersion,
} from './release-config.mjs'

const root = new URL('../', import.meta.url)
const packageNames = [
  '@primitree/core',
  '@primitree/dtcg',
  '@primitree/cli',
  '@primitree/hooks',
  '@primitree/mcp',
  'primitree',
]

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, root), 'utf8'))
}

function readLaunchChangeset() {
  const source = readFileSync(
    new URL('.changeset/primitree-one.md', root),
    'utf8'
  )
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n/u)?.[1]
  assert.notEqual(frontmatter, undefined)
  return [
    ...frontmatter.matchAll(/^['"]([^'"]+)['"]: (major|minor|patch)$/gmu),
  ].map(match => ({ name: match[1], type: match[2] }))
}

test('coordinates the first next prerelease through Changesets', () => {
  const rootManifest = readJson('package.json')
  const changesets = readJson('.changeset/config.json')
  const prerelease = readJson('.changeset/pre.json')
  const releases = readLaunchChangeset()

  assert.equal(rootManifest.name, 'primitree-workspace')
  assert.deepEqual(changesets.fixed, [packageNames])
  assert.equal(prerelease.mode, 'pre')
  assert.equal(prerelease.tag, 'next')
  assert.deepEqual(prerelease.changesets, ['primitree-one'])
  assert.deepEqual(
    Object.keys(prerelease.initialVersions).sort(),
    [...packageNames].sort()
  )
  assert.ok(
    Object.values(prerelease.initialVersions).every(
      version => version === '0.0.0'
    )
  )
  for (const relativePath of [
    'packages/core/package.json',
    'packages/dtcg/package.json',
    'packages/cli/package.json',
    'packages/hooks/package.json',
    'packages/mcp/package.json',
    'packages/primitree/package.json',
  ]) {
    assert.equal(readJson(relativePath).version, '1.0.0-next.0')
  }
  assert.deepEqual(
    releases,
    packageNames.map(name => ({ name, type: 'major' }))
  )
})

test('maps only stable and next versions to public release channels', () => {
  assert.equal(releaseChannelForVersion('1.0.0'), 'latest')
  assert.equal(releaseChannelForVersion('1.0.0-next.0'), 'next')
  assert.equal(isPrereleaseVersion('1.0.0'), false)
  assert.equal(isPrereleaseVersion('1.0.0-next.0'), true)
  assert.throws(
    () => releaseChannelForVersion('1.0.0-beta.1'),
    /release version/i
  )
  assert.throws(() => releaseChannelForVersion('v1.0.0'), /release version/i)
})
