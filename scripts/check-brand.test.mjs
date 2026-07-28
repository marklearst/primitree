import assert from 'node:assert/strict'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { findBrandViolations, readBrandRecords } from './brand-rules.mjs'

const legacy = (...parts) => parts.join('')

test('rejects legacy product names in public surfaces', () => {
  const records = [
    {
      path: `packages/cli/bin/${legacy('figma', '-vars')}`,
      content: null,
    },
    {
      path: 'packages/hooks/src/provider.tsx',
      content: `export function ${legacy('Figma', 'Vars')}Provider() {}`,
    },
    {
      path: 'packages/dtcg/src/extensions.ts',
      content: `export const extension = 'com.${legacy('figma', '-vars')}'`,
    },
    {
      path: 'packages/dtcg/generated',
      content: `export const file = '${legacy('figma', '-vars')}.d.ts'`,
    },
    {
      path: 'apps/figma-plugin/manifest.json',
      content: `"id": "${legacy('figma', '-vars')}-export"`,
    },
    {
      path: `assets/${legacy('figmav', 'ars')}-icon.png`,
      content: null,
    },
    {
      path: 'packages/mcp/src/config.ts',
      content: `const token = process.env.${legacy('FIGMA', '_VARS')}_TOKENS`,
    },
    {
      path: 'apps/docs/app.css',
      content: `:root { ${legacy('--color-', 'fv-surface')}: white; }`,
    },
    {
      path: 'apps/docs/page.tsx',
      content: `<main className="${legacy('bg-', 'fv-surface')}" />`,
    },
  ]

  assert.deepEqual(findBrandViolations(records), [
    {
      path: `packages/cli/bin/${legacy('figma', '-vars')}`,
      line: null,
      match: legacy('figma', '-vars'),
    },
    {
      path: 'packages/hooks/src/provider.tsx',
      line: 1,
      match: legacy('Figma', 'Vars'),
    },
    {
      path: 'packages/dtcg/src/extensions.ts',
      line: 1,
      match: legacy('figma', '-vars'),
    },
    {
      path: 'packages/dtcg/generated',
      line: 1,
      match: legacy('figma', '-vars'),
    },
    {
      path: 'apps/figma-plugin/manifest.json',
      line: 1,
      match: legacy('figma', '-vars'),
    },
    {
      path: `assets/${legacy('figmav', 'ars')}-icon.png`,
      line: null,
      match: legacy('figmav', 'ars'),
    },
    {
      path: 'packages/mcp/src/config.ts',
      line: 1,
      match: legacy('FIGMA', '_VARS'),
    },
    {
      path: 'apps/docs/app.css',
      line: 1,
      match: legacy('--color-', 'fv-surface'),
    },
    {
      path: 'apps/docs/page.tsx',
      line: 1,
      match: legacy('bg-', 'fv-surface'),
    },
  ])
})

test('keeps Figma platform terminology', () => {
  const records = [
    {
      path: 'apps/figma-plugin/src/code.ts',
      content:
        'const variable: FigmaVariable = await getVariable(FIGMA_TOKEN)\n// Figma Variables API',
    },
  ]

  assert.deepEqual(findBrandViolations(records), [])
})

test('does not flag its own rule syntax', () => {
  const content = readFileSync(
    new URL('./brand-rules.mjs', import.meta.url),
    'utf8'
  )

  assert.deepEqual(
    findBrandViolations([{ path: 'scripts/brand-rules.mjs', content }]),
    []
  )
})

test('skips execution scratch without exempting normal source files', t => {
  const root = mkdtempSync(join(tmpdir(), 'primitree-brand-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  mkdirSync(join(root, '.superpowers'), { recursive: true })
  mkdirSync(join(root, 'packages', 'core', 'src'), { recursive: true })
  writeFileSync(
    join(root, '.superpowers', 'review.txt'),
    legacy('figma', '-vars')
  )
  writeFileSync(
    join(root, 'packages', 'core', 'src', 'legacy.ts'),
    legacy('figma', '-vars')
  )

  assert.deepEqual(findBrandViolations(readBrandRecords(root)), [
    {
      path: 'packages/core/src/legacy.ts',
      line: 1,
      match: legacy('figma', '-vars'),
    },
  ])
})

test('permits only migration references in approved files', () => {
  const hooksScope = legacy('@figma', '-vars', '/hooks')
  const formerScope = legacy('@figma', '-vars', '/')
  const alternateFormerScope = legacy('@figma', 'vars', '/')
  const records = [
    {
      path: 'apps/docs/content/docs/hooks/migration.mdx',
      content: `Replace ${hooksScope} with @primitree/hooks.`,
    },
    {
      path: 'docs/releasing.md',
      content: `npm deprecate \"${hooksScope}@4.0.0\" \"Moved to @primitree/hooks.\"`,
    },
    {
      path: 'docs/launch/v1.0.0.md',
      content: `The React package moved from ${hooksScope} to @primitree/hooks.`,
    },
    {
      path: 'docs/plans/2026-07-28-primitree-clean-break-implementation.md',
      content: `Keep ${hooksScope}@4.0.0 in migration instructions.`,
    },
    {
      path: 'packages/hooks/CHANGELOG.md',
      content: `### Migration from ${hooksScope} 4.0.0`,
    },
    {
      path: 'packages/hooks/README.md',
      content: `Replace ${hooksScope} with @primitree/hooks in imports.`,
    },
    {
      path: 'scripts/check-release.mjs',
      content: `const FORMER_PACKAGE_SCOPES = ['${formerScope}', '${alternateFormerScope}']`,
    },
    {
      path: 'scripts/check-release.test.mjs',
      content: `for (const scope of ['${formerScope}', '${alternateFormerScope}']) {}`,
    },
    {
      path: 'scripts/check-brand.test.mjs',
      content: `const replacement = '${hooksScope}'`,
    },
  ]

  assert.deepEqual(findBrandViolations(records), [])
})

test('rejects product copy and runtime identifiers in approved files', () => {
  const records = [
    {
      path: 'docs/releasing.md',
      content: `Release notes for ${legacy('Figma', 'Vars')}.`,
    },
    {
      path: 'packages/hooks/README.md',
      content: `Run ${legacy('figma', '-vars')} export variables.json.`,
    },
    {
      path: 'scripts/check-release.mjs',
      content: `const publicBin = '${legacy('figma', '-vars')}'`,
    },
  ]

  assert.deepEqual(findBrandViolations(records), [
    {
      path: 'docs/releasing.md',
      line: 1,
      match: legacy('Figma', 'Vars'),
    },
    {
      path: 'packages/hooks/README.md',
      line: 1,
      match: legacy('figma', '-vars'),
    },
    {
      path: 'scripts/check-release.mjs',
      line: 1,
      match: legacy('figma', '-vars'),
    },
  ])
})
