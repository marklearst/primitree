#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer, loadTokenSource } from './index'

const HELP = `
figma-vars-mcp — MCP server for your design tokens

Usage:
  figma-vars-mcp --tokens <path>

  <path> is either a Figma variables export (variables.json) or the output
  of 'figma-vars build' (a directory containing tokens/tokens.resolver.json).
  The FIGMA_VARS_TOKENS environment variable is used when --tokens is omitted.

Example MCP client config:
  {
    "mcpServers": {
      "design-tokens": {
        "command": "npx",
        "args": ["-y", "@figmavars/mcp", "--tokens", "./variables.json"]
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
    process.env.FIGMA_VARS_TOKENS
  if (!sourcePath) {
    console.error('Missing --tokens <path> (or FIGMA_VARS_TOKENS env var)')
    console.error(HELP)
    process.exitCode = 1
    return
  }

  const source = await loadTokenSource(sourcePath)
  const server = await createServer(source)
  await server.connect(new StdioServerTransport())
  console.error(
    `figma-vars-mcp serving tokens from ${source.origin} (stdio transport)`
  )
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
