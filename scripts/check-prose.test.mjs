import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  collectDocsNavigationFiles,
  collectFigmaPluginManifestFiles,
  collectMarkdownFiles,
  collectPackageManifests,
  collectPublicCopyFiles,
  collectPublicHtmlFiles,
  validateBuiltProseFiles,
} from './prose/files.mjs'
import { scanDocsNavigationJson } from './prose/docs-json.mjs'
import { scanHtml } from './prose/html.mjs'
import { scanFigmaPluginManifest } from './prose/plugin-manifest.mjs'
import { PUBLIC_RELEASE_PACKAGES } from './release-config.mjs'
import { scanMarkdown } from './prose/markdown.mjs'
import { scanPackageDescription } from './prose/package-json.mjs'
import { scanTypeScript } from './prose/typescript.mjs'

function ruleIds(violations) {
  return violations.map(violation => violation.ruleId)
}

test('Markdown checks visible prose and frontmatter', () => {
  const source = `---
title: API guide
description: A seamless token workflow.
---

This is the canonical guide.

[A robust workflow](https://example.com/canonical)
`

  const violations = scanMarkdown('guide.mdx', source)

  assert.deepEqual(ruleIds(violations), ['seamless', 'canonical', 'robust'])
  assert.deepEqual(
    violations.map(violation => violation.line),
    [3, 6, 8]
  )
})

test('Markdown ignores code, link targets, HTML tags, and MDX expressions', () => {
  const source = `Use \`canonical\` as the field name.

\`\`\`ts
const mode = 'deterministic'
\`\`\`

[Read the field reference](https://example.com/robust)

<Callout kind="seamless">Plain documentation.</Callout>

<Widget value={canonicalValue} />
`

  assert.deepEqual(scanMarkdown('guide.mdx', source), [])
})

test('Markdown checks prose across inline formatting boundaries', () => {
  const source = 'Not **just** a token converter, but also a file writer.\n'

  assert.deepEqual(ruleIds(scanMarkdown('guide.mdx', source)), ['binary-pivot'])
})

test('Markdown checks visible image alt text without scanning its URL', () => {
  const source =
    '![A robust variables diagram](https://example.com/canonical-flow.svg)\n'

  assert.deepEqual(ruleIds(scanMarkdown('guide.mdx', source)), ['robust'])
})

test('Markdown checks human-facing strings in JavaScript and TypeScript fences', () => {
  const source = `\`\`\`tsx
import { canonicalHelper } from 'deterministic-module'
const label = 'A robust token report'
const view = <p>A seamless handoff</p>
\`\`\`

\`\`\`json
{"description":"A powerful result"}
\`\`\`
`

  assert.deepEqual(ruleIds(scanMarkdown('guide.mdx', source)), [
    'robust',
    'seamless',
  ])
})

