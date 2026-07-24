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

  assert.deepEqual(config, {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    github: {
      autoAlias: false,
    },
  })
})
