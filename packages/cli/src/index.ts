#!/usr/bin/env node
import { parseArgs } from './args'
import { runExport, exportHelp } from './commands/export'

const GLOBAL_HELP = `
figma-vars — turn Figma variables into a production design token pipeline

Usage:
  figma-vars <command> [options]

Commands:
  export   Download Figma variables JSON via the REST API (Enterprise)
  build    Build a DTCG token pipeline from a variables JSON (coming in v5)
  diff     Semantic diff between two variables exports (coming in v5)
  check    Validate a variables export or DTCG output (coming in v5)
  init     Scaffold a tokens repo (coming in v5)

Run 'figma-vars <command> --help' for command-specific options.
`

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const command = argv[0]
  const rest = parseArgs(argv.slice(1))
  const wantsHelp = rest.flags['help'] === true || command === undefined

  switch (command) {
    case 'export':
      if (rest.flags['help'] === true) {
        console.log(exportHelp)
        return
      }
      await runExport(rest)
      return
    default:
      console.log(GLOBAL_HELP)
      if (!wantsHelp && command !== 'help') {
        console.error(`Unknown command: ${command}`)
        process.exitCode = 1
      }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
