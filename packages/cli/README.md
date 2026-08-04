# @primitree/cli

`@primitree/cli` checks local DTCG token files against project rules. It also
keeps the older commands for Figma variables exports during the 1.0 update.

```sh
npx @primitree/cli build variables.json
```

## Requirements

- Node.js 24 or newer

## `primitree build`

```sh
primitree build <variables.json> [--out <dir>]
```

The default output directory is `design-tokens`. The command can write:

- DTCG 2025.10 token files plus a documented boolean extension
- `tokens/tokens.resolver.json`
- `css/tokens.css`
- `css/tokens.tailwind.css`
- `ts/tokens.ts`
- `style-dictionary.config.mjs` or `terrazzo.config.mjs`
- `design-tokens.workflow.yml`
- a README for the token project

Aliases remain token references. CSS defaults live in `:root`. Extra contexts
use the Resolver axis in selectors such as `[data-semantic='dark']`.

Build options:

- `--out <dir>`
- `--terrazzo`
- `--style-dictionary`
- `--no-transformer`
- `--no-css`
- `--no-tailwind`
- `--no-ts`
- `--no-github-action`
- `--no-readme`
- `--name <name>`

## `primitree diff`

```sh
primitree diff <old.json> <new.json>
```

The command matches variables by stable Figma IDs and writes a Markdown report.
Use `--json` for JSON output, `--out <file>` to write a file, and
`--fail-on-breaking` to exit with code 2 when the report contains a breaking
change.

```sh
primitree diff backup/variables.json variables.json --fail-on-breaking
```

## `primitree check`

```sh
primitree check [--config <path>] [--source <name>] [--format text|json]
primitree check <variables.json | tokens-dir>
```

The config form reads `./primitree.config.ts` unless `--config` names a file.
It selects one local DTCG source, builds its token graph, and checks its layer
and owner rules. Use `--source` when the config contains several sources.

```ts
import { defineConfig } from '@primitree/cli/config'

export default defineConfig({
  schemaVersion: 1,
  sources: {
    brand: {
      type: 'dtcg',
      file: './tokens.json',
      architecture: {
        layers: [
          { id: 'base', roots: ['color'], values: 'literal' },
          {
            id: 'meaning',
            roots: ['semantic'],
            values: 'reference',
            references: ['base'],
          },
        ],
      },
      ownership: { default: ['design-systems'] },
    },
  },
})
```

Paths are relative to the config file. Primitree reads the named config file
and does not search parent folders. It rejects unknown settings. Each source
needs one to four layers.

The older path form still checks a Figma variables export or a built token
directory. The command exits with code 1 for findings and code 2 for command,
config, or input errors.

## `primitree inspect`

```sh
primitree inspect <token.path> [--config <path>] [--source <name>]
                                  [--format text|json]
```

The command reads the same config as `primitree check`. It reports the token
ID, source, type, resolved value, alias chain, owners, direct dependents, and
source location. The token path must match one token, such as
`semantic.action`.

The command exits with code 0 after it finds the token and code 2 for command,
config, or input errors.

## `primitree init`

```sh
primitree init [dir] [--from variables.json] [--name name] [--force]
```

The command creates a token repository with:

- `variables.json`, using sample data unless you pass `--from`
- generated token files and configuration
- package scripts for build, check, diff, and backup
- `.github/workflows/design-tokens.yml`

`--force` replaces scaffold-owned paths and leaves unrelated paths in place. The
command rejects unsafe path types, including symbolic links in
scaffold-owned locations.

## `primitree export`

```sh
primitree export --file-key <FILE_KEY> [--out <OUTPUT_PATH>]
```

The export command calls the Figma Variables REST API. It requires an
Enterprise seat, `file_variables:read`, and a Personal Access Token in
`FIGMA_TOKEN` or `FIGMA_PAT`.

Set `FIGMA_FILE_KEY` instead of passing `--file-key`. The default output path is
`figma-variables.json`.

Use the Primitree export plugin when you need a local variables export without
the REST API.

## Packages

- [`@primitree/core`](https://www.npmjs.com/package/@primitree/core) provides normalization, comparison, API functions, and types.
- [`@primitree/dtcg`](https://www.npmjs.com/package/@primitree/dtcg) provides conversion and emitters.
- [`@primitree/hooks`](https://www.npmjs.com/package/@primitree/hooks) provides React hooks.
- [`@primitree/mcp`](https://www.npmjs.com/package/@primitree/mcp) serves token data through MCP.

Read the [Primitree documentation](https://primitree.com) or review the
[1.0.0 changelog](CHANGELOG.md).

## License

MIT © Mark Learst
