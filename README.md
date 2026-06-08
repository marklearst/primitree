<div align="center">

# FigmaVars

**Drop in your Figma variables. Leave with a production design-token pipeline.**

[![CI](https://github.com/marklearst/figmavars/actions/workflows/ci.yml/badge.svg)](https://github.com/marklearst/figmavars/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40figmavars%2Fcli?label=%40figmavars%2Fcli)](https://www.npmjs.com/package/@figmavars/cli)
[![npm](https://img.shields.io/npm/v/%40figmavars%2Fhooks?label=%40figmavars%2Fhooks)](https://www.npmjs.com/package/@figmavars/hooks)
[![DTCG](https://img.shields.io/badge/DTCG-2025.10-7b8cff)](https://www.designtokens.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

</div>

---

Figma's Variables REST API is Enterprise-only. Your design tokens shouldn't be.

FigmaVars takes the **variables JSON anyone can export on any Figma plan** (via a plugin like TokensBrücke, a Dev Mode export, or `figma-vars export` on Enterprise) and turns it into everything your codebase actually needs:

```sh
npx @figmavars/cli build variables.json
```

```
design-tokens/
├── tokens/
│   ├── primitives.tokens.json        # DTCG 2025.10, one file per collection
│   ├── semantic.tokens.json
│   ├── semantic.dark.tokens.json     # one file per extra Figma mode
│   └── tokens.resolver.json          # DTCG Resolver: modes -> contexts
├── css/
│   ├── tokens.css                    # CSS custom properties + [data-*] theme blocks
│   └── tokens.tailwind.css           # Tailwind CSS v4 @theme mapping
├── ts/tokens.ts                      # TokenPath union, var() accessors, values
├── style-dictionary.config.mjs       # prewired transformer (or --terrazzo)
├── design-tokens.workflow.yml        # GitHub Actions: rebuild on every export
└── README.md
```

Aliases survive as DTCG `{references}`. Figma modes become standard Resolver contexts (`light`/`dark`, `compact`/`comfortable`). Figma metadata (variable ids, scopes, code syntax) is preserved under `$extensions` — so the pipeline is round-trippable and diffable.

## Documentation

**[Read the docs](apps/docs)** first. Every command, package, output file, and hook is documented there.

```sh
pnpm --filter figmavars-docs dev   # site + docs + playground at localhost:3000
```

## The toolkit

| Package                                  | What it does                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [`@figmavars/cli`](packages/cli)         | `build` a pipeline, `diff` two exports semantically, `check` exports and built tokens, `init` a tokens repo, `export` via the REST API |
| [`@figmavars/dtcg`](packages/dtcg)       | Pure functions: Figma JSON → DTCG 2025.10 + Resolver, CSS/Tailwind/TypeScript emitters, context resolution                             |
| [`@figmavars/core`](packages/core)       | Normalizer for every variables JSON shape, alias-graph resolution, semantic diffing, typed REST client                                 |
| [`@figmavars/hooks`](packages/hooks)     | React hooks: consume built tokens on any plan (`useToken`, `useTheme`) or manage variables live via the REST API                       |
| [`@figmavars/mcp`](packages/mcp)         | MCP server so AI agents can query your tokens: list, get, resolve, search, diff                                                        |
| [`apps/figma-plugin`](apps/figma-plugin) | Official Figma plugin: export all local variables to `variables.json` on any plan                                                      |

## Review token changes like code

`figma-vars diff` matches variables by their **stable Figma IDs**, so a rename is reported as a rename — not a removal plus an addition that silently breaks consumers:

```sh
figma-vars diff backup/variables.json variables.json --fail-on-breaking
```

```markdown
Variables: 1 renamed, 1 value changes.
**Breaking changes detected.**

### Renamed variables (breaking)

- `color/bg/brand` -> `color/bg/primary` (Semantic)

| Variable         | Collection | Mode    | Before | After |
| ---------------- | ---------- | ------- | ------ | ----- |
| `control/height` | Density    | Compact | 32     | 28    |
```

Wire it into CI with `--fail-on-breaking` (exit code 2) and every design-token change becomes a reviewable PR event.

## React, on any plan

The v5 hooks consume **built artifacts**, not the Enterprise API — no Personal Access Token, no network, SSR-safe:

```tsx
import { TokensProvider, useToken, useTheme } from '@figmavars/hooks'

function Brand() {
  const brand = useToken('semantic.color.bg.brand') // { value, css, cssVar }
  const { setContext } = useTheme()
  return (
    <button
      style={{ background: brand.css ?? undefined }}
      onClick={() => setContext('semantic', 'dark')}>
      Go dark
    </button>
  )
}
```

The live-API hooks (`useVariables`, mutations, SWR caching) are still here for Enterprise teams — see the [hooks README](packages/hooks/README.md).

## Make your tokens AI-legible

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

Any MCP client (Cursor, Claude Code, ...) can then call `list_collections`, `get_token`, `resolve_context`, `search_tokens`, and `diff_tokens` — so generated code uses your actual tokens instead of hallucinated hex values.

## How it compares

- **TokensBrücke / figma-to-dtcg / figvar2dtcg** convert to DTCG and stop. FigmaVars scaffolds the whole pipeline: transformer config, CSS, Tailwind, types, CI, diffing, runtime hooks, MCP.
- **Style Dictionary / Terrazzo** expect DTCG input. FigmaVars generates their configs and feeds them — complement, not competition.
- **Figma's official MCP server** solves design-context-into-the-IDE. FigmaVars owns the repo side: transform, diff, validate, ship — free and local-first.

## Development

```sh
pnpm install
pnpm build        # turbo build across all packages
pnpm test         # 400+ tests
```

Monorepo layout: `packages/{core,dtcg,cli,hooks,mcp}` + `apps/playground`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © [Mark Learst](https://github.com/marklearst)
