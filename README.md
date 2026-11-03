# Primitree

Policy checks and dependency-aware diffs for DTCG design tokens, run before your build and
in CI.

[![CI](https://github.com/marklearst/primitree/actions/workflows/ci.yml/badge.svg)](https://github.com/marklearst/primitree/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A component token that points straight at a primitive fails the check and exits 1:

```console
$ npx primitree@next check --source layer-skip
PT1004 component.button.bg: Layer component cannot reference layer primitives.
Check found 1 active finding for source "layer-skip".
```

A rename lists every token that resolved through the old name:

```console
$ npx primitree@next diff tokens.json proposals/rename.tokens.json --source brand
Diff found 5 token changes.
changed component.button.bg
  Affected tokens: none
changed component.focus.ring
  Affected tokens: none
changed component.nav.active.bg
  Affected tokens: none
removed semantic.color.bg.brand
  Affected tokens: component.button.bg, component.focus.ring, component.nav.active.bg
added semantic.color.bg.primary
  Affected tokens: component.button.bg, component.focus.ring, component.nav.active.bg
New findings: 0
Resolved findings: 0
```

## Try it

Both transcripts come from [`examples/brand`](examples/brand), a 15-token starter set. The
homepage at [primitree.com](https://primitree.com) runs on a larger set in
[`apps/docs/tokens`](apps/docs/tokens), checked by the same CLI:

```sh
git clone https://github.com/marklearst/primitree
cd primitree/examples/brand
npx primitree@next check --source brand
npx primitree@next check --source layer-skip
npx primitree@next diff tokens.json proposals/rename.tokens.json --source brand
npx primitree@next build --source brand
```

## Add it to a project

```sh
npm install -D @primitree/cli@next
```

Put `primitree.config.ts` next to your DTCG file. It names each source, its layers, the
references each layer may make, and who owns which paths. The
[getting started guide](https://primitree.com/docs/getting-started) walks through one, and
[`examples/brand/primitree.config.ts`](examples/brand/primitree.config.ts) is a working copy.

```sh
npx primitree check --source brand
npx primitree build --source brand
npx primitree build --source brand --check
```

`build --check` exits 1 when the generated files differ from the source, so a pull request
that edits tokens without rebuilding fails CI.

## Rules the check enforces

| Rule     | Finding                                                                                 |
| -------- | --------------------------------------------------------------------------------------- |
| `PT1001` | A token path matches no layer in the config.                                            |
| `PT1003` | A layer gets the wrong value form: a literal where it expects an alias, or the reverse. |
| `PT1004` | A layer references a layer it may not reference.                                        |
| `PT1005` | A token has no owner.                                                                   |

The check also rejects invalid token types, broken references, and cycles.

## Build output

Primitree runs before your build tool and does not replace it. The build writes standard
DTCG 2025.10 with Resolver contexts, plus CSS, Tailwind v4, and TypeScript:

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

## Figma variables

Teams that start from Figma convert a variables export instead of a local DTCG file:

```sh
npx primitree@next build variables.json
```

The converter maps Figma modes to Resolver contexts and keeps aliases as token references.
Figma IDs, scopes, and code syntax live under `$extensions['com.primitree']`. The Figma path
can also scaffold a Style Dictionary or Terrazzo config. Export `variables.json` with the
[Primitree export plugin](apps/figma-plugin), or use `primitree export` against the Variables
REST API with Enterprise access.

### Compare Figma exports

`primitree diff` matches Figma variables by their stable IDs, so a rename keeps its identity
in the report:

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

`--fail-on-breaking` exits with code 2 when the report contains removals, renames, moves, or
type changes.

## Packages

| Package                                  | Purpose                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| [`primitree`](packages/primitree)        | Run the CLI through the short, unscoped package name                                 |
| [`@primitree/core`](packages/core)       | Normalize exports, resolve aliases, compare revisions, and call the API              |
| [`@primitree/dtcg`](packages/dtcg)       | Convert exports to token files and emit CSS, Tailwind, and TypeScript                |
| [`@primitree/cli`](packages/cli)         | Check and inspect local DTCG sources; convert Figma exports; scaffold token projects |
| [`@primitree/hooks`](packages/hooks)     | Read built tokens in React or use the Variables REST API with SWR                    |
| [`@primitree/mcp`](packages/mcp)         | Serve token lookups and export comparisons through MCP                               |
| [`apps/figma-plugin`](apps/figma-plugin) | Export local Figma variables to `variables.json`                                     |

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
      "args": ["-y", "@primitree/mcp@next", "--tokens", "./variables.json"]
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
└── figma-plugin/         Figma export plugin
packages/
├── primitree/            Unscoped CLI launcher
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
