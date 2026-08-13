# Changelog

## 1.0.0 (Unreleased)

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
