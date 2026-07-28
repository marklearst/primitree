import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

test('Git previews do not claim the production alias', async () => {
  const config = JSON.parse(
    await readFile(join(docsRoot, 'vercel.json'), 'utf8')
  )

  assert.equal(config.github?.autoAlias, false)
})

test('Git previews build the Primitree docs workspace', async () => {
  const config = JSON.parse(
    await readFile(join(docsRoot, 'vercel.json'), 'utf8')
  )

  assert.equal(
    config.buildCommand,
    'cd ../.. && pnpm turbo run build --filter=primitree-docs'
  )
})

test('the source contract names the docs workspace and public site', async () => {
  const manifest = JSON.parse(
    await readFile(join(docsRoot, 'package.json'), 'utf8')
  )
  const discovery = await readFile(
    join(docsRoot, 'lib', 'discovery.ts'),
    'utf8'
  )

  assert.equal(manifest.name, 'primitree-docs')
  assert.match(discovery, /https:\/\/primitree\.com/)
})
