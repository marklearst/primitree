import fs from 'node:fs/promises'
import path from 'node:path'
import { diffVariables, formatDiffMarkdown } from '@figmavars/core'
import { getBooleanFlag, getStringFlag, type ParsedArgs } from '../args'
import { readJsonFile } from '../io'

export const diffHelp = `
figma-vars diff — semantic changelog between two Figma variables exports

Matches by stable Figma IDs, so renames are reported as renames rather than
remove+add. Breaking changes (removals, renames, moves, type changes) are
called out explicitly.

Usage:
  figma-vars diff <old.json> <new.json> [options]

Options:
  --json                 Output the raw diff as JSON instead of Markdown
  --out <file>           Write output to a file instead of stdout
  --fail-on-breaking     Exit with code 2 when breaking changes are found

Examples:
  figma-vars diff backup/variables.json variables.json
  figma-vars diff old.json new.json --fail-on-breaking   # CI gate
`

export async function runDiff(args: ParsedArgs): Promise<void> {
  const [oldPath, newPath] = args.positionals
  if (!oldPath || !newPath) {
    throw new Error('Usage: figma-vars diff <old.json> <new.json>')
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
