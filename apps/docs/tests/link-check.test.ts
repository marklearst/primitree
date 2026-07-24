import assert from 'node:assert/strict'
import test from 'node:test'

import { docsPathToUrl } from '../scripts/check-links.mjs'

test('docs paths map to their public routes', () => {
  assert.equal(docsPathToUrl('content/docs/index.mdx'), '/docs/')
  assert.equal(
    docsPathToUrl('content/docs/getting-started/index.mdx'),
    '/docs/getting-started/'
  )
  assert.equal(docsPathToUrl('content/docs/api/core.mdx'), '/docs/api/core')
  assert.equal(docsPathToUrl('content/docs/api/core'), '/docs/api/core')
  assert.throws(
    () => docsPathToUrl('../README.md'),
    /Cannot map documentation path/u
  )
})