test('documentation code fences check human-facing comments', () => {
  const markdown = `\`\`\`ts
// You can publish the generated files.
// If the build fails, stop.
// What happens next?
// Then publish.
// Error thrown.
const command = 'pnpm publish'
\`\`\`
`
  assert.deepEqual(ruleIds(scanMarkdown('guide.mdx', markdown)), [
    'reader-permission',
    'conditional-opener',
    'wh-sentence-opener',
    'sequence-adverb',
    'passive-fragment',
  ])

  const source = `/**
 * @example
 * \`\`\`ts
 * // A robust token export.
 * // If the build fails, stop.
 * const command = 'pnpm publish'
 * \`\`\`
 */
export function publishTokens() {}
`
  assert.deepEqual(
    ruleIds(
      scanTypeScript('public.ts', source, {
        includeDocComments: true,
        includeStrings: false,
      })
    ),
    ['robust', 'conditional-opener']
  )

  const blockComment = `const mode = 'plain'
/*
 * Keep this line.
 * A robust token export.
 * If the build fails, stop.
 * What happens next?
 * Then publish.
 * Error thrown.
 */
`
  const blockViolations = scanTypeScript('example.ts', blockComment, {
    includeCodeComments: true,
    includeDocComments: false,
    includeStrings: false,
  })
  assert.deepEqual(ruleIds(blockViolations), [
    'robust',
    'conditional-opener',
    'wh-sentence-opener',
    'sequence-adverb',
    'passive-fragment',
  ])
  assert.equal(blockViolations[0].line, 4)
  assert.equal(blockViolations[0].column, 6)
  assert.equal(blockViolations[1].line, 5)
  assert.equal(blockViolations[1].column, 4)
  assert.equal(blockViolations[4].line, 8)
  assert.equal(blockViolations[4].column, 4)

  const wrappedComment = `/*
 * The package is not a
 * wrapper, but a parser.
 *
 * You
 * can publish this.
 */
`
  const wrappedViolations = scanTypeScript('example.ts', wrappedComment, {
    includeCodeComments: true,
    includeDocComments: false,
    includeStrings: false,
  })
  assert.deepEqual(ruleIds(wrappedViolations), [
    'binary-contrast',
    'reader-permission',
  ])
  assert.deepEqual(
    wrappedViolations.map(violation => [violation.line, violation.column]),
    [
      [2, 19],
      [5, 4],
    ]
  )

  const wrappedLineComments = `// The package is not a
// wrapper, but a parser.
//
// You
// can publish this.
`
  const wrappedLineViolations = scanTypeScript(
    'example.ts',
    wrappedLineComments,
    {
      includeCodeComments: true,
      includeDocComments: false,
      includeStrings: false,
    }
  )
  assert.deepEqual(ruleIds(wrappedLineViolations), [
    'binary-contrast',
    'reader-permission',
  ])
  assert.deepEqual(
    wrappedLineViolations.map(violation => [violation.line, violation.column]),
    [
      [1, 19],
      [4, 4],
    ]
  )

  const wrappedContinuation = `/*
 * Use the default mode
 * when the caller omits one.
 */

// Use the default mode
// when the caller omits one.
`
  assert.deepEqual(
    scanTypeScript('example.ts', wrappedContinuation, {
      includeCodeComments: true,
      includeDocComments: false,
      includeStrings: false,
    }),
    []
  )
})

test('Markdown checks stop-slop filler and formulaic framing', () => {
  const source = `Here's the thing: this is actually a deep dive.

The answer isn't speed. It's review time.
`

  assert.deepEqual(ruleIds(scanMarkdown('guide.mdx', source)), [
    'throat-clearing',
    'filler-adverb',
    'business-jargon',
    'binary-reframe',
  ])
})

test('Markdown checks static strings in visible MDX expressions', () => {
  const source = `<Card
  title={'A robust workflow'}
  description={enabled ? 'A seamless handoff' : 'A plain handoff'}
/>

{'A powerful result'}
`

  assert.deepEqual(ruleIds(scanMarkdown('guide.mdx', source)), [
    'robust',
    'seamless',
    'powerful',
  ])
})

test('Markdown checks visible MDX copy props and skips technical props', () => {
  const source = `<Card
  caption='A robust token report'
  eyebrow={'A seamless handoff'}
  tooltip={\`A powerful shortcut\`}
  supportingCopy='A comprehensive variable summary'
  href='https://example.com/canonical'
  className='robust layout'
  kind='seamless'
  icon='powerful'
/>
`

  assert.deepEqual(ruleIds(scanMarkdown('guide.mdx', source)), [
    'robust',
    'seamless',
    'powerful',
    'comprehensive',
  ])
})

test('docs navigation JSON checks string values, including nested titles', () => {
  const source = `{
  "title": "A robust API reference",
  "pages": [
    "index",
    {
      "title": "A seamless hooks guide",
      "pages": ["hooks"]
    }
  ]
}
`

  assert.deepEqual(ruleIds(scanDocsNavigationJson('meta.json', source)), [
    'robust',
    'seamless',
  ])
})

