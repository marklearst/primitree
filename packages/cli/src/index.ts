#!/usr/bin/env node
import { parseArgs } from './args'
import { runExport, exportHelp } from './commands/export'
import { runBuild, buildHelp } from './commands/build'
import { runDiff, diffHelp } from './commands/diff'
import { runCheck, checkHelp } from './commands/check'
import { runInspect, inspectHelp } from './commands/inspect'
import { runInit, initHelp } from './commands/init'

const GLOBAL_HELP = `
primitree: build design tokens from Figma variables

Usage:
  primitree <command> [options]

Commands:
  build    Convert variables JSON into token files and code
  diff     Compare configured DTCG files or Figma variables exports
  check    Check a configured DTCG source, Figma export, or built token directory
  inspect  Explain one token from a configured DTCG source
  init     Create a token repository from sample data or an export
  export   Download local variables through the Figma REST API

Run 'primitree <command> --help' for command-specific options.

Docs: https://github.com/marklearst/primitree
`

const commands: Record<
  string,
  { run: (args: ReturnType<typeof parseArgs>) => Promise<void>; help: string }
> = {
  export: { run: runExport, help: exportHelp },
  build: { run: runBuild, help: buildHelp },
  diff: { run: runDiff, help: diffHelp },
  check: { run: runCheck, help: checkHelp },
  inspect: { run: runInspect, help: inspectHelp },
  init: { run: runInit, help: initHelp },
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const commandName = argv[0]
  const rest = parseArgs(argv.slice(1))

  if (
    commandName === undefined ||
    commandName === 'help' ||
    commandName === '--help'
  ) {
    console.log(GLOBAL_HELP)
    return
  }

  const command = commands[commandName]
  if (!command) {
    console.log(GLOBAL_HELP)
    console.error(`Unknown command: ${commandName}`)
    process.exitCode = 2
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
  process.exit(2)
})
