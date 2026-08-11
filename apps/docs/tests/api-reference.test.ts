import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  API_PAGE_ORDER,
  generateApiReference,
} from '../scripts/generate-api.mjs'
import { getDocsGithubUrl } from '../lib/shared.ts'

test('generated API pages do not link to ignored source files', () => {
  assert.equal(getDocsGithubUrl('api/core.mdx'), undefined)
  assert.equal(
    getDocsGithubUrl('hooks/index.mdx'),
    'https://github.com/marklearst/primitree/blob/main/apps/docs/content/docs/hooks/index.mdx'
  )
})

test('TypeDoc resolves workspace imports from source', async () => {
  const config = JSON.parse(
    await readFile(new URL('../tsconfig.typedoc.json', import.meta.url), 'utf8')
  )

  assert.equal(config.compilerOptions.baseUrl, undefined)
  assert.deepEqual(config.compilerOptions.paths, {
    '@primitree/core': ['../../packages/core/src/index.ts'],
    '@primitree/core/policy': ['../../packages/core/src/policy/index.ts'],
    '@primitree/core/types': ['../../packages/core/src/types/index.ts'],
    '@primitree/dtcg': ['../../packages/dtcg/src/index.ts'],
  })
  assert.deepEqual(config.include, [
    '../../packages/cli/src/config.ts',
    '../../packages/core/src',
    '../../packages/dtcg/src',
    '../../packages/hooks/src',
    '../../packages/mcp/src',
  ])
})

test('docs and release scripts run the prose checks at the right build boundary', async () => {
  const docsManifest = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  )
  const rootManifest = JSON.parse(
    await readFile(new URL('../../../package.json', import.meta.url), 'utf8')
  )
  const turbo = JSON.parse(
    await readFile(new URL('../../../turbo.json', import.meta.url), 'utf8')
  )

  assert.match(docsManifest.scripts.build, /generate:api/u)
  assert.match(docsManifest.scripts.build, /check:prose/u)
  assert.match(docsManifest.scripts.build, /check:links/u)
  assert.doesNotMatch(docsManifest.scripts.build, /check:prose:built/u)
  assert.match(rootManifest.scripts.test, /pnpm run check:prose/u)
  assert.match(
    rootManifest.scripts['check:release:built'],
    /check:prose:built/u
  )
  assert.ok(turbo.tasks.build.outputs.includes('content/docs/api/**'))
})

