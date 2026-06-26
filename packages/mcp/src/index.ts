/**
 * Model Context Protocol tools for reading built design tokens and comparing
 * Figma variables exports.
 *
 * @module mcp
 */
import fs from 'node:fs/promises'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import packageManifest from '../package.json' with { type: 'json' }
import type { TokenSource } from './source'
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

const contextsSchema = z
  .record(z.string(), z.string())
  .optional()
  .describe(
    'Resolver context keyed by modifier axis, for example {"semantic":"dark"}. Omitted axes use their defaults.'
  )

function jsonContent(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  }
}

/**
 * Create an MCP server bound to a token source.
 *
 * The caller connects the returned server to an MCP transport.
 *
 * @public
 */
export async function createServer(source: TokenSource): Promise<McpServer> {
  const server = new McpServer({
    name: 'figma-vars',
    version: packageManifest.version,
  })

  server.registerTool(
    'list_collections',
    {
      title: 'List token collections',
      description:
        'Return top-level token group names, token counts, resolver contexts, and the source path.',
      inputSchema: {},
    },
    async () => jsonContent(listCollections(source))
  )

  server.registerTool(
    'get_token',
    {
      title: 'Get one design token',
      description:
        'Return the DTCG token at a dot path, its resolved value, CSS value, CSS variable reference, and Figma extension data when present.',
      inputSchema: {
        path: z
          .string()
          .describe(
            'Dot-separated token path, for example "semantic.color.bg.brand".'
          ),
        contexts: contextsSchema,
      },
    },
    async ({ path, contexts }) => jsonContent(getToken(source, path, contexts))
  )

  server.registerTool(
    'resolve_context',
    {
      title: 'Resolve tokens for a context',
      description:
        'Resolve token values for the selected contexts. Returns up to the requested limit with CSS values, plus the total count and truncation state.',
      inputSchema: {
        contexts: z
          .record(z.string(), z.string())
          .describe(
            'Resolver context keyed by modifier axis, for example {"semantic":"dark"}.'
          ),
        limit: z
          .number()
          .int()
          .positive()
          .max(2000)
          .optional()
          .describe('Maximum number of tokens to return. Defaults to 500.'),
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
        'Find a substring in token paths and descriptions. An optional DTCG $type filter narrows the results.',
      inputSchema: {
        query: z
          .string()
          .describe('Substring matched against paths and descriptions.'),
        type: z
          .string()
          .optional()
          .describe('DTCG $type filter, for example "color".'),
        contexts: contextsSchema,
        limit: z
          .number()
          .int()
          .positive()
          .max(500)
          .optional()
          .describe('Maximum number of matches to return. Defaults to 50.'),
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
        'Compare two Figma variables JSON files by stable IDs and return a Markdown report of collection, mode, variable, type, value, and description changes.',
      inputSchema: {
        oldPath: z
          .string()
          .describe('Path to the earlier variables JSON file.'),
        newPath: z.string().describe('Path to the later variables JSON file.'),
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
