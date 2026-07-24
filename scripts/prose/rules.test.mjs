import assert from 'node:assert/strict'
import test from 'node:test'

import { scanText } from './rules.mjs'

function ruleIds(source) {
  return scanText('guide.md', source).map(violation => violation.ruleId)
}

test('flags sentence-leading Wh words', () => {
  assert.deepEqual(ruleIds('When the build passes, publish the package.'), [
    'wh-sentence-opener',
  ])
  assert.deepEqual(
    ruleIds('The build passed. How npm records the package appears here.'),
    ['wh-sentence-opener']
  )
})

test('flags ly adverbs without matching word endings that are not adverbs', () => {
  assert.deepEqual(
    ruleIds('Only the publish job runs. The job publishes automatically.'),
    ['ly-adverb', 'ly-adverb']
  )
  assert.deepEqual(
    ruleIds('Apply the font family from the token document.'),
    []
  )
})

test('flags passive constructions and passive error fragments', () => {
  assert.deepEqual(
    ruleIds(
      'The token is revoked after publication. Error thrown when the input fails validation.'
    ),
    ['passive-voice', 'passive-fragment']
  )
  assert.deepEqual(
    ruleIds('The maintainer revokes the token after publication.'),
    []
  )
})
