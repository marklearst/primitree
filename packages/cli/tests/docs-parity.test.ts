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
      /(?<![A-Za-z0-9-])(--[A-Za-z][A-Za-z-]*)(?=$|[\s,`<>[\]()])/gm
    ),
  ].map(match => match[1] as string)
}

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      return markdownFiles(entryPath)
    }
    return entry.isFile() && /\.(md|mdx)$/.test(entry.name) ? [entryPath] : []
  })
}

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
  const maintained = [
    'packages/cli/README.md',
    'apps/docs/content/docs/cli/index.mdx',
    'apps/docs/content/docs/concepts/diffing.mdx',
    'apps/docs/content/docs/hooks/live-api.mdx',
  ]
    .map(file => readFileSync(resolve(root, file), 'utf8'))
    .join('\n')

  it('contains no obsolete CLI switches', () => {
    expect(maintained).not.toMatch(/figma-vars init[^\n]*--build/)
    expect(maintained).not.toMatch(/figma-vars diff[^\n]*--markdown/)
  })

  it('uses old then new order for semantic diffs', () => {
    expect(maintained).toContain(
      'figma-vars diff backup/variables.json variables.json'
    )
    expect(maintained).not.toContain(
      'figma-vars diff variables.json backup/variables.json'
    )
  })

  it('does not revive the legacy namespace outside migration guidance', () => {
    const hooksReadme = readFileSync(
      resolve(root, 'packages/hooks/README.md'),
      'utf8'
    )
    const currentHooksReadme = hooksReadme.split('## Migrating from 4.x')[0]
    const docsRoot = resolve(root, 'apps/docs/content/docs')
    const docsFiles = markdownFiles(docsRoot)
      .filter(
        file =>
          relative(docsRoot, file).split(sep).join('/') !==
          'hooks/migration.mdx'
      )
      .map(file => readFileSync(file, 'utf8'))
      .join('\n')
    expect(`${maintained}\n${currentHooksReadme}\n${docsFiles}`).not.toContain(
      '@figma-vars/'
    )
  })
})
