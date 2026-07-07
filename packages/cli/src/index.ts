#!/usr/bin/env node
import { parseArgs } from './args'
import { runExport, exportHelp } from './commands/export'
import { runBuild, buildHelp } from './commands/build'
import { runDiff, diffHelp } from './commands/diff'
import { runCheck, checkHelp } from './commands/check'
import { runInit, initHelp } from './commands/init'

const GLOBAL_HELP = `
figma-vars — turn Figma variables into a production design token pipeline

Usage:
  figma-vars <command> [options]

Commands:
  build    Build a DTCG token pipeline from a variables JSON
  diff     Semantic changelog between two variables exports
  check    Validate a variables export or a built tokens directory
  init     Scaffold a tokens repo (sample data or --from your export)
  export   Download variables JSON via the Figma REST API (Enterprise)

Run 'figma-vars <command> --help' for command-specific options.

Docs: https://github.com/marklearst/figma-vars-hooks
`

const commands: Record<
  string,
  { run: (args: ReturnType<typeof parseArgs>) => Promise<void>; help: string }
> = {
  export: { run: runExport, help: exportHelp },
  build: { run: runBuild, help: buildHelp },
  diff: { run: runDiff, help: diffHelp },
  check: { run: runCheck, help: checkHelp },
  init: { run: runInit, help: initHelp },
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const commandName = argv[0]
  const rest = parseArgs(argv.slice(1))

  if (commandName === undefined || commandName === 'help') {
    console.log(GLOBAL_HELP)
    return
  }

  const command = commands[commandName]
  if (!command) {
    console.log(GLOBAL_HELP)
    console.error(`Unknown command: ${commandName}`)
    process.exitCode = 1
    return
  }

  if (rest.flags['help'] === true) {
    console.log(command.help)
    return
  }

  await command.run(rest)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