test('API reference generation writes the seven public entry points and an index', async () => {
  const outputDirectory = await mkdtemp(
    path.join(tmpdir(), 'primitree-api-reference-')
  )

  try {
    await writeFile(path.join(outputDirectory, 'stale.mdx'), '# Stale\n')
    await generateApiReference({ outputDirectory })

    assert.deepEqual((await readdir(outputDirectory)).sort(), [
      'cli-config.mdx',
      'core-policy.mdx',
      'core-types.mdx',
      'core.mdx',
      'dtcg.mdx',
      'hooks.mdx',
      'index.mdx',
      'mcp.mdx',
      'meta.json',
    ])

    const meta = JSON.parse(
      await readFile(path.join(outputDirectory, 'meta.json'), 'utf8')
    )
    assert.deepEqual(meta, {
      title: 'API reference',
      pages: API_PAGE_ORDER,
    })

    const expectedExports = {
      'cli-config.mdx': 'defineConfig',
      'core.mdx': 'normalizeVariables',
      'core-policy.mdx': 'createPolicy',
      'core-types.mdx': 'FigmaVariable',
      'dtcg.mdx': 'toDTCG',
      'hooks.mdx': 'TokensProvider',
      'mcp.mdx': 'createServer',
    }

    for (const [file, exportedName] of Object.entries(expectedExports)) {
      const source = await readFile(path.join(outputDirectory, file), 'utf8')
      assert.match(source, /^---\n/u)
      assert.match(source, /^title: .+$/mu)
      assert.match(source, /^description: .+$/mu)
      assert.match(source, new RegExp(`\\b${exportedName}\\b`, 'u'))
      assert.doesNotMatch(source.replace(/^---[\s\S]*?---\n/u, ''), /^# /mu)
      assert.doesNotMatch(source, /\]\([^)]*\.mdx(?:#[^)]+)?\)/u)
      assert.doesNotMatch(source, /^##### stackTraceLimit$/mu)
    }

    const index = await readFile(
      path.join(outputDirectory, 'index.mdx'),
      'utf8'
    )
    assert.match(index, /^title: "API reference"$/mu)
    assert.match(
      index,
      /^description: "Functions and types from the Primitree packages\."$/mu
    )
    assert.match(index, /\[Core API\]\(\/docs\/api\/core\)/u)
    assert.match(index, /\[Core policy API\]\(\/docs\/api\/core-policy\)/u)
    assert.match(index, /\[Core types API\]\(\/docs\/api\/core-types\)/u)
    assert.match(index, /\[CLI config API\]\(\/docs\/api\/cli-config\)/u)
    assert.match(index, /\[DTCG API\]\(\/docs\/api\/dtcg\)/u)
    assert.match(index, /\[React hooks API\]\(\/docs\/api\/hooks\)/u)
    assert.match(index, /\[MCP API\]\(\/docs\/api\/mcp\)/u)

    const hooks = await readFile(
      path.join(outputDirectory, 'hooks.mdx'),
      'utf8'
    )
    assert.match(hooks, /^title: "React hooks API"$/mu)
    assert.match(
      hooks,
      /^description: "@primitree\/hooks React providers and hooks\."$/mu
    )
    assert.match(hooks, /\]\(\/docs\/api\/core#[^)]+\)/u)
    assert.match(hooks, /\]\(\/docs\/api\/dtcg#[^)]+\)/u)
    assert.match(
      hooks,
      /Re-exports \[ResolvedType\]\(\/docs\/api\/core#resolvedtype-6\)/u
    )

    const cliConfig = await readFile(
      path.join(outputDirectory, 'cli-config.mdx'),
      'utf8'
    )
    assert.match(cliConfig, /\]\(\/docs\/api\/core-policy#[^)]+\)/u)

    const corePolicy = await readFile(
      path.join(outputDirectory, 'core-policy.mdx'),
      'utf8'
    )
    assert.match(
      corePolicy,
      /^description: "Governance policy functions and types from @primitree\/core\/policy\."$/mu
    )
    assert.match(corePolicy, /\[`TokenId`\]\(\/docs\/api\/core#tokenid-5\)/u)

    const dtcg = await readFile(path.join(outputDirectory, 'dtcg.mdx'), 'utf8')
    assert.match(dtcg, /\bcreateDTCGGraphFragment\b/u)
    assert.match(dtcg, /\bDTCGGraphFragmentOptions\b/u)
    assert.match(dtcg, /^### DTCGColorComponent$/mu)
    assert.match(dtcg, /^### DTCGColorSpace$/mu)
    assert.match(dtcg, /^### DTCGColorValue$/mu)
    assert.match(dtcg, /^### DTCGCubicBezierValue$/mu)
    assert.match(dtcg, /\bDTCGFontFamilyValue\b/u)
    assert.match(dtcg, /\bDTCGFontWeightValue\b/u)
    assert.match(dtcg, /\bbuildDTCGOutputs\b/u)
    assert.match(dtcg, /\bDTCGOutputSet\b/u)
    assert.match(dtcg, /\bDTCGOutputCapabilityError\b/u)
    assert.doesNotMatch(dtcg, /\btoGraphFragment\b/u)
    assert.doesNotMatch(dtcg, /\bDTCGGraphOptions\b/u)
  } finally {
    await rm(outputDirectory, { recursive: true, force: true })
  }
})
