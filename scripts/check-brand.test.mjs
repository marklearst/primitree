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
const GLOBAL_CSS = 'apps/docs/app/global.css'
const HOME_CSS = 'apps/docs/components/landing/home.css'
const PLAYGROUND_CSS = 'apps/docs/components/playground/playground.css'
const TOKEN_GRAPH = 'apps/docs/components/landing/token-graph.tsx'
const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))

function getLichenValidator() {
  assert.equal(
    typeof brandRules.findLichenColorViolations,
    'function',
    'brand rules must expose the scoped color validator'
  )
  return brandRules.findLichenColorViolations
}

function readRepositoryFile(path) {
  return readFileSync(join(REPOSITORY_ROOT, path), 'utf8')
}

/** The violations of one rule, by the prefix its messages start with. */
function matchesWith(records, prefix) {
  return getLichenValidator()(records)
    .filter(violation => violation.match.startsWith(prefix))
    .map(violation => violation.match)
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
      path: 'docs/launch/v1.0.0-next.0.md',
      content: `The React package moved from ${hooksScope} to @primitree/hooks.`,
    },
    {
      path: 'docs/launch/v1.0.0-next.1.md',
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
  const formerSuccess = legacy('rgba(168, 201, 95', ', 0.1)')
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
  assert.deepEqual(
    findLichenColorViolations([
      {
        path: 'README.md',
        content:
          '[![DTCG](https://img.shields.io/badge/DTCG-2025.10-429c5a)](https://www.designtokens.org)',
      },
    ]),
    []
  )
})

test('rejects a changed approved palette role', () => {
  const findLichenColorViolations = getLichenValidator()
  const records = [
    {
      path: GLOBAL_CSS,
      content: [
        '@theme inline {',
        '  --color-primitree-bg: var(--semantic-surface-page);',
        '  --color-primitree-accent: var(--semantic-accent-solid);',
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
        path: GLOBAL_CSS,
        line: 3,
        match:
          '--color-primitree-accent: expected var(--semantic-accent-text), found var(--semantic-accent-solid)',
      },
    ]
  )
})

test('rejects a role whose alias differs from its token only by case', () => {
  const globalCss = readRepositoryFile(GLOBAL_CSS).replace(
    '--color-primitree-accent-soft: var(--semantic-accent-solidHover);',
    '--color-primitree-accent-soft: var(--semantic-accent-solidhover);'
  )

  assert.deepEqual(
    matchesWith(
      [{ path: GLOBAL_CSS, content: globalCss }],
      '--color-primitree-accent-soft:'
    ),
    [
      '--color-primitree-accent-soft: expected var(--semantic-accent-solidHover), found var(--semantic-accent-solidhover)',
    ]
  )
})

test('requires every approved role to stay declared', () => {
  const globalCss = readRepositoryFile(GLOBAL_CSS).replace(
    '--color-primitree-warn: var(--semantic-status-warn);',
    ''
  )

  assert.deepEqual(
    matchesWith(
      [{ path: GLOBAL_CSS, content: globalCss }],
      '--color-primitree-warn:'
    ),
    [
      '--color-primitree-warn: expected var(--semantic-status-warn), found missing',
    ]
  )
})

test('holds a new palette role to a semantic alias', () => {
  const content = (value, name = '--color-primitree-new') =>
    readRepositoryFile(GLOBAL_CSS).concat(`\n:root { ${name}: ${value}; }\n`)
  const check = value =>
    matchesWith(
      [{ path: GLOBAL_CSS, content: content(value) }],
      '--color-primitree-new:'
    )

  assert.deepEqual(check('var(--component-link-text)'), [
    '--color-primitree-new: expected a semantic alias, found var(--component-link-text)',
  ])
  assert.deepEqual(check('var(--semantic-accent-edge)'), [])
})

