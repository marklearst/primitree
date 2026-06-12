# @figmavars/cli

Turn a Figma variables export into a production design-token pipeline.

```sh
npx @figmavars/cli build variables.json
```

Works with the variables JSON from **any Figma plan**: export with a plugin (e.g. TokensBrücke), a Dev Mode workflow, or `figma-vars export` (Enterprise REST API).

## Commands

### `figma-vars build <variables.json> [--out <dir>]`

Generates, in one shot:

- **DTCG 2025.10 token files** — one per collection, plus one per extra Figma mode, aliases preserved as `{references}`, Figma metadata under `$extensions['com.figma-vars']`
- **`tokens.resolver.json`** — DTCG Resolver mapping Figma modes to contexts (light/dark, compact/comfortable, ...)
- **`css/tokens.css`** — CSS custom properties; default contexts in `:root`, each non-default context as a `[data-<axis>='<context>']` block containing only what changes
- **`css/tokens.tailwind.css`** — Tailwind CSS v4 `@theme` mapping onto `--color-*`, `--spacing-*`, `--radius-*`, `--font-*`
- **`ts/tokens.ts`** — `TokenPath` union, `var()` accessors, resolved values
- **A transformer config** — Style Dictionary by default, `--terrazzo` for Terrazzo, `--no-transformer` to skip
- **A GitHub Actions workflow** — rebuild the pipeline whenever a new export lands

Flags: `--terrazzo`, `--style-dictionary`, `--no-css`, `--no-tailwind`, `--no-ts`, `--no-github-action`, `--no-readme`, `--name <resolver name>`.

### `figma-vars diff <old.json> <new.json>`

Semantic changelog between two exports. Matching is by **stable Figma IDs**, so renames are renames — not remove+add:

```sh
figma-vars diff backup/variables.json variables.json
```

```
Variables: 1 renamed, 1 value changes.
**Breaking changes detected.**

### Renamed variables (breaking)
- `color/bg/brand` -> `color/bg/primary` (Semantic)
```

Flags: `--json`, `--out <file>`, `--fail-on-breaking` (exit code 2 — your CI gate).

### `figma-vars check <variables.json | tokens-dir>`

Validate an export (shape, alias cycles, dangling targets, per-mode resolvability) or a built tokens directory (every context permutation must merge, every reference must resolve). Exit code 1 on problems.

### `figma-vars init [dir] [--from variables.json] [--name name] [--force]`

Scaffold a complete tokens repo: `variables.json` (sample data unless `--from`), the generated pipeline, `package.json` with `build`/`check`/`diff`/`backup` scripts, and the CI workflow wired at `.github/workflows/`. Init always builds the initial pipeline. `--force` replaces generated files only and preserves unrelated files.

### `figma-vars export --file-key <key>`

Download variables via the Figma REST API (requires an Enterprise seat and `FIGMA_TOKEN`/`FIGMA_PAT`).

## Part of FigmaVars

[`@figmavars/dtcg`](https://www.npmjs.com/package/@figmavars/dtcg) (the pure conversion engine) · [`@figmavars/core`](https://www.npmjs.com/package/@figmavars/core) (normalizer, diffing, REST client) · [`@figmavars/hooks`](https://www.npmjs.com/package/@figmavars/hooks) (React) · [`@figmavars/mcp`](https://www.npmjs.com/package/@figmavars/mcp) (AI agents)

MIT © Mark Learst
