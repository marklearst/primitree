import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Reads the published primitree package version at build time. */
export function readPrimitreeVersion(): string {
  const packagePath = resolve(
    process.cwd(),
    '../../packages/primitree/package.json'
  )
  const parsed: unknown = JSON.parse(readFileSync(packagePath, 'utf8'))
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    typeof parsed.version !== 'string'
  ) {
    throw new Error('The primitree package manifest has no version field.')
  }
  return parsed.version
}