test('ignores CSS declarations in comments and rejects active overrides', () => {
  const findLichenColorViolations = getLichenValidator()
  const approved = '--color-primitree-accent: var(--semantic-accent-text);'
  const source = readRepositoryFile(GLOBAL_CSS)
  const line = source.slice(0, source.indexOf(approved)).split('\n').length
  const globalCss = source
    .replace(approved, '--color-primitree-accent: #111111;')
    .concat(`\n/* ${approved} */\n`)

  assert.deepEqual(
    findLichenColorViolations([
      { path: GLOBAL_CSS, content: globalCss },
    ]).filter(violation =>
      violation.match.startsWith('--color-primitree-accent:')
    ),
    [
      {
        path: GLOBAL_CSS,
        line,
        match:
          '--color-primitree-accent: expected var(--semantic-accent-text), found #111111',
      },
    ]
  )
})

test('rejects a later text selection override', () => {
  const globalCss = readRepositoryFile(GLOBAL_CSS).concat(
    '\n::selection { background: #111111; }\n'
  )

  assert.deepEqual(
    matchesWith([{ path: GLOBAL_CSS, content: globalCss }], 'text selection:'),
    ['text selection: expected var(--semantic-accent-subtle), found #111111']
  )
})

test('rejects final CSS declarations without semicolons', () => {
  const findLichenColorViolations = getLichenValidator()
  const globalCss = readRepositoryFile(GLOBAL_CSS).concat(
    [
      ':root { --color-primitree-accent: #111111 }',
      '::selection { background: #111111 }',
    ].join('\n')
  )
  const homeCss = readRepositoryFile(HOME_CSS).concat(
    '\n.graph-node.is-lit .node-swatch { stroke: #ff0000 }'
  )
  const violations = findLichenColorViolations([
    { path: GLOBAL_CSS, content: globalCss },
    { path: HOME_CSS, content: homeCss },
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
      violation => violation.match === 'token graph: missing lit node outline'
    ),
    true
  )
})

test('rejects a stylesheet that does not parse', () => {
  const findLichenColorViolations = getLichenValidator()

  assert.deepEqual(
    findLichenColorViolations([
      { path: PLAYGROUND_CSS, content: '.pg-title { color: var(--x);' },
    ]),
    [
      {
        path: PLAYGROUND_CSS,
        line: 1,
        match: 'CSS syntax must parse before checking the color contract',
      },
    ]
  )
})

for (const path of [GLOBAL_CSS, HOME_CSS]) {
  test(`rejects each form of color literal in ${path}`, () => {
    const declarations = {
      'color: #abc': '#abc',
      'color: #AABBCC': '#AABBCC',
      'color: #aabbcc80': '#aabbcc80',
      'color: rgb(1 2 3)': 'rgb()',
      'color: rgba(1, 2, 3, 0.5)': 'rgba()',
      'color: hsl(10 20% 30%)': 'hsl()',
      'color: hwb(10 20% 30%)': 'hwb()',
      'color: lab(40% 10 10)': 'lab()',
      'color: lch(40% 10 10)': 'lch()',
      'color: oklab(40% 0.1 0.1)': 'oklab()',
      'color: oklch(0.5 0.1 150)': 'oklch()',
      'color: color(display-p3 1 0 0)': 'color()',
      'color: rebeccapurple': 'rebeccapurple',
      'color: RED': 'RED',
      'background: linear-gradient(#123456, var(--semantic-accent-subtle))':
        '#123456',
      'border: 1px solid tomato': 'tomato',
      '--local: #fff': '#fff',
      'color: color-mix(in srgb, white 40%, var(--semantic-text-primary))':
        'white',
      'fill: oklch(from red l c h)': 'red',
      'fill: oklch(from #123456 l c h)': '#123456',
    }

    for (const [declaration, literal] of Object.entries(declarations)) {
      const [property] = declaration.split(':')
      assert.deepEqual(
        matchesWith(
          [{ path, content: `.hero { ${declaration}; }` }],
          'color literal'
        ),
        [`color literal in ${property}: ${literal}`],
        declaration
      )
    }
  })

  test(`allows token reads and colorless keywords in ${path}`, () => {
    const declarations = [
      'color: var(--semantic-text-primary)',
      'color: var(--semantic-text-primary, #fff)',
      'color: var(--semantic-text-primary, var(--semantic-text-muted, rgb(1 2 3)))',
      'background: transparent',
      'color: currentColor',
      'color: inherit',
      'fill: oklch(from var(--edge-color) clamp(0.2, l, 0.6) c h)',
      'transform: rotate(45deg)',
      'margin: calc(tan(45deg) * 1px)',
      'font-family: "Tomato Sans", Wotfard',
      'background-image: url(#red)',
      'mask-image: linear-gradient(to top, black, transparent)',
      '-webkit-mask-image: radial-gradient(circle, transparent 56%, black 57%)',
      'white-space: nowrap',
      'grid-area: red-zone',
    ]

    for (const declaration of declarations) {
      assert.deepEqual(
        matchesWith(
          [{ path, content: `.hero { ${declaration}; }` }],
          'color literal'
        ),
        [],
        declaration
      )
    }
    assert.deepEqual(
      matchesWith(
        [
          {
            path,
            content:
              '/* #abcdef */ @supports (color: oklch(from red l c h)) { .hero { color: var(--semantic-text-primary); } }',
          },
        ],
        'color literal'
      ),
      []
    )
  })
}

