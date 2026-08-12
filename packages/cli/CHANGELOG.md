# Changelog

## 1.0.0 (Unreleased)

Initial release of `@primitree/cli`.

### Added

- A typed `@primitree/cli/config` export for named local DTCG sources.
- Config-backed builds that check layer and owner rules before writing DTCG, CSS, Tailwind CSS v4, and TypeScript files. The `--check` option reports output changes without writing.
- Config-backed `primitree check` reports for token layer and owner rules.
- `primitree inspect` reports for one token path from a configured DTCG source.
- `primitree diff` reports changed and affected tokens plus new and resolved policy findings.
- `primitree build` for token files, Resolver contexts, CSS, Tailwind CSS v4, TypeScript, transformer configuration, and a workflow template.
- `primitree diff` for ID-based comparison between two variables exports.
- `primitree check` for variables exports and built token directories.
- `primitree init` for token repository scaffolding.
- `primitree export` for Enterprise Variables REST API access.
- Unsafe-path checks for scaffold and generated file writes.
- Positional input checks reject malformed UTF-8, symbolic links, and special nodes.
- Positional variables JSON can be up to 20 MiB. Built token sources can contain up to 1,000 token files, 100,000 directory entries, and 64 nested directory levels. Each built-source JSON file can be up to 20 MiB, with a 256 MiB combined limit that includes the Resolver.
- Built sources support nested token files with Resolver-relative paths. Checks warn for tokens without an explicit, inherited, or alias-derived type.

### Requirements

- Node.js 24 or newer.
