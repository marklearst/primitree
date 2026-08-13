import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGovernanceDemo } from '../lib/landing/governance-demo.ts'

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
