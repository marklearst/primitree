# FigmaVars 5 launch copy

Draft copy for the 5.0.0 release.

## Show HN

### Title options

1. `Show HN: Commit design tokens from a Figma variables export`
2. `Show HN: FigmaVars, from variables.json to DTCG, CSS, and types`

### Post

Hi HN. I built FigmaVars to turn an exported `variables.json` file into token
files that live in a repository.

```sh
npx @figmavars/cli build variables.json
git add design-tokens
```

The command writes DTCG 2025.10 tokens plus a documented boolean extension, a
Resolver document for Figma modes, CSS custom properties, a Tailwind CSS v4
theme, TypeScript accessors, and a Style Dictionary or Terrazzo configuration.
It can also write a GitHub Actions workflow for later exports.

The comparison command uses stable Figma IDs:

```sh
figma-vars diff backup/variables.json variables.json --fail-on-breaking
```

Because the IDs survive a name change, the report records a rename under the
same variable. It also reports removals, moves, type changes, and per-mode value
changes. `--fail-on-breaking` gives CI an exit code for the breaking cases.

You can get the source JSON from a variables plugin that exports local Figma
variables. The repository includes FigmaVars Export as a development build.
Teams with Enterprise access can use the REST API through `figma-vars export`.

The repository also contains React hooks for the built artifacts, an MCP server
for token queries, and a browser playground. The playground builds the same
files and downloads them as a zip.

I would value review of the FLOAT type mapping and the way Figma modes map to
Resolver modifiers.

Project: https://github.com/marklearst/figmavars

Docs: https://figmavars.com

## X and Bluesky thread

### Post 1

Export `variables.json` from Figma. Run one command. Commit the token files.

```sh
npx @figmavars/cli build variables.json
```

FigmaVars 5 writes DTCG 2025.10 tokens plus a documented boolean extension,
Resolver contexts, CSS, a Tailwind CSS v4 theme, TypeScript accessors, and
transformer configuration.

https://figmavars.com

### Post 2

`figma-vars diff` matches variables by stable Figma IDs.

A renamed variable keeps its identity in the report. The command also shows
per-mode value changes and marks removals, renames, moves, and type changes as
breaking.

Use `--fail-on-breaking` in CI.

### Post 3

`@figmavars/hooks` reads the generated token files in React:

```tsx
useToken('semantic.color.bg.brand')
useTheme().setContext('semantic', 'dark')
```

The local-token hooks need no Figma token or network request.

### Post 4

`@figmavars/mcp` gives MCP clients five token tools:

`list_collections`, `get_token`, `resolve_context`, `search_tokens`, and
`diff_tokens`.

The server reads a variables export or a built token directory from disk.

https://github.com/marklearst/figmavars

## Newsletter blurb

**FigmaVars 5 turns a Figma variables export into committed token files.**
The CLI writes DTCG 2025.10 tokens plus a documented boolean extension, a
Resolver document for modes, CSS custom properties, a Tailwind CSS v4 theme,
TypeScript accessors, and transformer configuration. Its diff command matches
variables by stable Figma IDs, so renamed variables keep their identity in
review. The release also includes React hooks for built artifacts, an MCP
server, and a browser playground. FigmaVars uses the MIT license.

https://figmavars.com

## Demo outline

Start with a Figma file that has at least two collections and one collection
with two modes. Export it to `variables.json` before recording.

```tape
Output demo.gif
Set FontSize 18
Set Width 1200
Set Height 640
Set Theme "Catppuccin Mocha"

Type "npx @figmavars/cli build variables.json" Enter
Sleep 4s
Type "find design-tokens -maxdepth 2 -type f | sort" Enter
Sleep 4s
Type "git add design-tokens && git status --short" Enter
Sleep 4s
Type "npx @figmavars/cli diff backup/variables.json variables.json" Enter
Sleep 5s
```

Record a second clip in the browser playground: select `variables.json`,
switch one Resolver context, and download the zip.

## Launch checklist

- [ ] Finish the [release runbook](../releasing.md).
- [ ] Publish the five `@figmavars` packages in dependency order.
- [ ] Verify the documentation site at https://figmavars.com.
- [ ] Verify the migration guide at
      https://figmavars.com/docs/hooks/migration.
- [ ] Record the demo with the release tarballs installed.
- [ ] Check each command and link in the launch copy.
- [ ] Publish the Show HN post.
- [ ] Publish the X and Bluesky thread.
- [ ] Send the newsletter blurb.
