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
  const violations = scanText(
    'guide.md',
    'The build passed.\n\nHow npm records the package appears here.'
  )
  assert.deepEqual(ruleIds('The build passed. How npm records it appears.'), [
    'wh-sentence-opener',
  ])
  assert.equal(violations[0].match, 'How')
  assert.equal(violations[0].line, 3)
  assert.equal(violations[0].column, 1)
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

  const fragment = scanText(
    'guide.md',
    'The request failed.\n\nError returned when the token is absent.'
  )
  assert.equal(fragment[0].match, 'Error returned')
  assert.equal(fragment[0].line, 3)
  assert.equal(fragment[0].column, 1)
})

test('flags permission phrasing and vague assurances', () => {
  assert.deepEqual(ruleIds('You can commit the generated files.'), [
    'reader-permission',
  ])
  assert.deepEqual(ruleIds('The detached worktree ensures a clean release.'), [
    'assurance-verb',
  ])
})

test('flags stock product claims and purpose phrases', () => {
  assert.deepEqual(ruleIds('A scalable and intuitive token workflow.'), [
    'vague-product-claim',
    'vague-product-claim',
  ])
  assert.deepEqual(ruleIds('An end-to-end release path.'), ['stock-claim'])
  assert.deepEqual(ruleIds('Built to make releases easy.'), [
    'purpose-preface',
    'vague-product-claim',
  ])
})

test('flags conditional openers and broad binary contrasts at the phrase', () => {
  const conditional = scanText(
    'guide.md',
    'Run the build.\n\nIf the build fails, stop the release.'
  )
  assert.deepEqual(
    conditional.map(violation => violation.ruleId),
    ['conditional-opener']
  )
  assert.deepEqual(conditional[0], {
    file: 'guide.md',
    ruleId: 'conditional-opener',
    message: 'Lead with the condition or required action directly.',
    match: 'If',
    line: 3,
    column: 1,
  })

  const codeComment = scanText('guide.md', '# If the build fails, stop.')
  assert.deepEqual(
    codeComment.map(violation => violation.ruleId),
    ['conditional-opener']
  )
  assert.equal(codeComment[0].match, 'If')
  assert.equal(codeComment[0].column, 3)

  assert.deepEqual(
    ruleIds('The package is not a wrapper, but a token parser.'),
    ['binary-contrast']
  )
  assert.deepEqual(
    ruleIds(
      'Do not publish the package. Run the tests, but leave the tag untouched.'
    ),
    []
  )
})

test('flags exact filler phrases and formulaic sequencing', () => {
  assert.deepEqual(
    ruleIds(
      'At the end of the day, the reality is clear. Dressed up as progress. I promise it creeps in.'
    ),
    [
      'filler-introduction',
      'filler-introduction',
      'meta-commentary',
      'performative-emphasis',
      'performative-emphasis',
    ]
  )

  assert.deepEqual(
    ruleIds(
      'The package also supports Node 24 now and still accepts this input.'
    ),
    []
  )

  const sequence = scanText(
    'guide.md',
    'Run the checks.\n\nThen publish the package.'
  )
  assert.deepEqual(
    sequence.map(violation => violation.ruleId),
    ['sequence-adverb']
  )
  assert.equal(sequence[0].match, 'Then')
  assert.equal(sequence[0].line, 3)
  assert.equal(sequence[0].column, 1)
})

test('allows exact mappings and flags reduced passive clauses once', () => {
  assert.deepEqual(
    ruleIds(
      'Figma modes become Resolver contexts, and CI produces five tarballs.'
    ),
    []
  )
  assert.deepEqual(ruleIds('Use the ID assigned by Figma.'), [
    'reduced-passive',
  ])
  assert.deepEqual(ruleIds('Use the shape accepted by the build.'), [
    'reduced-passive',
  ])
  assert.deepEqual(ruleIds('Functions exported by the package.'), [
    'reduced-passive',
  ])
  assert.deepEqual(ruleIds('Use the shape expected by the CLI.'), [
    'reduced-passive',
  ])
  assert.deepEqual(ruleIds('Use the runtime floor enforced by the manifest.'), [
    'reduced-passive',
  ])
  assert.deepEqual(ruleIds('Artifacts are exported by CI.'), ['passive-voice'])
  assert.deepEqual(
    ruleIds(
      'Path allocation runs after canonicalization, canonicalizations, and canonicalisation.'
    ),
    ['canonical', 'canonical', 'canonical']
  )
})

test('flags abstract recovery claims and positional references', () => {
  assert.deepEqual(ruleIds('Use the known-good non-destructive path.'), [
    'stock-claim',
    'stock-claim',
  ])
  assert.deepEqual(ruleIds('Run the commands shown above.'), [
    'positional-reference',
  ])
})