test('a mask keyword stays a literal everywhere a mask does not read it', () => {
  assert.deepEqual(
    matchesWith(
      [
        {
          path: HOME_CSS,
          content: [
            '.hero { color: black; }',
            '.hero { mask-image: linear-gradient(red, black); }',
            '.hero { mask-image: linear-gradient(#123456, black); }',
          ].join('\n'),
        },
      ],
      'color literal'
    ),
    [
      'color literal in color: black',
      'color literal in mask-image: red',
      'color literal in mask-image: #123456',
    ]
  )
})

test('scopes the color literal rule to the site stylesheets', () => {
  assert.deepEqual(
    matchesWith(
      [{ path: PLAYGROUND_CSS, content: '.pg-title { color: #123456; }' }],
      'color literal'
    ),
    []
  )
})

test('rejects a primitive read in any site stylesheet', () => {
  const findLichenColorViolations = getLichenValidator()

  for (const path of [GLOBAL_CSS, HOME_CSS, PLAYGROUND_CSS]) {
    assert.deepEqual(
      findLichenColorViolations([
        {
          path,
          content: [
            '.a { color: var(--semantic-text-primary); }',
            '.b { color: var(--primitives-color-brand-45); }',
            '.c { color: var(--semantic-text-primary, var(--primitives-color-brand-45)); }',
          ].join('\n'),
        },
      ]).filter(violation =>
        violation.match.startsWith('site CSS reads a primitive:')
      ),
      [
        {
          path,
          line: 2,
          match: 'site CSS reads a primitive: --primitives-color-brand-45',
        },
        {
          path,
          line: 3,
          match: 'site CSS reads a primitive: --primitives-color-brand-45',
        },
      ]
    )
  }
})

test('allows semantic reads, comments, and the generated token file', () => {
  const generated = readRepositoryFile('apps/docs/tokens/generated/tokens.css')
  assert.match(generated, /--primitives-color-brand-45/u)

  assert.deepEqual(
    matchesWith(
      [
        {
          path: PLAYGROUND_CSS,
          content:
            '/* never var(--primitives-color-brand-45) */ .a { color: var(--semantic-text-primary); }',
        },
        { path: 'apps/docs/tokens/generated/tokens.css', content: generated },
      ],
      'site CSS'
    ),
    []
  )
})

test('rejects a stylesheet that redeclares a token', () => {
  const findLichenColorViolations = getLichenValidator()
  const homeCss = readRepositoryFile(HOME_CSS).concat(
    [
      '',
      '.close { --semantic-accent-solid: var(--semantic-accent-text); }',
      '.close { --component-link-text: var(--semantic-accent-text); }',
      '.close { --primitives-color-brand-45: var(--semantic-accent-text); }',
    ].join('\n')
  )

  assert.deepEqual(
    findLichenColorViolations([{ path: HOME_CSS, content: homeCss }]).map(
      violation => violation.match
    ),
    [
      'site CSS redeclares a token: --semantic-accent-solid',
      'site CSS redeclares a token: --component-link-text',
      'site CSS redeclares a token: --primitives-color-brand-45',
    ]
  )
})

test('allows a stylesheet its own local variables', () => {
  assert.deepEqual(
    matchesWith(
      [
        {
          path: HOME_CSS,
          content: '.graph-edge { --edge-color: var(--component-graph-edge); }',
        },
      ],
      'site CSS'
    ),
    []
  )
})