test('Figma plugin manifest checks only human-facing fields', () => {
  const source = `{
  "name": "A robust export",
  "id": "canonical",
  "main": "dist/deterministic.js",
  "networkAccess": {
    "allowedDomains": ["none"],
    "reasoning": "A seamless offline workflow."
  }
}
`

  assert.deepEqual(ruleIds(scanFigmaPluginManifest('manifest.json', source)), [
    'robust',
    'seamless',
  ])
})

test('HTML checks visible titles, descriptions, and body copy', () => {
  const source = `<!doctype html>
<html>
  <head>
    <title>A seamless token tool</title>
    <meta name="description" content="A robust export workflow." />
    <script>const label = 'canonical'</script>
  </head>
  <body>
    <button>You can export tokens.</button>
  </body>
</html>
`

  assert.deepEqual(ruleIds(scanHtml('index.html', source)), [
    'seamless',
    'robust',
    'reader-permission',
  ])
})

test('HTML composes inline prose, scans visible attributes, and preserves positions', () => {
  const source = `<!doctype html>
<html>
  <body>
    <button aria-label="A robust export">Export</button>
    <p>
      The package is <strong>not a wrapper</strong>, but a parser.
    </p>
    <p>
      A &amp; seamless handoff.
    </p>
    <pre>A powerful technical example</pre>
    <code>canonical</code>
  </body>
</html>
`

  const violations = scanHtml('index.html', source)
  assert.deepEqual(ruleIds(violations), [
    'robust',
    'binary-contrast',
    'seamless',
  ])
  assert.deepEqual(
    violations.map(violation => [violation.line, violation.column]),
    [
      [4, 27],
      [6, 30],
      [9, 15],
    ]
  )
})

test('HTML skips script comparisons without losing later body copy', () => {
  const source = `<!doctype html>
<html>
  <body>
    <script>const smaller = left < right</script>
    <p>A robust token export.</p>
  </body>
</html>
`

  const violations = scanHtml('index.html', source)
  assert.deepEqual(ruleIds(violations), ['robust'])
  assert.deepEqual(
    violations.map(violation => [violation.line, violation.column]),
    [[5, 10]]
  )
})

test('HTML keeps scanning after malformed numeric entities', () => {
  const source = `<!doctype html>
<html>
  <body>
    <p>&#1114112; &#xZZ; A robust token export.</p>
  </body>
</html>
`

  const violations = scanHtml('index.html', source)
  assert.deepEqual(ruleIds(violations), ['robust'])
  assert.deepEqual(
    violations.map(violation => [violation.line, violation.column]),
    [[4, 28]]
  )
})

test('TypeScript checks public doc comments, prose strings, and JSX text', () => {
  const source = `/**
 * A deterministic token resolver.
 */
export function resolveToken() {}

export const metadata = {
  description: 'A robust token workflow.',
}

export function Card() {
  return <p>A seamless workflow.</p>
}
`

  const violations = scanTypeScript('public.tsx', source, {
    includeDocComments: true,
    includeStrings: true,
  })

  assert.deepEqual(ruleIds(violations), ['deterministic', 'robust', 'seamless'])
})

test('TypeScript checks one-word copy at known runtime call sites', () => {
  const source = `throw new Error('Robust')
console.warn('Canonical')
setError('Seamless')
const technicalIdentifier = path.join('Canonical')
`

  assert.deepEqual(
    ruleIds(
      scanTypeScript('public.ts', source, {
        includeDocComments: false,
        includeStrings: true,
      })
    ),
    ['robust', 'canonical', 'seamless']
  )
})

test('TypeScript ignores implementation comments, imports, identifiers, and code examples', () => {
  const source = `import { canonicalValue } from './robust'

// deterministic ordering keeps snapshots stable
const sourceOfTruth = canonicalValue

/**
 * Read one token.
 *
 * @example
 * \`\`\`ts
 * const mode = 'seamless'
 * \`\`\`
 */
export function readToken() {
  return sourceOfTruth
}
`

  assert.deepEqual(
    scanTypeScript('public.ts', source, {
      includeDocComments: true,
      includeStrings: true,
    }),
    []
  )
})

