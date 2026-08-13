# @primitree/cli

`@primitree/cli` checks local DTCG token files against project rules. It also
keeps the older commands for Figma variables exports during the 1.0 update.

```sh
npx @primitree/cli build variables.json
```

## Requirements

- Node.js 24 or newer

## `primitree build`

### Configured DTCG source

```sh
primitree build [--config <path>] [--source <name>]
primitree build --check [--config <path>] [--source <name>]
```

The command reads `./primitree.config.ts` by default. It checks the selected
source and its layer and owner rules before it writes files. Add an `outputs`
object to that source:

```ts
outputs: {
  directory: './generated',
  formats: ['dtcg', 'css', 'typescript', 'tailwind'],
}
```

The format list is optional and defaults to all four values. Primitree writes
the selected files and `.primitree-manifest.json` into the dedicated output
directory. A later build reads that manifest. It refuses a listed file when
its hash changed and refuses any unlisted path.

An interrupted install can leave a backup or cleanup sidecar beside the output
directory. Primitree reports each matching path for that output and stops before
it replaces any installed files. Inspect the retained paths and recover any
needed files before removing them and running the build again. Primitree leaves
them in place.

The output directory must stay under the config file's directory and cannot
contain the source token file. Use a separate directory for generated files.
The output directory and every resolved file path under its output, staging,
backup, and cleanup directories must fit within 1,023 UTF-8 bytes. Its
normalized relative path can use up to 64 components. Each intermediate
component can use up to 255 UTF-8 bytes, and the final directory name can use up
to 200. A config can define up to 64 named sources. Each configured source path
must stay below the config directory and can use up to 64 resolved absolute
components and 1,023 UTF-8 bytes, including after symbolic-link resolution,
with up to 255 UTF-8 bytes in each component. A generated-file path can use up
to 64 directory levels, 16,639 UTF-8 bytes relative to its output, and 255 UTF-8
bytes in each segment. The shorter final directory name keeps the transaction
paths portable.

`--check` compares the files in the output directory with the files Primitree
would write. It reports missing, changed, and unexpected paths without writing.
It also rechecks the output directory and its ancestors while it scans, and
stops if one changes. Exit code 1 means the files differ.

### Figma variables export

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
primitree diff <before.tokens.json> <after.tokens.json> --config <path>
                [--source <name>] [--format text|json]
primitree diff <old.json> <new.json>
```

The configured form reports token changes, tokens affected through references,
and new or resolved policy findings. It exits with code 1 when the after file
has active findings.

The older form matches variables by stable Figma IDs and writes a Markdown
report. Use `--json` for JSON output, `--out <file>` to write a file, and
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

Install the CLI in the project before importing its config helper:

```sh
npm install -D @primitree/cli
```

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
      outputs: {
        directory: './generated',
        formats: ['dtcg', 'css', 'typescript', 'tailwind'],
      },
    },
  },
})
```

Paths are relative to the config file. Primitree reads the named config file
and does not search parent folders. It rejects unknown settings. Each source
needs one to four layers. Configured source files must contain valid UTF-8 and
be 10 MiB or smaller. Output-path validation records the identity of each
existing regular source file it inspects. Primitree compares that identity with
the file it opens. During the bounded read, it rejects changes to the opened
file or configured path.

The older path form still checks a Figma variables export or a built token
directory. The command exits with code 1 for findings and code 2 for command,
config, or input errors.

Positional variables JSON must be 20 MiB or smaller. In a built token source,
`tokens.resolver.json` and each `*.tokens.json` file must be 20 MiB or smaller,
and their combined size cannot exceed 256 MiB. The source can contain at most
1,000 token files, 100,000 directory entries, and 64 nested directory levels.
Built sources support nested token files. Resolver references use paths
relative to the directory containing `tokens.resolver.json`.

Every positional JSON file must contain valid UTF-8. The variables input must
be a regular file. A built source accepts directories and regular files; the
check rejects symbolic links and special nodes. A built-source warning appears
when a token has no effective type. A token's own `$type`, an inherited group
`$type`, or a type reached through a whole-token alias counts as an effective
type.

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
