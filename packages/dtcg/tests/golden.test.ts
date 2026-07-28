import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { toDTCG } from '../src/emit'

/**
 * Golden-file test: the serialized DTCG output for the reference fixture is
 * committed under tests/goldens. Any change to the emitter that alters the
 * output must update the goldens intentionally:
 *
 *   UPDATE_GOLDENS=1 pnpm --filter @primitree/dtcg test
 */
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/local-variables.json'), 'utf8')
)
const goldenDir = join(__dirname, 'goldens')

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

describe('golden files', () => {
  const result = toDTCG(fixture, { resolverName: 'Golden Fixture' })
  const outputs: Record<string, string> = {}
  for (const [name, doc] of Object.entries(result.files)) {
    outputs[name] = serialize(doc)
  }
  outputs[result.resolverFileName] = serialize(result.resolver)

  if (process.env.UPDATE_GOLDENS === '1') {
    it('updates golden files', () => {
      mkdirSync(goldenDir, { recursive: true })
      for (const [name, contents] of Object.entries(outputs)) {
        writeFileSync(join(goldenDir, name), contents, 'utf8')
      }
      expect(true).toBe(true)
    })
    return
  }

  it('goldens exist (run UPDATE_GOLDENS=1 to create)', () => {
    expect(existsSync(goldenDir)).toBe(true)
  })

  for (const name of [
    'primitives.tokens.json',
    'semantic.tokens.json',
    'semantic.dark.tokens.json',
    'density.tokens.json',
    'density.compact.tokens.json',
    'tokens.resolver.json',
  ]) {
    it(`matches golden ${name}`, () => {
      const golden = readFileSync(join(goldenDir, name), 'utf8')
      expect(outputs[name]).toBe(golden)
    })
  }
})
