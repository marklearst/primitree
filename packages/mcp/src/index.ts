#!/usr/bin/env node
import fs from 'node:fs/promises'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { loadTokenSource, type TokenSource } from './source'
import {
  diffTokens,
  getToken,
  listCollections,
  resolveContext,
  searchTokens,
} from './tools'

export { loadTokenSource } from './source'
export type { TokenSource } from './source'
export * from './tools'

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
        "args": ["-y", "@figma-vars/mcp", "--tokens", "./variables.json"]
      }
    }
  }

Tools: list_collections, get_token, resolve_context, search_tokens, diff_tokens
`

const contextsSchema = z
  .record(z.string(), z.string())
  .optional()
  .describe(
    'Context per modifier axis, e.g. {"semantic":"dark"}. Omitted axes use their defaults.'
  )

function jsonContent(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  }
}

export async function createServer(source: TokenSource): Promise<McpServer> {
  const server = new McpServer({
    name: 'figma-vars',
    version: '5.0.0',
  })

  server.registerTool(
    'list_collections',
    {
      title: 'List token collections',
      description:
        'List the design token collections (top-level groups), token counts, and available theme contexts (Figma modes).',
      inputSchema: {},
    },
    async () => jsonContent(listCollections(source))
  )

  server.registerTool(
    'get_token',
    {
      title: 'Get one design token',
      description:
        'Get a design token by dot path (e.g. "semantic.color.bg.brand"): its raw DTCG token, resolved value, CSS form, var() accessor, and Figma metadata.',
      inputSchema: {
        path: z
          .string()
          .describe('Dot-joined token path, e.g. "semantic.color.bg.brand"'),
        contexts: contextsSchema,
      },
    },
    async ({ path, contexts }) => jsonContent(getToken(source, path, contexts))
  )

  server.registerTool(
    'resolve_context',
    {
      title: 'Resolve all tokens for a context',
      description:
        'Resolve every token value under a context selection (e.g. dark mode). Returns CSS-formatted values.',
      inputSchema: {
        contexts: z
          .record(z.string(), z.string())
          .describe('Context per axis, e.g. {"semantic":"dark"}'),
        limit: z.number().int().positive().max(2000).optional(),
      },
    },
    async ({ contexts, limit }) =>
      jsonContent(resolveContext(source, contexts, limit ?? 500))
  )

  server.registerTool(
    'search_tokens',
    {
      title: 'Search design tokens',
      description:
        'Search tokens by substring across paths and descriptions, optionally filtered by $type (color, dimension, fontFamily, ...).',
      inputSchema: {
        query: z.string().describe('Substring to search for'),
        type: z
          .string()
          .optional()
          .describe('Filter by DTCG $type, e.g. "color"'),
        contexts: contextsSchema,
        limit: z.number().int().positive().max(500).optional(),
      },
    },
    async ({ query, type, contexts, limit }) =>
      jsonContent(searchTokens(source, query, type, contexts, limit ?? 50))
  )

  server.registerTool(
    'diff_tokens',
    {
      title: 'Diff two variables exports',
      description:
        'Semantic Markdown changelog between two Figma variables exports (renames detected by stable ID, per-mode value changes, breaking-change callouts).',
      inputSchema: {
        oldPath: z.string().describe('Path to the older variables.json'),
        newPath: z.string().describe('Path to the newer variables.json'),
      },
    },
    async ({ oldPath, newPath }) => {
      const [oldJson, newJson] = await Promise.all([
        fs.readFile(oldPath, 'utf8').then(JSON.parse),
        fs.readFile(newPath, 'utf8').then(JSON.parse),
      ])
      return {
        content: [
          { type: 'text' as const, text: diffTokens(oldJson, newJson) },
        ],
      }
    }
  )

  return server
}

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
    process.exit(1)
  }

  const source = await loadTokenSource(sourcePath)
  const server = await createServer(source)
  await server.connect(new StdioServerTransport())
  console.error(
    `figma-vars-mcp serving tokens from ${source.origin} (stdio transport)`
  )
}

// Only start the stdio server when executed as a binary, not when imported.
const isDirectRun =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('figma-vars-mcp') ||
    process.argv[1].endsWith('dist/index.js') ||
    process.argv[1].endsWith('src/index.ts'))

if (isDirectRun) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
