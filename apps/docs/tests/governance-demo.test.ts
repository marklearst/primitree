import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createGovernanceDemo,
  createProposalDeck,
  describeLayersSnippet,
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
    reason: 'Layer component cannot reference layer primitives.',
    findingCount: 3,
  })
  assert.deepEqual(demo.outputs, ['CSS', 'Tailwind', 'TypeScript'])
  assert.equal(demo.tokenCount, 15)
  assert.equal(demo.layerCount, 3)
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
  assert.equal(baseline?.status, 'PASS')
  assert.equal(baseline?.findingsLine, '0 findings')
  const baselineBrand = baseline?.nodes.find(
    node => node.slot === 'semantic.color.bg.brand'
  )
  assert.equal(baselineBrand?.label, 'color.bg.brand')
  assert.equal(baselineBrand?.display, '→ {blue.500}')
  assert.equal(baselineBrand?.consumers, 3)
  assert.equal(baselineBrand?.owner, 'product-design')
  const baselineBlue = baseline?.nodes.find(
    node => node.slot === 'primitives.color.blue.500'
  )
  assert.equal(baselineBlue?.label, 'blue.500')
  assert.equal(baselineBlue?.swatch, '#3366ff')
  const baselineButton = baseline?.nodes.find(
    node => node.slot === 'component.button.bg'
  )
  assert.equal(baselineButton?.display, '→ {bg.brand}')

  assert.equal(alias?.status, 'PASS')
  const aliasBrand = alias?.nodes.find(
    node => node.slot === 'semantic.color.bg.brand'
  )
  assert.equal(aliasBrand?.display, '→ {green.500}')
  const aliasGreen = alias?.nodes.find(
    node => node.slot === 'primitives.color.green.500'
  )
  assert.equal(aliasGreen?.swatch, '#34d399')

  assert.equal(violation?.status, 'FAIL')
  assert.equal(violation?.findingsLine, '3 findings · layer-skip')
  assert.equal(violation?.edges.filter(edge => edge.violation).length, 3)
  const violationBrand = violation?.nodes.find(
    node => node.slot === 'semantic.color.bg.brand'
  )
  assert.equal(violationBrand?.consumers, 3)
  assert.deepEqual(
    violation?.nodes
      .filter(node => node.finding !== null)
      .map(node => node.path)
      .sort(),
    ['component.button.bg', 'component.card.inset', 'component.focus.ring']
  )
  assert.deepEqual(
    violation?.edges
      .filter(edge => edge.violation)
      .map(edge => `${edge.from}>${edge.to}`)
      .sort(),
    [
      'primitives.color.blue.500>component.button.bg',
      'primitives.color.green.500>component.focus.ring',
      'primitives.space.4>component.card.inset',
    ]
  )

  assert.equal(rename?.status, 'PASS')
  assert.equal(rename?.findingsLine, '5 changes · 0 findings')
  const renamed = rename?.nodes.find(
    node => node.slot === 'semantic.color.bg.brand'
  )
  assert.equal(renamed?.path, 'semantic.color.bg.primary')
  assert.equal(renamed?.change, 'added')
  const renamedButton = rename?.nodes.find(
    node => node.slot === 'component.button.bg'
  )
  assert.equal(renamedButton?.display, '→ {bg.primary}')
  assert.deepEqual(
    rename?.nodes
      .filter(node => node.change === 'changed')
      .map(node => node.path)
      .sort(),
    ['component.button.bg', 'component.focus.ring', 'component.nav.active.bg']
  )

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
  assert.equal(
    deck.diffReport.includes('New findings: 0 · Resolved findings: 0'),
    true
  )
  assert.deepEqual(deck.renameImpact, {
    removedPath: 'semantic.color.bg.brand',
    addedPath: 'semantic.color.bg.primary',
    consumers: ['button.bg', 'focus.ring', 'nav.active.bg'],
  })
})

test('graph projections keep every slot stable across proposals', () => {
  const deck = createProposalDeck()
  const [baseline] = deck.outcomes
  const slots = baseline?.nodes.map(node => node.slot).sort() ?? []
  assert.equal(slots.length, 15)

  for (const outcome of deck.outcomes) {
    assert.deepEqual(outcome.nodes.map(node => node.slot).sort(), slots)
    const known = new Set(slots)
    for (const edge of outcome.edges) {
      assert.equal(known.has(edge.from), true)
      assert.equal(known.has(edge.to), true)
    }
    assert.equal(outcome.edges.length, outcome.id === 'violation' ? 12 : 9)
  }
})

test('quickstart config excerpt mirrors the policy layers', () => {
  const snippet = describeLayersSnippet()
  assert.match(
    snippet,
    /\{ id: 'primitives', roots: \['primitives'\], values: 'literal' \}/u
  )
  assert.match(
    snippet,
    /\{ id: 'semantic', roots: \['semantic'\], values: 'reference', references: \['primitives'\] \}/u
  )
  assert.match(
    snippet,
    /\{ id: 'component', roots: \['component'\], values: 'reference', references: \['semantic'\] \}/u
  )
})
