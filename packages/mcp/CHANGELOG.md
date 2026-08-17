# Changelog

## 1.0.0-next.1 (2026-08-17)

### Patch Changes

- Accept npm's prerelease bootstrap dist-tags and complete the package-family
  release after the `1.0.0-next.0` attempt stopped after publishing
  `@primitree/core`.
- Updated dependencies
  - @primitree/core@1.0.0-next.1
  - @primitree/dtcg@1.0.0-next.1

## 1.0.0-next.0 (2026-08-17)

Release record: This version was not published. The package-family attempt
stopped after `@primitree/core` reached npm.

### Major Changes

- Launch the Primitree 1.0 package family.

  - `@primitree/core` normalizes Figma variables, resolves aliases, compares
    revisions, and evaluates token policy.
  - `@primitree/dtcg` reads DTCG 2025.10 tokens and builds DTCG, Resolver, CSS,
    Tailwind CSS, and TypeScript output.
  - `@primitree/cli` checks, inspects, compares, and builds configured token
    projects.
  - `@primitree/hooks` reads generated token output in React applications.
  - `@primitree/mcp` exposes loaded token graphs to MCP clients.
  - `primitree` provides the unscoped `primitree` command through
    `@primitree/cli`.

### Patch Changes

- Updated dependencies
  - @primitree/core@1.0.0-next.0
  - @primitree/dtcg@1.0.0-next.0

Initial release of `@primitree/mcp`.

### Added

- A stdio MCP server for a Figma variables export or built token directory.
- `list_collections` for token groups, counts, and Resolver contexts.
- `get_token` for one dot-path token and its resolved forms.
- `resolve_context` for token values under selected contexts.
- `search_tokens` for path and description search with a `$type` filter.
- `diff_tokens` for a Markdown comparison between two variables exports.
- Package exports for `createServer`, `loadTokenSource`, and the tool functions.
- Tool lookups retain valid untyped literals and aliases while omitting their
  effective type.

### Requirements

- Node.js 24 or newer.
