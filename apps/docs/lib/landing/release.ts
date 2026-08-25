import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let cachedVersion: string | undefined

/** Reads the published primitree package version once per process. */
export function readPrimitreeVersion(): string {
  if (cachedVersion !== undefined) {
    return cachedVersion
  }
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
  cachedVersion = parsed.version
  return cachedVersion
}
