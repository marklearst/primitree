# @figmavars/mcp

`@figmavars/mcp` serves FigmaVars token data through the Model Context
Protocol.

## Requirements

- Node.js 24 or newer

## Configure an MCP client

```json
{
  "mcpServers": {
    "design-tokens": {
      "command": "npx",
      "args": ["-y", "@figmavars/mcp", "--tokens", "./variables.json"]
    }
  }
}
```

`--tokens` accepts:

- a Figma variables JSON file
- a directory containing `tokens.resolver.json` and `*.tokens.json`
- a `figma-vars build` output directory with those files under `tokens/`

Set `FIGMA_VARS_TOKENS` when you prefer an environment variable over the
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
import { createServer, loadTokenSource } from '@figmavars/mcp'

const source = await loadTokenSource('./design-tokens')
const server = await createServer(source)
```

The package also exports the five tool functions for applications that want to
call them without starting an MCP transport.

Read the [FigmaVars documentation](https://figmavars.com) or review the
[5.0.0 changelog](CHANGELOG.md).

## License

MIT © Mark Learst
