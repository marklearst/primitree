<div align="center">

# 🌳 FigmaVars

Turn a Figma variables export into token files you can commit and review.

[![CI](https://github.com/marklearst/figmavars/actions/workflows/ci.yml/badge.svg)](https://github.com/marklearst/figmavars/actions/workflows/ci.yml)
[![DTCG](https://img.shields.io/badge/DTCG-2025.10-7b8cff)](https://www.designtokens.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

```sh
npx @figmavars/cli build variables.json
```

The command writes a design-token pipeline:

```text
design-tokens/
├── tokens/
│   ├── primitives.tokens.json
│   ├── semantic.tokens.json
│   ├── semantic.dark.tokens.json
│   └── tokens.resolver.json
├── css/
│   ├── tokens.css
│   └── tokens.tailwind.css
├── ts/tokens.ts
├── style-dictionary.config.mjs
├── design-tokens.workflow.yml
└── README.md
```

The token output follows DTCG 2025.10 plus a documented boolean extension.
Aliases remain token references. Figma modes become Resolver contexts. Figma
IDs, scopes, and code syntax live under `$extensions['com.figma-vars']`.

Create `variables.json` with a variables plugin that exports local Figma
variables. The FigmaVars Export workspace app supports local development.
Teams with Enterprise access can use `figma-vars export` against the Variables
REST API.

## Packages

| Package                                  | Purpose                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| [`@figmavars/core`](packages/core)       | Normalize exports, resolve aliases, compare revisions, and call the API |
| [`@figmavars/dtcg`](packages/dtcg)       | Convert exports to token files and emit CSS, Tailwind, and TypeScript   |
| [`@figmavars/cli`](packages/cli)         | Build, compare, check, scaffold, and export token projects              |
| [`@figmavars/hooks`](packages/hooks)     | Read built tokens in React or use the Variables REST API with SWR       |
| [`@figmavars/mcp`](packages/mcp)         | Serve token lookups and export comparisons through MCP                  |
| [`apps/figma-plugin`](apps/figma-plugin) | Export local Figma variables to `variables.json`                        |

## Review token changes

`figma-vars diff` matches variables by stable Figma IDs. A renamed variable
keeps its identity in the report:

```sh
figma-vars diff backup/variables.json variables.json --fail-on-breaking
```

```markdown
Variables: 1 renamed, 1 value change.
**Breaking changes detected.**

### Renamed variables (breaking)

- `color/bg/brand` -> `color/bg/primary` (Semantic)

| Variable         | Collection | Mode    | Before | After |
| ---------------- | ---------- | ------- | ------ | ----- |
| `control/height` | Density    | Compact | 32     | 28    |
```

`--fail-on-breaking` exits with code 2 when the report contains removals,
renames, moves, or type changes.

## Use built tokens in React

```tsx
import { TokensProvider, useTheme, useToken } from '@figmavars/hooks'

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
Access Token or a network request. The package also includes live API hooks for
Enterprise teams.

## Connect an MCP client

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

The server provides `list_collections`, `get_token`, `resolve_context`,
`search_tokens`, and `diff_tokens`.

## Documentation

Read the documentation at [figmavars.com](https://figmavars.com).

Run the site from the monorepo:

```sh
pnpm --filter figmavars-docs dev
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
└── plugin-export/        Private serializer used by the Figma plugin
docs/                     Release notes, launch drafts, and maintainer docs
```

## Requirements

- Node.js 24 or newer
- pnpm 11 or newer for monorepo work
- React `^19.0.0` and SWR `^2.3.7` for `@figmavars/hooks`

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
