# @primitree/mcp

`@primitree/mcp` serves Primitree token data through the Model Context
Protocol.

## Requirements

- Node.js 24 or newer

## Configure an MCP client

```json
{
  "mcpServers": {
    "design-tokens": {
      "command": "npx",
      "args": ["-y", "@primitree/mcp", "--tokens", "./variables.json"]
    }
  }
}
```

`--tokens` accepts:

- a Figma variables JSON file
- a directory containing `tokens.resolver.json` and `*.tokens.json`
- a `primitree build` output directory with those files under `tokens/`

For a directory, the loader reads root-level and nested `*.tokens.json` files.
`TokenSource.files` uses slash-separated keys relative to
`tokens.resolver.json`. A source may contain up to 64 nested directory levels,
100,000 scanned entries, and 1,000 token files. Each JSON file may contain up to
20 MiB, with a 256 MiB total across the source.

Set `PRIMITREE_TOKENS` when you prefer an environment variable over the
`--tokens` flag.

## Tools

| Tool               | Input and result                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| `list_collections` | Returns top-level token groups, token counts, Resolver contexts, and the loaded path                 |
| `get_token`        | Accepts a dot path and optional contexts; returns the token, resolved value, CSS, and Figma metadata |
| `resolve_context`  | Accepts contexts and an optional limit; returns CSS values for the selected token set                |
| `search_tokens`    | Searches token paths and descriptions, with optional `$type`, context, and limit filters             |
| `diff_tokens`      | Accepts paths to two Figma variables JSON files and returns a Markdown comparison                    |

`diff_tokens` reads the two paths supplied to the tool. It does not compare two
built token directories.

The server reads files on the machine that runs it and returns results over
stdio. Your MCP client controls where those results go.

## Use the package API

```ts
import { createServer, loadTokenSource } from '@primitree/mcp'

const source = await loadTokenSource('./design-tokens')
const server = await createServer(source)
```

Applications can import the five tool functions without starting an MCP
transport.

Tool lookups retain valid literals and aliases without an effective `$type`.
Their results omit `type`, and `$type` filters exclude them.

Read the [Primitree documentation](https://primitree.com) or review the
[1.0.0 changelog](CHANGELOG.md).

## License

MIT © Mark Learst