test('TypeScript checks example prose, including visible strings in tilde fences', () => {
  const source = `/**
 * Read the [field reference](https://example.com/canonical).
 *
 * @example A seamless handoff.
 * ~~~ts
 * const mode = 'deterministic'
 * console.log('A robust result')
 * ~~~
 */
export function readToken() {}
`

  assert.deepEqual(
    ruleIds(
      scanTypeScript('public.ts', source, {
        includeDocComments: true,
        includeStrings: false,
      })
    ),
    ['seamless', 'robust']
  )
})

test('TypeScript checks human-facing strings in fenced JavaScript and TypeScript examples', () => {
  const source = `/**
 * Read one token.
 *
 * @example
 * \`\`\`js
 * import { canonicalHelper } from 'deterministic-module'
 * console.log('A robust result')
 * \`\`\`
 *
 * \`\`\`ts
 * const seamlessIdentifier: string = 'A seamless result'
 * \`\`\`
 *
 * \`\`\`jsx
 * const view = <p>A powerful result</p>
 * \`\`\`
 *
 * \`\`\`tsx
 * const typedView: JSX.Element = <Notice tooltip='A comprehensive result' />
 * \`\`\`
 */
export function readToken() {}
`

  assert.deepEqual(
    ruleIds(
      scanTypeScript('public.ts', source, {
        includeDocComments: true,
        includeStrings: false,
      })
    ),
    ['robust', 'seamless', 'powerful', 'comprehensive']
  )
})

test('TypeScript skips CSS class fragments while checking human-facing templates', () => {
  const source = `export function Heading({
  hidden,
  name,
}: {
  hidden: boolean
  name: string
}) {
  return (
    <h1 className={\`pg-title\${hidden ? ' pg-visually-hidden' : ''}\`}>
      {\`A robust \${name} result\`}
    </h1>
  )
}
`

  assert.deepEqual(
    ruleIds(
      scanTypeScript('public.tsx', source, {
        includeDocComments: false,
        includeStrings: true,
      })
    ),
    ['robust']
  )
})

test('TypeScript does not join binary pivots across paragraphs', () => {
  const source = `/**
 * Not only a token converter.
 *
 * But also a file writer.
 */
export function readToken() {}
`

  assert.doesNotMatch(
    ruleIds(
      scanTypeScript('public.ts', source, {
        includeDocComments: true,
        includeStrings: false,
      })
    ).join(','),
    /binary-pivot/u
  )
})

test('TypeScript ignores doc comments on private implementation details', () => {
  const source = `/**
 * A seamless internal cache.
 */
function createCache() {}

/**
 * Read one token.
 */
export function readToken() {
  return createCache()
}
`

  assert.deepEqual(
    scanTypeScript('public.ts', source, {
      includeDocComments: true,
      includeStrings: false,
    }),
    []
  )
})

test('TypeScript checks internal TSDoc when the repository scans source files', () => {
  const source = `/**
 * A robust internal cache.
 */
function createCache() {}
`

  assert.deepEqual(
    ruleIds(
      scanTypeScript('internal.ts', source, {
        includeDocComments: 'all',
        includeStrings: false,
      })
    ),
    ['robust']
  )
})

test('package descriptions use the same prose rules', () => {
  const violations = scanPackageDescription(
    'package.json',
    JSON.stringify({
      name: 'example',
      description: 'A full-featured and powerful package.',
    })
  )

  assert.deepEqual(ruleIds(violations), ['full-featured', 'powerful'])
})

