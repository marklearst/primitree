#!/usr/bin/env node

import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTableOfContents } from 'fumadocs-core/content/toc'

const docsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const repositoryRoot = path.resolve(docsRoot, '../..')
const defaultOutputDirectory = path.join(docsRoot, 'content/docs/api')

const MODULES = [
  {
    slug: 'core',
    entryPoint: 'packages/core/src/index.ts',
    title: 'Core API',
    description: '@primitree/core functions and types.',
  },
  {
    slug: 'core-types',
    generatedPath: 'core/src/types.mdx',
    entryPoint: 'packages/core/src/types/index.ts',
    title: 'Core types API',
    description: 'Figma domain and mutation types from @primitree/core/types.',
  },
  {
    slug: 'core-policy',
    generatedPath: 'core/src/policy.mdx',
    entryPoint: 'packages/core/src/policy/index.ts',
    title: 'Core policy API',
    description:
      'Governance policy functions and types from @primitree/core/policy.',
  },
  {
    slug: 'dtcg',
    entryPoint: 'packages/dtcg/src/index.ts',
    title: 'DTCG API',
    description: '@primitree/dtcg functions and types.',
  },
  {
    slug: 'cli-config',
    generatedPath: 'cli/src/config.mdx',
    entryPoint: 'packages/cli/src/config.ts',
    title: 'CLI config API',
    description: 'Typed project configuration from @primitree/cli/config.',
  },
  {
    slug: 'hooks',
    entryPoint: 'packages/hooks/src/index.ts',
    title: 'React hooks API',
    description: '@primitree/hooks React providers and hooks.',
  },
  {
    slug: 'mcp',
    entryPoint: 'packages/mcp/src/index.ts',
    title: 'MCP API',
    description: 'Server and token-source exports from @primitree/mcp.',
  },
]

export const API_PAGE_ORDER = Object.freeze([
  'index',
  ...MODULES.map(module => module.slug),
])

