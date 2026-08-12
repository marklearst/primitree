# Primitree 1.0 launch copy

Draft copy for the 1.0 prerelease.

## Show HN

### Title options

1. `Show HN: Commit design tokens from a Figma variables export`
2. `Show HN: Primitree, from variables.json to DTCG, CSS, and types`

### Post

Hi HN. I built Primitree to turn an exported `variables.json` file into token
files that live in a repository.

```sh
npx primitree@next build variables.json
git add design-tokens
```

The command writes DTCG 2025.10 tokens plus a documented boolean extension, a
Resolver document for Figma modes, CSS custom properties, a Tailwind CSS v4
theme, TypeScript accessors, and a Style Dictionary or Terrazzo configuration.
It writes a GitHub Actions workflow for later exports.

The comparison command uses stable Figma IDs:

```sh
primitree diff backup/variables.json variables.json --fail-on-breaking
```

The diff matches variable records by stable Figma ID. It reports a changed name
as a rename and lists removals, moves, type changes, and per-mode value changes.
`--fail-on-breaking` gives CI an exit code for the breaking cases.

Get the source JSON from a variables plugin that exports local Figma variables.
The repository includes the Primitree export plugin as a development build. Teams
with Enterprise access can use the REST API through `primitree export`.

The repository contains React hooks for built artifacts and an MCP server for
token queries. The browser playground builds the same files and downloads them
as a zip.

I'm looking for feedback on the FLOAT type mapping and the way Figma modes map
to Resolver modifiers.

Project: https://github.com/marklearst/primitree

Docs: https://primitree.com

## X and Bluesky thread

### Post 1

Build commit-ready token files from a Figma `variables.json` export.

```sh
npx primitree@next build variables.json
```

Primitree writes DTCG 2025.10 tokens plus a documented boolean extension,
Resolver contexts, CSS, a Tailwind CSS v4 theme, TypeScript accessors, and
transformer configuration.

https://primitree.com

### Post 2

`primitree diff` matches variable records by stable Figma ID and reports changed
names as renames. It shows per-mode value changes and marks removals, moves, and
type changes as breaking.

Use `--fail-on-breaking` in CI.

### Post 3

`@primitree/hooks` reads the generated token files in React:

```tsx
useToken('semantic.color.bg.brand')
useTheme().setContext('semantic', 'dark')
```

The local-token hooks need no Figma token or network request.

### Post 4

`@primitree/mcp` gives MCP clients five token tools:

`list_collections`, `get_token`, `resolve_context`, `search_tokens`, and
`diff_tokens`.

The server reads a variables export or a built token directory from disk.

https://github.com/marklearst/primitree

## Newsletter blurb

Primitree turns a Figma variables export into commit-ready files for review.
The CLI writes DTCG 2025.10 token files, Resolver contexts for modes, CSS custom
properties, Tailwind v4 mappings, and typed token paths. The diff engine matches
variable records by stable Figma ID and reports changed names as renames. The
MIT-licensed repository includes React hooks for built artifacts and an MCP
server for token queries. The browser playground builds the files without an
install.

https://primitree.com

## Demo outline

Start with a Figma file that has at least two collections and one collection
with two modes. Export it to `variables.json` before recording.

```tape
Output demo.gif
Set FontSize 18
Set Width 1200
Set Height 640
Set Theme "Catppuccin Mocha"

Type "npx primitree@next build variables.json" Enter
Sleep 4s
Type "find design-tokens -maxdepth 2 -type f | sort" Enter
Sleep 4s
Type "git add design-tokens && git status --short" Enter
Sleep 4s
Type "npx primitree@next diff backup/variables.json variables.json" Enter
Sleep 5s
```

Record a second clip in the browser playground: select `variables.json`,
switch one Resolver context, and download the zip.

## Launch checklist

- [ ] Finish the [release runbook](../releasing.md).
- [ ] Publish the five scoped packages and the unscoped `primitree` launcher in dependency order.
- [ ] Verify the documentation site at https://primitree.com.
- [ ] Verify the migration guide at
      https://primitree.com/docs/hooks/migration.
- [ ] Record the demo with the release tarballs installed.
- [ ] Check each command and link in the launch copy.
- [ ] Publish the Show HN post.
- [ ] Publish the X and Bluesky thread.
- [ ] Send the newsletter blurb.