test('repository discovery includes Markdown, docs navigation, generated API pages, package manifests, and shipped help', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'primitree-prose-'))

  try {
    await writeFile(path.join(root, 'README.md'), '# Read me\n')
    await writeFile(path.join(root, 'guide.mdx'), '# Guide\n')
    await writeFile(path.join(root, 'package.json'), '{"name":"root"}\n')

    const apiDir = path.join(root, 'apps/docs/content/docs/api')
    await mkdir(apiDir, { recursive: true })
    await writeFile(path.join(apiDir, 'core.mdx'), '# Core\n')
    await writeFile(
      path.join(apiDir, 'meta.json'),
      '{"title":"API reference"}\n'
    )
    await writeFile(
      path.join(root, 'apps/docs/content/docs/meta.json'),
      '{"title":"Documentation"}\n'
    )

    const hooksScripts = path.join(root, 'packages/hooks/scripts')
    await mkdir(hooksScripts, { recursive: true })
    await writeFile(
      path.join(hooksScripts, 'export-variables.mjs'),
      "console.log('Export variables help')\n"
    )

    const additionalPublicSources = [
      'apps/docs/app/layout.tsx',
      'apps/docs/components/card.tsx',
      'apps/docs/lib/copy.ts',
      'apps/figma-plugin/src/ui.ts',
      'apps/playground/src/App.tsx',
      'packages/cli/src/index.ts',
      'packages/core/src/index.ts',
      'packages/dtcg/src/index.ts',
      'packages/hooks/src/index.ts',
      'packages/mcp/src/index.ts',
      'packages/plugin-export/src/build.ts',
    ]
    for (const file of additionalPublicSources) {
      const absolute = path.join(root, file)
      await mkdir(path.dirname(absolute), { recursive: true })
      await writeFile(absolute, "export const label = 'Public copy'\n")
    }
    await writeFile(
      path.join(root, 'apps/playground/index.html'),
      '<title>Playground</title>\n'
    )
    await writeFile(
      path.join(root, 'apps/figma-plugin/src/ui.html'),
      '<title>Plugin</title>\n'
    )
    await writeFile(
      path.join(root, 'apps/figma-plugin/manifest.json'),
      '{"name":"Plugin","networkAccess":{"reasoning":"No network calls."}}\n'
    )

    const markdown = await collectMarkdownFiles(root, {
      useGit: false,
      includeGenerated: true,
    })
    const navigation = await collectDocsNavigationFiles(root)
    const figmaPluginManifests = await collectFigmaPluginManifestFiles(root)
    const manifests = await collectPackageManifests(root)
    const publicCopy = await collectPublicCopyFiles(root)
    const publicHtml = await collectPublicHtmlFiles(root)

    assert.deepEqual(
      markdown.map(file => path.relative(root, file)),
      ['README.md', 'apps/docs/content/docs/api/core.mdx', 'guide.mdx']
    )
    assert.deepEqual(
      navigation.map(file => path.relative(root, file)),
      [
        'apps/docs/content/docs/api/meta.json',
        'apps/docs/content/docs/meta.json',
      ]
    )
    assert.deepEqual(
      figmaPluginManifests.map(file => path.relative(root, file)),
      ['apps/figma-plugin/manifest.json']
    )
    assert.deepEqual(
      manifests.map(file => path.relative(root, file)),
      ['package.json']
    )
    assert.deepEqual(
      publicCopy.map(file => path.relative(root, file)),
      [
        'apps/docs/app/layout.tsx',
        'apps/docs/components/card.tsx',
        'apps/docs/lib/copy.ts',
        'apps/figma-plugin/src/ui.ts',
        'apps/playground/src/App.tsx',
        'packages/cli/src/index.ts',
        'packages/core/src/index.ts',
        'packages/dtcg/src/index.ts',
        'packages/hooks/scripts/export-variables.mjs',
        'packages/hooks/src/index.ts',
        'packages/mcp/src/index.ts',
        'packages/plugin-export/src/build.ts',
      ]
    )
    assert.deepEqual(
      publicHtml.map(file => path.relative(root, file)),
      ['apps/figma-plugin/src/ui.html', 'apps/playground/index.html']
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('the repository source scan checks all TSDoc blocks', async () => {
  const checker = await readFile(
    new URL('./check-prose.mjs', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(checker, /includeDocComments:\s*false/u)
  assert.match(checker, /includeDocComments:\s*'all'/u)
})

test('repository discovery skips tracked Markdown deleted in the working tree', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'primitree-prose-git-'))

  try {
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    await writeFile(path.join(root, 'removed.md'), '# Removed\n')
    execFileSync('git', ['add', 'removed.md'], { cwd: root })
    await unlink(path.join(root, 'removed.md'))

    assert.deepEqual(
      await collectMarkdownFiles(root, {
        useGit: true,
        includeGenerated: false,
      }),
      []
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('repository discovery falls back to files outside a Git worktree', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'primitree-prose-files-'))

  try {
    await writeFile(path.join(root, 'README.md'), '# Read me\n')
    await mkdir(path.join(root, 'node_modules/example'), { recursive: true })
    await writeFile(
      path.join(root, 'node_modules/example/README.md'),
      '# Dependency\n'
    )

    assert.deepEqual(
      (await collectMarkdownFiles(root, { includeGenerated: false })).map(
        file => path.relative(root, file)
      ),
      ['README.md']
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('built prose validation requires every API page and exact public declaration', () => {
  const root = '/repo'
  const markdownFiles = [
    'index.mdx',
    'core.mdx',
    'dtcg.mdx',
    'hooks.mdx',
    'mcp.mdx',
    'meta.json',
  ].map(file => path.join(root, 'apps/docs/content/docs/api', file))
  const requiredDeclarations = new Map([
    [
      '@primitree/core',
      [
        'dist/index.d.ts',
        'dist/index.d.cts',
        'dist/types.d.ts',
        'dist/types.d.cts',
      ],
    ],
    ['@primitree/dtcg', ['dist/index.d.ts', 'dist/index.d.cts']],
    ['@primitree/cli', ['dist/index.d.ts']],
    ['@primitree/hooks', ['dist/index.d.ts', 'dist/index.d.cts']],
    ['@primitree/mcp', ['dist/index.d.ts', 'dist/cli.d.ts']],
  ])
  const declarationFiles = PUBLIC_RELEASE_PACKAGES.flatMap(config =>
    requiredDeclarations
      .get(config.name)
      .map(file => path.join(root, config.path, file))
  )

  assert.doesNotThrow(() =>
    validateBuiltProseFiles(root, markdownFiles, declarationFiles)
  )
  assert.throws(
    () =>
      validateBuiltProseFiles(
        root,
        markdownFiles.filter(file => !file.endsWith('hooks.mdx')),
        declarationFiles
      ),
    /hooks\.mdx/u
  )
  assert.throws(
    () =>
      validateBuiltProseFiles(
        root,
        markdownFiles,
        declarationFiles.filter(
          file => file !== path.join(root, 'packages/hooks/dist/index.d.cts')
        )
      ),
    /packages\/hooks\/dist\/index\.d\.cts/u
  )
})

test('root prose and release scripts refresh and scan before packing', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  )
  const proseScript = manifest.scripts['check:prose']
  const builtProseScript = manifest.scripts['check:prose:built']
  const releaseScript = manifest.scripts['check:release:built']
  const generateIndex = proseScript.indexOf(
    'pnpm --filter primitree-docs run generate:api'
  )
  const scanIndex = proseScript.indexOf('pnpm run check:prose:scan')
  const builtScanIndex = releaseScript.indexOf('pnpm run check:prose:built')
  const packIndex = releaseScript.indexOf('pnpm run pack:release')
  const builtGenerateIndex = builtProseScript.indexOf(
    'pnpm --filter primitree-docs run generate:api'
  )
  const declarationScanIndex = builtProseScript.indexOf(
    'node scripts/check-prose.mjs --built'
  )

  assert.equal(
    manifest.scripts['check:prose:scan'],
    'node scripts/check-prose.mjs'
  )
  assert.notEqual(generateIndex, -1)
  assert.notEqual(scanIndex, -1)
  assert.ok(generateIndex < scanIndex)
  assert.doesNotMatch(proseScript, /pnpm run check:prose(?:\s|$)/u)
  assert.notEqual(builtGenerateIndex, -1)
  assert.notEqual(declarationScanIndex, -1)
  assert.ok(builtGenerateIndex < declarationScanIndex)
  assert.notEqual(builtScanIndex, -1)
  assert.notEqual(packIndex, -1)
  assert.ok(builtScanIndex < packIndex)
})
