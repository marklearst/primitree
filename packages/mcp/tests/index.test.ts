import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
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
) as { version: string }

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
      path.join(os.tmpdir(), 'figma-vars-mcp-consumer-')
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
        name: 'figma-vars-mcp-integration-test',
        version: '1.0.0',
      })

      try {
        await client.connect(transport)
        expect(client.getServerVersion()).toEqual({
          name: 'figma-vars',
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
})
