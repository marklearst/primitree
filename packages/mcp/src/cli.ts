#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer, loadTokenSource } from './index'

const HELP = `
primitree-mcp: serve design tokens over MCP

Usage:
  primitree-mcp --tokens <path>

  <path> is a Figma variables JSON file, a directory containing
  tokens.resolver.json and *.tokens.json, or a 'primitree build' directory
  with those files under tokens/.
  Omit --tokens to read the path from PRIMITREE_TOKENS.

Example MCP client config:
  {
    "mcpServers": {
      "design-tokens": {
        "command": "npx",
        "args": ["-y", "@primitree/mcp", "--tokens", "./variables.json"]
      }
    }
  }

Tools: list_collections, get_token, resolve_context, search_tokens, diff_tokens
`

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP)
    return
  }
  const flagIndex = argv.indexOf('--tokens')
  const sourcePath =
    (flagIndex !== -1 ? argv[flagIndex + 1] : undefined) ??
    process.env.PRIMITREE_TOKENS
  if (!sourcePath) {
    console.error('Missing --tokens <path> (or PRIMITREE_TOKENS env var)')
    console.error(HELP)
    process.exitCode = 1
    return
  }

  const source = await loadTokenSource(sourcePath)
  const server = await createServer(source)
  await server.connect(new StdioServerTransport())
  console.error(
    `primitree-mcp serving tokens from ${source.origin} (stdio transport)`
  )
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
