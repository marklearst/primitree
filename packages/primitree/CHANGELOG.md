# Changelog

## 1.0.0-next.0 (2026-08-17)

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
  - @primitree/cli@1.0.0-next.0

Initial prerelease of the unscoped `primitree` command launcher.