const GENERATED_MDX_LINK = /\]\(([^\s)#]+)\.mdx(#[^)]+)?\)/gu
const GENERATED_PAGE_SLUGS = new Map([
  ['index', 'index'],
  ...MODULES.map(module => [
    (module.generatedPath ?? `${module.slug}.mdx`).replace(/\.mdx$/u, ''),
    module.slug,
  ]),
])

function frontmatter({ title, description }) {
  return `---
title: ${JSON.stringify(title)}
description: ${JSON.stringify(description)}
---

`
}

function indexPage() {
  return `${frontmatter({
    title: 'API reference',
    description: 'Functions and types from the Primitree packages.',
  })}Choose a package entry point:

- [Core API](/docs/api/core): Figma Variables types, REST helpers, normalization, alias resolution, and diffs.
- [Core types API](/docs/api/core-types): Figma domain and mutation types.
- [Core policy API](/docs/api/core-policy): Governance layers, ownership, value rules, and policy findings.
- [DTCG API](/docs/api/dtcg): DTCG conversion, Resolver handling, and output emitters.
- [CLI config API](/docs/api/cli-config): Typed local sources, architecture rules, ownership, and build outputs.
- [React hooks API](/docs/api/hooks): React 19 providers and hooks.
- [MCP API](/docs/api/mcp): MCP server and token-source functions.
`
}

function headingFragments(source) {
  const fragments = new Map()

  for (const heading of getTableOfContents(source)) {
    const base = heading.url.replace(/^#/u, '').replace(/-\d+$/u, '')
    const current = fragments.get(base)

    if (!current || heading.depth < current.depth) {
      fragments.set(base, { ...heading, ambiguous: false })
    } else if (heading.depth === current.depth && heading.url !== current.url) {
      fragments.set(base, { ...current, ambiguous: true })
    }
  }

  return new Map(
    [...fragments].map(([base, heading]) => [
      base,
      heading.ambiguous ? null : heading.url,
    ])
  )
}

function rewriteGeneratedLinks(source, sourcePath, headingFragmentsByPage) {
  return source.replace(GENERATED_MDX_LINK, (_match, target, fragment) => {
    const generatedTarget = path.posix.normalize(
      path.posix.join(path.posix.dirname(sourcePath), target)
    )
    const targetSlug = GENERATED_PAGE_SLUGS.get(generatedTarget)

    if (!targetSlug) {
      throw new Error(
        `TypeDoc linked from ${sourcePath} to an unexpected page: ${target}.mdx`
      )
    }

    let resolvedFragment = ''

    if (fragment) {
      const fragmentBase = fragment.replace(/^#/u, '').replace(/-\d+$/u, '')
      resolvedFragment =
        headingFragmentsByPage.get(generatedTarget)?.get(fragmentBase) ?? ''

      if (!resolvedFragment) {
        throw new Error(
          `TypeDoc linked from ${sourcePath} to a missing heading: ${target}.mdx${fragment}`
        )
      }
    }

    const route =
      targetSlug === 'index' ? '/docs/api' : `/docs/api/${targetSlug}`
    return `](${route}${resolvedFragment})`
  })
}

function typeDocOptions(outputDirectory) {
  return {
    name: 'Primitree API',
    entryPoints: MODULES.map(module =>
      path.join(repositoryRoot, module.entryPoint)
    ),
    entryPointStrategy: 'resolve',
    tsconfig: path.join(docsRoot, 'tsconfig.typedoc.json'),
    out: outputDirectory,
    plugin: ['typedoc-plugin-markdown'],
    router: 'module',
    fileExtension: '.mdx',
    entryFileName: 'index',
    readme: 'none',
    cleanOutputDir: true,
    githubPages: false,
    hideGenerator: true,
    hidePageHeader: true,
    hidePageTitle: true,
    hideBreadcrumbs: true,
    disableSources: true,
    sanitizeComments: true,
    includeVersion: false,
    sort: ['source-order'],
    sortEntryPoints: false,
    excludeInternal: true,
    excludeExternals: true,
    excludePrivate: true,
    excludeProtected: true,
    validation: {
      invalidLink: true,
      invalidPath: true,
      notDocumented: true,
      notExported: true,
      rewrittenLink: true,
      unusedMergeModuleWith: true,
    },
    packagesRequiringDocumentation: [
      '@primitree/core',
      '@primitree/cli',
      '@primitree/dtcg',
      '@primitree/hooks',
      '@primitree/mcp',
    ],
    requiredToBeDocumented: [
      'Module',
      'Enum',
      'Variable',
      'Function',
      'Class',
      'Interface',
      'Accessor',
      'TypeAlias',
    ],
    intentionallyNotExported: [
      'TemporaryId',
      'ChangeId',
      'VariableMutableFields',
      'RootCollectionCreate',
      'ExtendedCollectionCreate',
    ],
    treatValidationWarningsAsErrors: true,
    treatWarningsAsErrors: true,
  }
}

async function listGeneratedMdxFiles(directory, relative = '') {
  const entries = await readdir(path.join(directory, relative), {
    withFileTypes: true,
  })
  const files = []

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const entryPath = path.posix.join(relative, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listGeneratedMdxFiles(directory, entryPath)))
    } else if (entry.name.endsWith('.mdx')) {
      files.push(entryPath)
    }
  }

  return files
}

async function addPageMetadata(outputDirectory) {
  const generatedFiles = (await listGeneratedMdxFiles(outputDirectory)).sort()
  const expectedFiles = [
    'index.mdx',
    ...MODULES.map(module => module.generatedPath ?? `${module.slug}.mdx`),
  ].sort()

  if (JSON.stringify(generatedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `Unexpected TypeDoc page set. Expected ${expectedFiles.join(', ')}; received ${generatedFiles.join(', ')}.`
    )
  }

  const generatedSources = new Map()

  for (const module of MODULES) {
    const generatedPath = module.generatedPath ?? `${module.slug}.mdx`
    generatedSources.set(
      generatedPath.replace(/\.mdx$/u, ''),
      await readFile(path.join(outputDirectory, generatedPath), 'utf8')
    )
  }

  const headingFragmentsByPage = new Map(
    [...generatedSources].map(([generatedPath, source]) => [
      generatedPath,
      headingFragments(source),
    ])
  )

  for (const module of MODULES) {
    const generatedPath = module.generatedPath ?? `${module.slug}.mdx`
    const source = generatedSources.get(generatedPath.replace(/\.mdx$/u, ''))
    await writeFile(
      path.join(outputDirectory, `${module.slug}.mdx`),
      `${frontmatter(module)}${rewriteGeneratedLinks(source, generatedPath, headingFragmentsByPage).trimStart()}`
    )
  }

  const generatedArtifacts = new Set(
    MODULES.map(module => module.generatedPath)
      .filter(Boolean)
      .map(generatedPath => generatedPath.split('/')[0])
  )
  await Promise.all(
    [...generatedArtifacts].map(artifact =>
      rm(path.join(outputDirectory, artifact), {
        recursive: true,
        force: true,
      })
    )
  )

  await writeFile(path.join(outputDirectory, 'index.mdx'), indexPage())
  await writeFile(
    path.join(outputDirectory, 'meta.json'),
    `${JSON.stringify(
      {
        title: 'API reference',
        pages: API_PAGE_ORDER,
      },
      null,
      2
    )}\n`
  )
}

export async function generateApiReference({
  outputDirectory = defaultOutputDirectory,
} = {}) {
  const { Application } = await import('typedoc')
  const app = await Application.bootstrapWithPlugins(
    typeDocOptions(outputDirectory)
  )
  const project = await app.convert()

  if (!project) {
    throw new Error(
      'TypeDoc could not convert the public package entry points.'
    )
  }

  await app.generateOutputs(project)
  await addPageMetadata(outputDirectory)
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await generateApiReference()
}
