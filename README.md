<div align="center">

# 🌳 Primitree

Check a local DTCG source against project rules and build files for apps.

[![CI](https://github.com/marklearst/primitree/actions/workflows/ci.yml/badge.svg)](https://github.com/marklearst/primitree/actions/workflows/ci.yml)
[![DTCG](https://img.shields.io/badge/DTCG-2025.10-5F7F2F)](https://www.designtokens.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

```sh
npx @primitree/cli check
npx @primitree/cli build
```

Configured builds can write this file set:

```text
generated/
├── tokens/
│   ├── source.tokens.json
│   └── tokens.resolver.json
├── css/
│   ├── tokens.css
│   └── tokens.tailwind.css
├── ts/tokens.ts
└── .primitree-manifest.json
```

Set the source, layer rules, owner rules, output directory, and formats in
`primitree.config.ts`. See [the CLI package guide](packages/cli) for a full
config example.

The older Figma form remains available:

```sh
npx @primitree/cli build variables.json
```

Its token output follows DTCG 2025.10 plus a documented boolean extension.
Aliases remain token references. The converter maps Figma modes to Resolver
contexts. Figma IDs, scopes, and code syntax live under
`$extensions['com.primitree']`.

Create `variables.json` with a variables plugin that exports local Figma
variables. Use the Primitree export plugin during local development.
Teams with Enterprise access can use `primitree export` against the Variables
REST API.

## Packages

| Package                                  | Purpose                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| [`@primitree/core`](packages/core)       | Normalize exports, resolve aliases, compare revisions, and call the API              |
| [`@primitree/dtcg`](packages/dtcg)       | Convert exports to token files and emit CSS, Tailwind, and TypeScript                |
| [`@primitree/cli`](packages/cli)         | Check and inspect local DTCG sources; convert Figma exports; scaffold token projects |
| [`@primitree/hooks`](packages/hooks)     | Read built tokens in React or use the Variables REST API with SWR                    |
| [`@primitree/mcp`](packages/mcp)         | Serve token lookups and export comparisons through MCP                               |
| [`apps/figma-plugin`](apps/figma-plugin) | Export local Figma variables to `variables.json`                                     |

## Review token changes

`primitree diff` matches variables by stable Figma IDs. A renamed variable
keeps its identity in the report:

```sh
primitree diff backup/variables.json variables.json --fail-on-breaking
```

```markdown
Variables: 1 renamed, 1 value change.
**The diff contains breaking changes.**

### Renamed variables (breaking)

- `color/bg/brand` -> `color/bg/primary` (Semantic)

| Variable         | Collection | Mode    | Before | After |
| ---------------- | ---------- | ------- | ------ | ----- |
| `control/height` | Density    | Compact | 32     | 28    |
```

`--fail-on-breaking` exits with code 2 when the report contains removals,
renames, moves, or type changes.

## Check and inspect a DTCG source

Add named local DTCG files and their layer rules to `primitree.config.ts`.
Check one source or explain one exact token path:

```sh
primitree check --source brand
primitree build --source brand
primitree build --source brand --check
primitree inspect semantic.action --source brand
primitree diff backup.tokens.json tokens.json --config primitree.config.ts
```

Set `outputs.directory` on the source to choose its generated folder. The
optional `outputs.formats` list accepts `dtcg`, `css`, `typescript`, and
`tailwind`. A build checks the source rules before it writes. Check mode reports
missing, changed, and unexpected files without writing.

The inspection report includes the token ID, resolved value, alias chain,
owners, direct dependents, and source location.

The configured diff reports changed tokens, affected aliases, and new or
resolved policy findings.

## Use built tokens in React

```tsx
import { TokensProvider, useTheme, useToken } from '@primitree/hooks'

function Brand() {
  const brand = useToken('semantic.color.bg.brand')
  const { setContext } = useTheme()

  return (
    <button
      style={{ background: brand.css ?? undefined }}
      onClick={() => setContext('semantic', 'dark')}>
      Use dark tokens
    </button>
  )
}
```

The local-token hooks read built artifacts. They do not need a Figma Personal
Access Token or a network request. Enterprise teams can use the live API hooks.

## Connect an MCP client

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

The server provides `list_collections`, `get_token`, `resolve_context`,
`search_tokens`, and `diff_tokens`.

## Documentation

Read the documentation at [primitree.com](https://primitree.com).

Run the site from the monorepo:

```sh
pnpm --filter primitree-docs dev
```

## Repository layout

```text
apps/
├── docs/                 Documentation site and browser playground
├── figma-plugin/         Figma export plugin
└── playground/           Standalone browser playground
packages/
├── core/                 Shared normalization, diff, API, and types
├── dtcg/                 Token conversion and emitters
├── cli/                  Command-line package
├── hooks/                React package
├── mcp/                  MCP package
└── plugin-export/        Private serializer for the Figma plugin
docs/                     Release notes, launch drafts, and maintainer docs
```

## Requirements

- Node.js 24 or newer
- pnpm 11 or newer for monorepo work
- React `^19.0.0` and SWR `^2.3.7` for `@primitree/hooks`

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm check:release
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for repository setup and release checks.

## License

MIT © [Mark Learst](https://github.com/marklearst)
