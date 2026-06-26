#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
    description: 'Functions and types exported by @figmavars/core.',
  },
  {
    slug: 'dtcg',
    entryPoint: 'packages/dtcg/src/index.ts',
    title: 'DTCG API',
    description: 'Functions and types exported by @figmavars/dtcg.',
  },
  {
    slug: 'hooks',
    entryPoint: 'packages/hooks/src/index.ts',
    title: 'React hooks API',
    description: 'React providers and hooks exported by @figmavars/hooks.',
  },
  {
    slug: 'hooks-core',
    entryPoint: 'packages/hooks/src/core/index.ts',
    title: 'Hooks compatibility API',
    description:
      'The compatibility exports available from @figmavars/hooks/core.',
  },
  {
    slug: 'mcp',
    entryPoint: 'packages/mcp/src/index.ts',
    title: 'MCP API',
    description: 'Server and token-source exports from @figmavars/mcp.',
  },
]

export const API_PAGE_ORDER = Object.freeze([
  'index',
  ...MODULES.map(module => module.slug),
])

const GENERATED_MDX_LINK = /\]\((?:\.\/)?([a-z0-9-]+)\.mdx(?=(?:#[^)]+)?\))/gu

function frontmatter({ title, description }) {
  return `---
title: ${title}
description: ${description}
---

`
}

function indexPage() {
  return `${frontmatter({
    title: 'API reference',
    description: 'Functions and types exported by the FigmaVars packages.',
  })}Choose a package entry point:

- [Core API](./core): Figma Variables types, REST helpers, normalization, alias resolution, and diffs.
- [DTCG API](./dtcg): DTCG conversion, Resolver handling, and output emitters.
- [React hooks API](./hooks): React 19 providers and hooks.
- [Hooks compatibility API](./hooks-core): the non-React compatibility path.
- [MCP API](./mcp): MCP server and token-source functions.
`
}

function rewriteGeneratedLinks(source) {
  const allowedTargets = new Set(API_PAGE_ORDER)

  return source.replace(GENERATED_MDX_LINK, (_match, target) => {
    if (!allowedTargets.has(target)) {
      throw new Error(`TypeDoc linked to an unexpected page: ${target}.mdx`)
    }

    return `](./${target}`
  })
}

function typeDocOptions(outputDirectory) {
  return {
    name: 'FigmaVars API',
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
      '@figmavars/core',
      '@figmavars/dtcg',
      '@figmavars/hooks',
      '@figmavars/mcp',
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

async function addPageMetadata(outputDirectory) {
  const generatedFiles = (await readdir(outputDirectory))
    .filter(file => file.endsWith('.mdx'))
    .sort()
  const expectedFiles = [
    'core.mdx',
    'dtcg.mdx',
    'hooks-core.mdx',
    'hooks.mdx',
    'index.mdx',
    'mcp.mdx',
  ]

  if (JSON.stringify(generatedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      `Unexpected TypeDoc page set. Expected ${expectedFiles.join(', ')}; received ${generatedFiles.join(', ')}.`
    )
  }

  for (const module of MODULES) {
    const file = path.join(outputDirectory, `${module.slug}.mdx`)
    const source = await readFile(file, 'utf8')
    await writeFile(
      file,
      `${frontmatter(module)}${rewriteGeneratedLinks(source).trimStart()}`
    )
  }

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
