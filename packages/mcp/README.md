# @figma-vars/mcp

An MCP server that makes your design tokens **AI-legible**. Point it at a Figma variables export (or a `figma-vars build` output) and any MCP client — Cursor, Claude Code, Windsurf — can query your real tokens instead of hallucinating hex values.

## Setup

```json
{
  "mcpServers": {
    "design-tokens": {
      "command": "npx",
      "args": ["-y", "@figma-vars/mcp", "--tokens", "./variables.json"]
    }
  }
}
```

`--tokens` accepts either a raw `variables.json` (converted in-memory) or a directory containing `tokens/tokens.resolver.json` (the output of `figma-vars build`). `FIGMA_VARS_TOKENS` works as an env-var alternative.

## Tools

| Tool               | What the agent gets                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `list_collections` | Collections, token counts, and every theme axis/context                                       |
| `get_token`        | One token by path: raw DTCG token, resolved value, CSS form, `var()` accessor, Figma metadata |
| `resolve_context`  | Every token value under a context selection (e.g. `{"semantic":"dark"}`)                      |
| `search_tokens`    | Substring search across paths and descriptions, filterable by `$type`                         |
| `diff_tokens`      | Markdown changelog between two exports (renames by stable ID, breaking-change callouts)       |

## Why

Agents generating UI code guess at colors and spacing unless the design system is in their context. This server turns your token source of truth into five cheap, structured calls — local-first, no Figma API access, no Enterprise plan, nothing uploaded.

Part of [FigmaVars](https://github.com/marklearst/figma-vars-hooks): [`@figma-vars/cli`](https://www.npmjs.com/package/@figma-vars/cli) builds the pipeline, this package serves it to agents.

MIT © Mark Learst
