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
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import * as brandRules from './brand-rules.mjs'

const legacy = (...parts) => parts.join('')
const { findBrandViolations, readBrandRecords } = brandRules

function getLichenValidator() {
  assert.equal(
    typeof brandRules.findLichenColorViolations,
    'function',
    'brand rules must expose the scoped Lichen color validator'
  )
  return brandRules.findLichenColorViolations
}

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

  mkdirSync(join(root, '.review-state'), { recursive: true })
  mkdirSync(join(root, 'packages', 'core', 'src'), { recursive: true })
  writeFileSync(
    join(root, '.review-state', 'review.txt'),
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

test('skips Playwright output without exempting normal source files', t => {
  const root = mkdtempSync(join(tmpdir(), 'primitree-brand-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  mkdirSync(join(root, 'test-results', 'trace', 'resources'), {
    recursive: true,
  })
  mkdirSync(join(root, 'playwright-report', 'data'), { recursive: true })
  mkdirSync(join(root, 'packages', 'core', 'src'), { recursive: true })
  writeFileSync(
    join(root, 'test-results', 'trace', 'resources', 'snapshot.html'),
    legacy('@figma', '-vars', '/hooks')
  )
  writeFileSync(
    join(root, 'playwright-report', 'data', 'snapshot.html'),
    legacy('@figma', '-vars', '/hooks')
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

test('rejects former brand colors only in the approved UI targets', () => {
  const findLichenColorViolations = getLichenValidator()
  const formerAccent = legacy('#8b', '9cff')
  const formerSuccess = legacy('rgba(52, 211, 153', ', 0.1)')
  const records = [
    {
      path: 'apps/docs/components/playground/playground.css',
      content: [
        `.pg-title { color: ${formerAccent}; }`,
        `.pg-type-chip { background: ${formerSuccess}; }`,
      ].join('\n'),
    },
    {
      path: 'apps/docs/lib/playground/sample-variables.json',
      content: `{"accent": "${formerAccent}", "success": "${formerSuccess}"}`,
    },
  ]

  assert.deepEqual(findLichenColorViolations(records), [
    {
      path: 'apps/docs/components/playground/playground.css',
      line: 1,
      match: formerAccent,
    },
    {
      path: 'apps/docs/components/playground/playground.css',
      line: 2,
      match: formerSuccess,
    },
  ])
})

test('rejects former brand colors in new UI source files', () => {
  const findLichenColorViolations = getLichenValidator()
  const formerAccent = legacy('#8b', '9cff')

  assert.deepEqual(
    findLichenColorViolations([
      {
        path: 'apps/docs/components/landing/new-panel.tsx',
        content: `<section style={{ color: '${formerAccent}' }} />`,
      },
    ]),
    [
      {
        path: 'apps/docs/components/landing/new-panel.tsx',
        line: 1,
        match: formerAccent,
      },
    ]
  )
})

test('rejects former brand colors in production layout files', () => {
  const findLichenColorViolations = getLichenValidator()
  const formerAccent = legacy('#8b', '9cff')
  const records = [
    {
      path: 'apps/docs/lib/layout.shared.tsx',
      content: `export const color = '${formerAccent}'`,
    },
    {
      path: 'apps/playground/index.html',
      content: `<meta name="theme-color" content="${formerAccent}">`,
    },
  ]

  assert.deepEqual(findLichenColorViolations(records), [
    {
      path: 'apps/docs/lib/layout.shared.tsx',
      line: 1,
      match: formerAccent,
    },
    {
      path: 'apps/playground/index.html',
      line: 1,
      match: formerAccent,
    },
  ])
})

test('rejects former brand colors with a hex alpha channel', () => {
  const findLichenColorViolations = getLichenValidator()
  const formerAccent = legacy('#8b', '9cff40')

  assert.deepEqual(
    findLichenColorViolations([
      {
        path: 'apps/docs/components/landing/new-panel.tsx',
        content: `<section style={{ color: '${formerAccent}' }} />`,
      },
    ]),
    [
      {
        path: 'apps/docs/components/landing/new-panel.tsx',
        line: 1,
        match: formerAccent,
      },
    ]
  )
})

test('rejects a former brand color in a public badge URL', () => {
  const findLichenColorViolations = getLichenValidator()
  const formerAccent = legacy('7b', '8cff')

  assert.deepEqual(
    findLichenColorViolations([
      {
        path: 'README.md',
        content: `[![DTCG](https://img.shields.io/badge/DTCG-2025.10-${formerAccent})](https://www.designtokens.org)`,
      },
    ]),
    [
      {
        path: 'README.md',
        line: 1,
        match: `badge color: ${formerAccent}`,
      },
    ]
  )
})

test('rejects a changed approved palette role', () => {
  const findLichenColorViolations = getLichenValidator()
  const records = [
    {
      path: 'apps/docs/app/global.css',
      content: [
        '@theme {',
        '  --color-primitree-bg: #030304;',
        '  --color-primitree-surface: #08080a;',
        '  --color-primitree-raised: #0f0f12;',
        '  --color-primitree-elevated: #16161a;',
        '  --color-primitree-text: #fafafa;',
        '  --color-primitree-accent: #111111;',
        '  --color-primitree-accent-strong: #5f7f2f;',
        '  --color-primitree-good: #45c98b;',
        '  --color-primitree-warn: #f2b84b;',
        '  --color-primitree-error: #f27575;',
        '}',
        '',
        '::selection {',
        '  background: rgb(168 201 95 / 25%);',
        '}',
      ].join('\n'),
    },
  ]

  assert.deepEqual(
    findLichenColorViolations(records).filter(violation =>
      violation.match.startsWith('--color-primitree-accent:')
    ),
    [
      {
        path: 'apps/docs/app/global.css',
        line: 7,
        match: '--color-primitree-accent: expected #a8c95f, found #111111',
      },
    ]
  )
})

test('ignores CSS declarations in comments and rejects active overrides', () => {
  const findLichenColorViolations = getLichenValidator()
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
  const globalCss = readFileSync(
    join(repositoryRoot, 'apps/docs/app/global.css'),
    'utf8'
  )
    .replace(
      '--color-primitree-accent: #a8c95f;',
      '--color-primitree-accent: #111111;'
    )
    .concat('\n/* --color-primitree-accent: #a8c95f; */\n')

  assert.deepEqual(
    findLichenColorViolations([
      { path: 'apps/docs/app/global.css', content: globalCss },
    ]).filter(violation =>
      violation.match.startsWith('--color-primitree-accent:')
    ),
    [
      {
        path: 'apps/docs/app/global.css',
        line: 15,
        match: '--color-primitree-accent: expected #a8c95f, found #111111',
      },
    ]
  )
})

test('rejects a later text selection override', () => {
  const findLichenColorViolations = getLichenValidator()
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
  const globalCss = readFileSync(
    join(repositoryRoot, 'apps/docs/app/global.css'),
    'utf8'
  ).concat('\n::selection { background: #111111; }\n')

  assert.equal(
    findLichenColorViolations([
      { path: 'apps/docs/app/global.css', content: globalCss },
    ]).some(violation => violation.match.startsWith('text selection:')),
    true
  )
})

test('rejects final CSS declarations without semicolons', () => {
  const findLichenColorViolations = getLichenValidator()
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
  const globalCss = readFileSync(
    join(repositoryRoot, 'apps/docs/app/global.css'),
    'utf8'
  ).concat(
    [
      ':root { --color-primitree-accent: #111111 }',
      '::selection { background: #111111 }',
      '.canopy-root-node { fill: #ff0000 }',
    ].join('\n')
  )
  const violations = findLichenColorViolations([
    { path: 'apps/docs/app/global.css', content: globalCss },
  ])

  assert.equal(
    violations.some(violation =>
      violation.match.startsWith('--color-primitree-accent:')
    ),
    true
  )
  assert.equal(
    violations.some(violation => violation.match.startsWith('text selection:')),
    true
  )
  assert.equal(
    violations.some(
      violation => violation.match === 'living canopy: missing Lichen root node'
    ),
    true
  )
})

test('rejects retired glow, rings, pointer tracking, and infinite motion', () => {
  const findLichenColorViolations = getLichenValidator()
  const violations = findLichenColorViolations([
    {
      path: 'apps/docs/components/landing/living-canopy.tsx',
      content: [
        `<div className='mark-glow mark-ring' />`,
        `window.addEventListener('pointermove', onMove)`,
      ].join('\n'),
    },
    {
      path: 'apps/docs/app/global.css',
      content: '.canopy-root { animation: drift 2s linear infinite; }',
    },
  ]).filter(violation =>
    violation.match.startsWith('living canopy regression:')
  )

  assert.deepEqual(
    violations.map(violation => violation.match),
    [
      'living canopy regression: retired mark glow',
      'living canopy regression: retired mark ring',
      'living canopy regression: global pointer tracking',
      'living canopy regression: infinite homepage animation',
    ]
  )
})

test('rejects longhand infinite animation on governance homepage selectors', () => {
  const findLichenColorViolations = getLichenValidator()
  const violations = findLichenColorViolations([
    {
      path: 'apps/docs/app/global.css',
      content: '.governance-hero { animation-iteration-count: infinite; }',
    },
  ])

  assert.equal(
    violations.some(
      violation =>
        violation.match ===
        'living canopy: gradients, blur, and infinite motion are prohibited'
    ),
    true
  )
})

test('rejects a later Living Canopy root override', () => {
  const findLichenColorViolations = getLichenValidator()
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
  const globalCss = readFileSync(
    join(repositoryRoot, 'apps/docs/app/global.css'),
    'utf8'
  ).concat('\n.canopy-root-node { fill: #ff0000; }\n')

  assert.deepEqual(
    findLichenColorViolations([
      { path: 'apps/docs/app/global.css', content: globalCss },
    ]).filter(violation =>
      violation.match.startsWith('living canopy: missing')
    ),
    [
      {
        path: 'apps/docs/app/global.css',
        line: null,
        match: 'living canopy: missing Lichen root node',
      },
    ]
  )
})

test('rejects a qualified Living Canopy root override', () => {
  const findLichenColorViolations = getLichenValidator()
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
  const globalCss = readFileSync(
    join(repositoryRoot, 'apps/docs/app/global.css'),
    'utf8'
  ).concat('\n.canopy-root-node:first-child { fill: #ff0000; }\n')

  assert.equal(
    findLichenColorViolations([
      { path: 'apps/docs/app/global.css', content: globalCss },
    ]).some(
      violation => violation.match === 'living canopy: missing Lichen root node'
    ),
    true
  )
})

test('rejects an earlier higher-specificity Living Canopy root override', () => {
  const findLichenColorViolations = getLichenValidator()
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
  const globalCss = [
    '.governance-home .canopy-root-node { fill: #ff0000; }',
    readFileSync(join(repositoryRoot, 'apps/docs/app/global.css'), 'utf8'),
  ].join('\n')

  assert.equal(
    findLichenColorViolations([
      { path: 'apps/docs/app/global.css', content: globalCss },
    ]).some(
      violation => violation.match === 'living canopy: missing Lichen root node'
    ),
    true
  )
})

test('rejects a gradient in a static brand asset', () => {
  const findLichenColorViolations = getLichenValidator()

  assert.deepEqual(
    findLichenColorViolations([
      {
        path: 'apps/docs/public/favicon.svg',
        content: '<svg><linearGradient id="fill"/><path fill="#5F7F2F"/></svg>',
      },
    ]),
    [
      {
        path: 'apps/docs/public/favicon.svg',
        line: 1,
        match: 'static mark must use one solid fill',
      },
    ]
  )
})

test('rejects an extra fill in a static brand asset', () => {
  const findLichenColorViolations = getLichenValidator()

  assert.deepEqual(
    findLichenColorViolations([
      {
        path: 'apps/docs/public/favicon.svg',
        content:
          '<svg fill="none"><path fill="#5F7F2F"/><path fill="#ff0000"/></svg>',
      },
    ]),
    [
      {
        path: 'apps/docs/public/favicon.svg',
        line: 1,
        match: 'mark fill: expected #5f7f2f, found #ff0000',
      },
    ]
  )
})

test('rejects style paint and strokes in a static brand asset', () => {
  const findLichenColorViolations = getLichenValidator()
  const violations = findLichenColorViolations([
    {
      path: 'apps/docs/public/favicon.svg',
      content:
        '<svg fill="none"><path fill="#5F7F2F" stroke="#ff0000" style="fill:#ff0000"/></svg>',
    },
  ])

  assert.deepEqual(violations, [
    {
      path: 'apps/docs/public/favicon.svg',
      line: 1,
      match: 'mark stroke: expected none, found #ff0000',
    },
    {
      path: 'apps/docs/public/favicon.svg',
      line: 1,
      match: 'static mark must not override fill or stroke through CSS',
    },
  ])
})

test('the repository satisfies the approved Lichen color contract', () => {
  const findLichenColorViolations = getLichenValidator()
  const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

  assert.deepEqual(
    findLichenColorViolations(readBrandRecords(repositoryRoot)),
    []
  )
})