test('requires global.css to import the generated tokens', () => {
  const message = 'global.css must import ../tokens/generated/tokens.css'
  const globalCss = readRepositoryFile(GLOBAL_CSS)

  assert.deepEqual(
    matchesWith([{ path: GLOBAL_CSS, content: globalCss }], 'global.css must'),
    []
  )
  assert.deepEqual(
    matchesWith(
      [
        {
          path: GLOBAL_CSS,
          content: globalCss.replace(
            "@import '../tokens/generated/tokens.css';",
            ''
          ),
        },
      ],
      'global.css must'
    ),
    [message]
  )
  assert.deepEqual(
    matchesWith(
      [
        {
          path: HOME_CSS,
          content: readRepositoryFile(HOME_CSS),
        },
      ],
      'global.css must'
    ),
    []
  )
})

test('rejects retired glow, rings, and pointer tracking', () => {
  const findLichenColorViolations = getLichenValidator()
  const violations = findLichenColorViolations([
    {
      path: TOKEN_GRAPH,
      content: [
        `<div className='mark-glow mark-ring graph-node graph-edge' />`,
        `window.addEventListener('pointermove', onMove)`,
      ].join('\n'),
    },
  ]).filter(violation => violation.match.startsWith('homepage regression:'))

  assert.deepEqual(
    violations.map(violation => violation.match),
    [
      'homepage regression: retired mark glow',
      'homepage regression: retired mark ring',
      'homepage regression: global pointer tracking',
    ]
  )
})

test('rejects pointer tracking on every global target', () => {
  for (const line of [
    `window.addEventListener('pointermove', onMove)`,
    `window?.addEventListener("pointermove", onMove)`,
    `globalThis.addEventListener('pointermove', onMove)`,
    `self.addEventListener('pointermove', onMove)`,
    `document.addEventListener('pointermove', onMove)`,
    `document.body.addEventListener('pointermove', onMove)`,
    `document.documentElement.addEventListener('pointermove', onMove)`,
    `window.addEventListener('mousemove', onMove)`,
    `addEventListener('pointermove', onMove)`,
    `  addEventListener(\n    'pointermove',\n    onMove\n  )`,
  ]) {
    assert.deepEqual(
      matchesWith(
        [{ path: 'apps/docs/components/landing/new-panel.tsx', content: line }],
        'homepage regression:'
      ),
      ['homepage regression: global pointer tracking'],
      line
    )
  }
})

test('allows a pointer listener scoped to one element', () => {
  for (const line of [
    `svg.addEventListener('pointermove', onGraphMove)`,
    `element?.addEventListener('pointermove', onMove)`,
    `dial.current.addEventListener('pointermove', onMove)`,
    `document.addEventListener('pointerover', onPageOver)`,
    `window.addEventListener('pointerdown', onPress)`,
  ]) {
    assert.deepEqual(
      matchesWith(
        [{ path: 'apps/docs/components/landing/new-panel.tsx', content: line }],
        'homepage regression:'
      ),
      [],
      line
    )
  }
})

test('the retired mark and board stay out of homepage source', () => {
  for (const [content, label] of [
    [`<g className='board-token' />`, 'retired token board'],
    [`<path className='tree-edge' />`, 'retired token board'],
    [`import { TokenBoard } from './token-board'`, 'retired token board'],
    [`import { useTrace } from './use-tree-trace'`, 'retired token board'],
    [`import { W } from '@/lib/landing/board-geometry'`, 'retired token board'],
    [
      `import { brand } from '@/lib/landing/brand-example'`,
      'retired token board',
    ],
    ['.close { color: var(--home-lit); }', 'retired token board'],
    [`<div style={{ filter: 'blur(2px)' }} />`, 'inline filter effect'],
    [`<div style={{ backdropFilter: 'blur(2px)' }} />`, 'inline filter effect'],
    [`<g filter='url(#glow)' />`, 'inline filter effect'],
    [`<div className='backdrop-blur' />`, 'inline filter effect'],
    [`<h1 className='bg-clip-text' />`, 'inline gradient text'],
    [`<h1 style={{ backgroundClip: 'text' }} />`, 'inline gradient text'],
  ]) {
    assert.deepEqual(
      matchesWith(
        [{ path: 'apps/docs/components/landing/new-panel.tsx', content }],
        'homepage regression:'
      ),
      [`homepage regression: ${label}`],
      content
    )
  }
})

