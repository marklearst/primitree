# @figmavars/cli

`@figmavars/cli` turns a Figma variables export into files you can keep in a
repository.

```sh
npx @figmavars/cli build variables.json
```

## Requirements

- Node.js 24 or newer

## `figma-vars build`

```sh
figma-vars build <variables.json> [--out <dir>]
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

## `figma-vars diff`

```sh
figma-vars diff <old.json> <new.json>
```

The command matches variables by stable Figma IDs and writes a Markdown report.
Use `--json` for JSON output, `--out <file>` to write a file, and
`--fail-on-breaking` to exit with code 2 when the report contains a breaking
change.

```sh
figma-vars diff backup/variables.json variables.json --fail-on-breaking
```

## `figma-vars check`

```sh
figma-vars check <variables.json | tokens-dir>
```

For a variables export, the command checks the input shape, alias graph, and
mode resolution. For a built token directory, it checks each Resolver context
combination and token reference. Problems produce exit code 1.

## `figma-vars init`

```sh
figma-vars init [dir] [--from variables.json] [--name name] [--force]
```

The command creates a token repository with:

- `variables.json`, using sample data unless you pass `--from`
- generated token files and configuration
- package scripts for build, check, diff, and backup
- `.github/workflows/design-tokens.yml`

`--force` replaces paths owned by the scaffold and leaves unrelated paths in
place. The command rejects unsafe path types, including symbolic links in
scaffold-owned locations.

## `figma-vars export`

```sh
figma-vars export --file-key <FILE_KEY> [--out <OUTPUT_PATH>]
```

The export command calls the Figma Variables REST API. It requires an
Enterprise seat, `file_variables:read`, and a Personal Access Token in
`FIGMA_TOKEN` or `FIGMA_PAT`.

You can set `FIGMA_FILE_KEY` in place of `--file-key`. The default output path
is `figma-variables.json`.

Use the FigmaVars Export plugin when you need a local variables export without
the REST API.

## Packages

- [`@figmavars/core`](https://www.npmjs.com/package/@figmavars/core) provides normalization, comparison, API functions, and types.
- [`@figmavars/dtcg`](https://www.npmjs.com/package/@figmavars/dtcg) provides conversion and emitters.
- [`@figmavars/hooks`](https://www.npmjs.com/package/@figmavars/hooks) provides React hooks.
- [`@figmavars/mcp`](https://www.npmjs.com/package/@figmavars/mcp) serves token data through MCP.

Read the [FigmaVars documentation](https://figmavars.com) or review the
[5.0.0 changelog](CHANGELOG.md).

## License

MIT © Mark Learst
