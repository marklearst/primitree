/**
 * Minimal, dependency-free argument parsing for the Primitree CLI.
 *
 * Supports `--flag value`, `--flag=value`, boolean flags, and positional args.
 */
export interface ParsedArgs {
  positionals: string[]
  flags: Record<string, string | boolean>
  duplicateFlags: string[]
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = []
  const flags: Record<string, string | boolean> = {}
  const duplicateFlags: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === undefined) {
      continue
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      const name = arg.slice(2, eq === -1 ? undefined : eq)
      if (Object.hasOwn(flags, name)) {
        duplicateFlags.push(name)
      }
      if (eq !== -1) {
        flags[name] = arg.slice(eq + 1)
      } else {
        const next = argv[i + 1]
        if (next !== undefined && !next.startsWith('--')) {
          flags[name] = next
          i += 1
        } else {
          flags[name] = true
        }
      }
    } else {
      positionals.push(arg)
    }
  }

  return { positionals, flags, duplicateFlags }
}

export function getStringFlag(
  flags: Record<string, string | boolean>,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const value = flags[name]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return undefined
}

export function getBooleanFlag(
  flags: Record<string, string | boolean>,
  ...names: string[]
): boolean {
  for (const name of names) {
    if (flags[name] === true || flags[name] === 'true') {
      return true
    }
  }
  return false
}