test('the regression rules leave ordinary homepage source and other folders alone', () => {
  for (const content of [
    `<g className='graph-node' />`,
    'const rows = tokens.filter(token => token.layer === layer)',
    `<div className='board' style={{ color: tokenVar(path) }} />`,
  ]) {
    assert.deepEqual(
      matchesWith(
        [{ path: 'apps/docs/components/landing/new-panel.tsx', content }],
        'homepage regression:'
      ),
      [],
      content
    )
  }
  assert.deepEqual(
    matchesWith(
      [
        {
          path: 'apps/docs/components/playground/panel.tsx',
          content: `window.addEventListener('pointermove', onMove)`,
        },
      ],
      'homepage regression:'
    ),
    []
  )
})

test('rejects blur filters on homepage selectors', () => {
  const findLichenColorViolations = getLichenValidator()
  const violations = findLichenColorViolations([
    {
      path: HOME_CSS,
      content: [
        '.home-hero { backdrop-filter: blur(12px); }',
        '.graph-edge { filter: drop-shadow(0 0 4px var(--x)); }',
        '.crown { filter: blur(2px); }',
        '.island { -webkit-backdrop-filter: blur(2px); }',
      ].join('\n'),
    },
    {
      path: GLOBAL_CSS,
      content: '.site-header { backdrop-filter: blur(8px); }',
    },
  ])

  assert.deepEqual(
    violations
      .filter(
        violation =>
          violation.match === 'homepage: blur and filter effects are prohibited'
      )
      .map(violation => [violation.path, violation.line]),
    [
      [HOME_CSS, 1],
      [HOME_CSS, 2],
      [HOME_CSS, 3],
      [HOME_CSS, 4],
      [GLOBAL_CSS, 1],
    ]
  )
})

test('rejects gradient text on homepage selectors', () => {
  assert.deepEqual(
    matchesWith(
      [
        {
          path: HOME_CSS,
          content: [
            '.hero-title { background-clip: text; }',
            '.hero-title { -webkit-background-clip: text; }',
            '.hero-title { -webkit-text-fill-color: transparent; }',
            '.hero-title { background: linear-gradient(var(--a), var(--b)) text; }',
          ].join('\n'),
        },
      ],
      'homepage: gradient text'
    ),
    Array.from({ length: 4 }, () => 'homepage: gradient text is prohibited')
  )
})

test('the effect rules allow masks, token backgrounds, and other files', () => {
  assert.deepEqual(
    matchesWith(
      [
        {
          path: HOME_CSS,
          content: [
            '.graph-stub { mask-image: linear-gradient(to top, black, transparent); }',
            '.crown-button { background: var(--semantic-text-primary); }',
            '.crown-button { background-clip: padding-box; }',
            '.hero { transition-property: filter; }',
          ].join('\n'),
        },
        {
          path: PLAYGROUND_CSS,
          content: '.pg-title { filter: blur(2px); background-clip: text; }',
        },
      ],
      'homepage:'
    ),
    []
  )
})

test('requires the structural classes in the token graph', () => {
  const findLichenColorViolations = getLichenValidator()

  assert.deepEqual(
    findLichenColorViolations([
      {
        path: TOKEN_GRAPH,
        content: `<g className='node' /><path className='edge' />`,
      },
    ]),
    [
      {
        path: TOKEN_GRAPH,
        line: null,
        match: 'token graph: missing structural node class',
      },
      {
        path: TOKEN_GRAPH,
        line: null,
        match: 'token graph: missing structural edge class',
      },
    ]
  )
})

test('the token graph carries its structural classes', () => {
  assert.deepEqual(
    matchesWith(
      [{ path: TOKEN_GRAPH, content: readRepositoryFile(TOKEN_GRAPH) }],
      'token graph:'
    ),
    []
  )
})

