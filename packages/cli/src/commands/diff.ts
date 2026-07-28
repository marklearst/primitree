import fs from 'node:fs/promises'
import path from 'node:path'
import { diffVariables, formatDiffMarkdown } from '@primitree/core'
import { getBooleanFlag, getStringFlag, type ParsedArgs } from '../args'
import { readJsonFile } from '../io'

export const diffHelp = `
primitree diff: compare two Figma variables exports

The command matches stable Figma IDs. It reports renames, removals, moves,
and type changes as breaking changes.

Usage:
  primitree diff <old.json> <new.json> [options]

Options:
  --json                 Output the raw diff as JSON instead of Markdown
  --out <file>           Write output to a file instead of stdout
  --fail-on-breaking     Exit with code 2 after finding breaking changes

Examples:
  primitree diff backup/variables.json variables.json
  primitree diff old.json new.json --fail-on-breaking   # CI gate
`

export async function runDiff(args: ParsedArgs): Promise<void> {
  const [oldPath, newPath] = args.positionals
  if (!oldPath || !newPath) {
    throw new Error('Usage: primitree diff <old.json> <new.json>')
  }

  const [oldJson, newJson] = await Promise.all([
    readJsonFile(oldPath),
    readJsonFile(newPath),
  ])
  const diff = diffVariables(oldJson, newJson)

  const output = getBooleanFlag(args.flags, 'json')
    ? `${JSON.stringify(diff, null, 2)}\n`
    : formatDiffMarkdown(diff)

  const outFile = getStringFlag(args.flags, 'out')
  if (outFile) {
    const target = path.resolve(outFile)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, output, 'utf8')
    console.log(`Wrote diff to ${target}`)
  } else {
    console.log(output)
  }

  if (diff.breaking && getBooleanFlag(args.flags, 'fail-on-breaking')) {
    process.exitCode = 2
  }
}
