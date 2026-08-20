import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createGovernanceDemo,
  createProposalDeck,
} from '../lib/landing/governance-demo.ts'

test('governance demo derives truthful graph and policy evidence', () => {
  const demo = createGovernanceDemo()
  assert.equal(demo.tokenPath, 'semantic.color.bg.brand')
  assert.equal(demo.aliasTarget, 'primitives.color.blue.500')
  assert.equal(demo.resolvedValue, '#3366ff')
  assert.equal(demo.owner, 'product-design')
  assert.deepEqual(
    demo.directDependents.map(dependent => dependent.path),
    ['component.button.bg', 'component.focus.ring', 'component.nav.active.bg']
  )
  assert.deepEqual(demo.compliant, { status: 'PASS', findings: 0 })
  assert.deepEqual(demo.blocked, {
    status: 'BLOCK',
    ruleId: 'PT1004',
    reason: 'Layer semantic cannot reference layer component.',
  })
  assert.deepEqual(demo.outputs, ['CSS', 'Tailwind', 'TypeScript'])
})

test('governance demo derives output labels from the DTCG build result', () => {
  const tailwindOnly = createGovernanceDemo({
    css: false,
    tailwind: true,
    typescript: false,
  })

  assert.deepEqual(tailwindOnly.outputs, ['Tailwind'])
})

test('proposal deck derives every outcome from the engine', () => {
  const deck = createProposalDeck()

  assert.deepEqual(
    deck.outcomes.map(outcome => outcome.id),
    ['baseline', 'alias', 'violation', 'rename']
  )

  const [baseline, alias, violation, rename] = deck.outcomes
  assert.equal(baseline?.verdict, 'PASS · 0 findings')
  assert.equal(baseline?.resolvedValue, '#3366ff')
  assert.match(
    baseline?.emitted?.css ?? '',
    /--semantic-color-bg-brand: var\(--primitives-color-blue-500\);/u
  )

  assert.equal(alias?.verdict, 'PASS · 0 findings')
  assert.equal(alias?.resolvedValue, '#5f7f2f')
  assert.match(
    alias?.emitted?.css ?? '',
    /--semantic-color-bg-brand: var\(--primitives-color-green-500\);/u
  )
  assert.match(alias?.emitted?.ts ?? '', /color\(srgb 0\.372549/u)

  assert.equal(violation?.verdict, 'BLOCK · PT1004')
  assert.equal(
    violation?.detail,
    'Layer semantic cannot reference layer component.'
  )
  assert.equal(violation?.emitted, null)
  assert.equal(violation?.resolvedValue, null)

  assert.equal(rename?.tokenPath, 'semantic.color.bg.primary')
  assert.equal(rename?.verdict, '5 changes · 3 tokens affected')
  assert.equal(
    deck.diffReport.includes('removed semantic.color.bg.brand'),
    true
  )
  assert.equal(
    deck.diffReport.includes(
      '  Affected tokens: component.button.bg, component.focus.ring, component.nav.active.bg'
    ),
    true
  )
})
