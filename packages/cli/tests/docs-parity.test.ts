import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildHelp } from '../src/commands/build'
import { checkHelp } from '../src/commands/check'
import { diffHelp } from '../src/commands/diff'
import { exportHelp } from '../src/commands/export'
import { initHelp } from '../src/commands/init'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')
const commands = [
  ['build', buildHelp],
  ['check', checkHelp],
  ['diff', diffHelp],
  ['export', exportHelp],
  ['init', initHelp],
] as const

function options(text: string): string[] {
  return [
    ...text.matchAll(
      /(?<![A-Za-z0-9-])(--[A-Za-z][A-Za-z-]*)(?=$|[\s,=`<>[\]()])/gm
    ),
  ].map(match => match[1] as string)
}

function matchingFiles(
  directory: string,
  matches: (fileName: string) => boolean
): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap(entry => {
      const entryPath = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        return matchingFiles(entryPath, matches)
      }
      return entry.isFile() && matches(entry.name) ? [entryPath] : []
    })
    .sort()
}

function markdownFiles(directory: string): string[] {
  return matchingFiles(directory, fileName => /\.(md|mdx)$/.test(fileName))
}

function readmeFiles(directory: string): string[] {
  return matchingFiles(directory, fileName => fileName === 'README.md')
}

function obsoleteCliOptions(text: string): string[] {
  const obsolete = new Set(['--build', '--markdown'])
  return [...new Set(options(text).filter(option => obsolete.has(option)))]
}

function withoutHooksMigration(text: string): string {
  const migrationHeading = /^##[ \t]+Migrating from 4\.x[ \t]*\r?$/m.exec(text)
  if (!migrationHeading || migrationHeading.index === undefined) {
    return text
  }

  const afterHeading = migrationHeading.index + migrationHeading[0].length
  const nextHeadingOffset = text.slice(afterHeading).search(/^##(?!#)[ \t]+/m)
  const sectionEnd =
    nextHeadingOffset === -1 ? text.length : afterHeading + nextHeadingOffset

  return `${text.slice(0, migrationHeading.index)}${text.slice(sectionEnd)}`
}

const formerHooksPackage = ['@figma', 'vars/hooks'].join('-')

const docsRoot = resolve(root, 'apps/docs/content/docs')
const workspaceReadmePaths = ['apps', 'packages'].flatMap(directory =>
  readmeFiles(resolve(root, directory)).map(file =>
    relative(root, file).split(sep).join('/')
  )
)
const publicMarkdownPaths = [
  'README.md',
  ...workspaceReadmePaths,
  'docs/launch/announcement.md',
  ...markdownFiles(docsRoot).map(file =>
    relative(root, file).split(sep).join('/')
  ),
]

describe('parity guard regressions', () => {
  it.each([
    {
      name: 'multiline direct init',
      text: 'primitree init project \\\n  --build',
      option: '--build',
    },
    {
      name: 'single-line npx init',
      text: 'npx @primitree/cli init project --build',
      option: '--build',
    },
    {
      name: 'multiline direct diff',
      text: 'primitree diff old.json new.json \\\n  --markdown',
      option: '--markdown',
    },
    {
      name: 'single-line npx diff',
      text: 'npx @primitree/cli diff old.json new.json --markdown',
      option: '--markdown',
    },
  ])('detects obsolete options in $name commands', ({ text, option }) => {
    expect(obsoleteCliOptions(text)).toContain(option)
  })

  it.each([
    {
      name: 'obsolete build',
      text: 'primitree init project --build=true',
      option: '--build',
    },
    {
      name: 'obsolete markdown',
      text: 'primitree diff old.json new.json --markdown=true',
      option: '--markdown',
    },
    {
      name: 'value option',
      text: 'primitree build variables.json --out=dist',
      option: '--out',
    },
    {
      name: 'hyphenated alias',
      text: 'primitree export --file-key=abc',
      option: '--file-key',
    },
    {
      name: 'camel-case alias',
      text: 'primitree export --fileKey=abc',
      option: '--fileKey',
    },
  ])('tokenizes $name in equals form', ({ text, option }) => {
    expect(options(text)).toContain(option)
  })

  it('does not treat equals-form substrings as obsolete options', () => {
    expect(obsoleteCliOptions('not--build=true --builder=true')).toEqual([])
  })

  it('covers every intended public Markdown surface', () => {
    expect(publicMarkdownPaths).toEqual(
      expect.arrayContaining([
        'README.md',
        'docs/launch/announcement.md',
        ...workspaceReadmePaths,
      ])
    )

    for (const file of markdownFiles(docsRoot)) {
      expect(publicMarkdownPaths).toContain(
        relative(root, file).split(sep).join('/')
      )
    }
  })

  it('keeps post-migration hooks README sections in the scanned text', () => {
    const readme = `# Hooks

Current documentation.

## Migrating from 4.x

Replace ${formerHooksPackage} with @primitree/hooks.

## License

Later text containing ${formerHooksPackage} must still be scanned.
`

    const withoutMigration = withoutHooksMigration(readme)
    expect(withoutMigration).not.toContain(
      `Replace ${formerHooksPackage} with @primitree/hooks.`
    )
    expect(withoutMigration).toContain(
      `Later text containing ${formerHooksPackage} must still be scanned.`
    )
  })
})

for (const [command, help] of commands) {
  it(`${command} docs expose exactly the implemented options`, () => {
    const page = readFileSync(
      resolve(root, `apps/docs/content/docs/cli/${command}.mdx`),
      'utf8'
    )
    expect(new Set(options(page))).toEqual(new Set(options(help)))
  })
}

describe('maintained examples', () => {
  const publicMarkdown = publicMarkdownPaths.map(path => ({
    path,
    text: readFileSync(resolve(root, path), 'utf8'),
  }))
  const maintained = publicMarkdown.map(document => document.text).join('\n')

  it('contains no obsolete CLI switches', () => {
    expect(obsoleteCliOptions(maintained)).toEqual([])
  })

  it('uses old then new order for semantic diffs', () => {
    expect(maintained).toMatch(
      /\b[a-z-]+ diff backup\/variables\.json variables\.json/
    )
    expect(maintained).not.toMatch(
      /\b[a-z-]+ diff variables\.json backup\/variables\.json/
    )
  })

  it('does not revive the legacy namespace outside migration guidance', () => {
    const namespaceCorpus = publicMarkdown
      .filter(
        document =>
          document.path !== 'apps/docs/content/docs/hooks/migration.mdx'
      )
      .map(document =>
        document.path === 'packages/hooks/README.md'
          ? withoutHooksMigration(document.text)
          : document.text
      )
      .join('\n')
    expect(namespaceCorpus).not.toContain(['@figma', 'vars/'].join('-'))
  })
})