test('rejects a later token graph override', () => {
  const findLichenColorViolations = getLichenValidator()
  const homeCss = readRepositoryFile(HOME_CSS).concat(
    '\n.graph-svg .graph-break { --edge-color: var(--component-graph-lit); }\n'
  )

  assert.deepEqual(
    findLichenColorViolations([{ path: HOME_CSS, content: homeCss }]).filter(
      violation => violation.match.startsWith('token graph: missing')
    ),
    [
      {
        path: HOME_CSS,
        line: null,
        match: 'token graph: missing fail-colored broken reference',
      },
    ]
  )
})

test('rejects a qualified token graph override', () => {
  const homeCss = readRepositoryFile(HOME_CSS).concat(
    '\n.graph-node:focus-visible > *:first-child { stroke: var(--component-graph-lit); }\n'
  )

  assert.deepEqual(
    matchesWith([{ path: HOME_CSS, content: homeCss }], 'token graph: missing'),
    ['token graph: missing node focus outline']
  )
})

test('rejects an earlier higher-specificity token graph override', () => {
  const homeCss = [
    '.home .graph-node.is-lit .node-swatch { stroke: var(--component-graph-fail); }',
    readRepositoryFile(HOME_CSS),
  ].join('\n')

  assert.deepEqual(
    matchesWith([{ path: HOME_CSS, content: homeCss }], 'token graph: missing'),
    ['token graph: missing lit node outline']
  )
})

test('rejects an important token graph override', () => {
  const homeCss = readRepositoryFile(HOME_CSS).concat(
    '\n.graph-svg .graph-edge.is-lit { fill-opacity: 0.5 !important; }\n'
  )

  assert.deepEqual(
    matchesWith([{ path: HOME_CSS, content: homeCss }], 'token graph: missing'),
    ['token graph: missing lit lineage edge']
  )
})

test('the homepage stylesheet satisfies the token graph contract', () => {
  const findLichenColorViolations = getLichenValidator()

  assert.deepEqual(
    findLichenColorViolations([
      { path: HOME_CSS, content: readRepositoryFile(HOME_CSS) },
    ]),
    []
  )
})

test('the site stylesheet satisfies the color contract', () => {
  const findLichenColorViolations = getLichenValidator()

  assert.deepEqual(
    findLichenColorViolations([
      { path: GLOBAL_CSS, content: readRepositoryFile(GLOBAL_CSS) },
    ]),
    []
  )
})

test('rejects a gradient in a static brand asset', () => {
  const findLichenColorViolations = getLichenValidator()

  assert.deepEqual(
    findLichenColorViolations([
      {
        path: 'apps/docs/public/favicon.svg',
        content: '<svg><linearGradient id="fill"/><path fill="#429C5A"/></svg>',
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
          '<svg fill="none"><path fill="#429C5A"/><path fill="#ff0000"/></svg>',
      },
    ]),
    [
      {
        path: 'apps/docs/public/favicon.svg',
        line: 1,
        match: 'mark fill: expected #429c5a, found #ff0000',
      },
    ]
  )
})

test('rejects a static brand asset with no fill', () => {
  const findLichenColorViolations = getLichenValidator()

  assert.deepEqual(
    findLichenColorViolations([
      {
        path: 'apps/docs/public/primitree-icon.svg',
        content: '<svg fill="none"><path d="M0 0"/></svg>',
      },
    ]),
    [
      {
        path: 'apps/docs/public/primitree-icon.svg',
        line: null,
        match: 'mark fill: expected #ffffff, found missing',
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
        '<svg fill="none"><path fill="#429C5A" stroke="#ff0000" style="fill:#ff0000"/></svg>',
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

test('a static brand asset with one approved fill passes', () => {
  const findLichenColorViolations = getLichenValidator()

  assert.deepEqual(
    findLichenColorViolations([
      {
        path: 'apps/docs/public/favicon.svg',
        content: '<svg fill="none"><path fill="#429C5A"/></svg>',
      },
      {
        path: 'apps/docs/public/primitree-icon.svg',
        content: '<svg fill="none"><path fill="white"/></svg>',
      },
    ]),
    []
  )
})

test('the repository satisfies the approved color contract', () => {
  const findLichenColorViolations = getLichenValidator()

  assert.deepEqual(
    findLichenColorViolations(readBrandRecords(REPOSITORY_ROOT)),
    []
  )
})
