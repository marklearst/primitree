import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from '@modelcontextprotocol/sdk/client/stdio.js'
import { afterEach, describe, expect, it } from 'vitest'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const libraryEntry = path.join(packageDirectory, 'dist/index.js')
const cliEntry = path.join(packageDirectory, 'dist/cli.js')
const fixturePath = path.join(
  packageDirectory,
  'tests/fixtures/local-variables.json'
)
const packageManifest = JSON.parse(
  await fs.readFile(path.join(packageDirectory, 'package.json'), 'utf8')
) as { version: string; bin: Record<string, string> }

describe('built package entrypoints', () => {
  const temporaryDirectories: string[] = []

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map(directory => fs.rm(directory, { recursive: true, force: true }))
    )
  })

  it('imports safely from a consumer dist/index.js entrypoint', async () => {
    const consumerDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'primitree-mcp-consumer-')
    )
    temporaryDirectories.push(consumerDirectory)
    const consumerEntry = path.join(consumerDirectory, 'dist/index.js')
    await fs.mkdir(path.dirname(consumerEntry), { recursive: true })
    await fs.writeFile(
      consumerEntry,
      `import ${JSON.stringify(pathToFileURL(libraryEntry).href)}\n`
    )

    const result = spawnSync(process.execPath, [consumerEntry], {
      encoding: 'utf8',
    })

    expect(result.error).toBeUndefined()
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('prints factual executable help', () => {
    const result = spawnSync(process.execPath, [cliEntry, '--help'], {
      encoding: 'utf8',
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain(
      'primitree-mcp: serve design tokens over MCP'
    )
    expect(result.stdout).toMatch(
      /a directory containing\s+tokens\.resolver\.json and \*\.tokens\.json/u
    )
    expect(result.stdout).toMatch(
      /a 'primitree build' directory\s+with those files under tokens\//u
    )
    expect(result.stdout).toContain('PRIMITREE_TOKENS')
    expect(result.stdout).not.toMatch(/[—]/)
  })

  it(
    'initializes the built executable and lists its tools over stdio',
    { timeout: 10_000 },
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [cliEntry, '--tokens', fixturePath],
        stderr: 'pipe',
      })
      const client = new Client({
        name: 'primitree-mcp-integration-test',
        version: '1.0.0',
      })

      try {
        await client.connect(transport)
        expect(client.getServerVersion()).toEqual({
          name: 'primitree',
          version: packageManifest.version,
        })

        const tools = await client.listTools()
        expect(tools.tools.map(tool => tool.name).sort()).toEqual([
          'diff_tokens',
          'get_token',
          'list_collections',
          'resolve_context',
          'search_tokens',
        ])
        expect(
          Object.fromEntries(
            tools.tools.map(tool => [tool.name, tool.description])
          )
        ).toEqual({
          diff_tokens:
            'Compare two Figma variables JSON files by stable IDs and return a Markdown report of collection, mode, variable, type, value, and description changes.',
          get_token:
            'Return the DTCG token at a dot path with its resolved value, CSS value, and CSS variable reference. Include Figma extension data for tokens that define it.',
          list_collections:
            'Return top-level token group names, token counts, resolver contexts, and the source path.',
          resolve_context:
            'Resolve token values for the selected contexts. Returns up to the requested limit with CSS values, plus the total count and truncation state.',
          search_tokens:
            'Find a substring in token paths and descriptions. An optional DTCG $type filter narrows the results.',
        })
        expect(
          Object.fromEntries(tools.tools.map(tool => [tool.name, tool.title]))
        ).toEqual({
          diff_tokens: 'Diff two variables exports',
          get_token: 'Get one design token',
          list_collections: 'List token collections',
          resolve_context: 'Resolve tokens for a context',
          search_tokens: 'Search design tokens',
        })

        const byName = Object.fromEntries(
          tools.tools.map(tool => [tool.name, tool])
        )
        const resolveLimit = byName.resolve_context?.inputSchema.properties
          ?.limit as { description?: string } | undefined
        const searchLimit = byName.search_tokens?.inputSchema.properties
          ?.limit as { description?: string } | undefined

        expect(resolveLimit?.description).toBe(
          'Maximum number of tokens to return. Defaults to 500.'
        )
        expect(searchLimit?.description).toBe(
          'Maximum number of matches to return. Defaults to 50.'
        )
      } finally {
        await client.close()
      }
    }
  )

  it(
    'starts the built executable from PRIMITREE_TOKENS',
    { timeout: 10_000 },
    async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [cliEntry],
        env: {
          ...getDefaultEnvironment(),
          PRIMITREE_TOKENS: fixturePath,
        },
        stderr: 'pipe',
      })
      const client = new Client({
        name: 'primitree-mcp-environment-test',
        version: '1.0.0',
      })

      try {
        await client.connect(transport)
        expect(client.getServerVersion()).toEqual({
          name: 'primitree',
          version: packageManifest.version,
        })

        const tools = await client.listTools()
        expect(tools.tools.map(tool => tool.name).sort()).toEqual([
          'diff_tokens',
          'get_token',
          'list_collections',
          'resolve_context',
          'search_tokens',
        ])
      } finally {
        await client.close()
      }
    }
  )

  it('publishes the Primitree MCP bin', () => {
    expect(packageManifest.bin).toEqual({
      'primitree-mcp': './dist/cli.js',
    })
  })
})
