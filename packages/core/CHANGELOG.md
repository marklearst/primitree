# Changelog

## 1.0.0-next.1 (2026-08-17)

### Patch Changes

- Accept npm's prerelease bootstrap dist-tags and complete the package-family
  release after the `1.0.0-next.0` attempt stopped after publishing
  `@primitree/core`.

## 1.0.0-next.0 (2026-08-17)

Release record: `@primitree/core` reached npm. The other five packages and the
GitHub Release were not published.

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

Initial release of `@primitree/core`.

### Added

- Figma Variables REST API types, endpoint builders, fetch and mutation functions, and error helpers.
- Normalization for REST responses, bare metadata objects, plugin export objects, and JSON strings.
- Alias resolution with cycle and missing-target errors.
- ID-based comparison for collections, variables, modes, and values.
- Runtime guards, filtering, retry, and token display helpers.
- ESM and CommonJS entry points, plus the `@primitree/core/types` subpath.

### Requirements

- Node.js 24 or newer.
