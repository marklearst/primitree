# Changelog

## 1.0.0 (Unreleased)

Initial release of `@primitree/cli`.

### Added

- A typed `@primitree/cli/config` export for named local DTCG sources.
- Config-backed `primitree check` reports for token layer and owner rules.
- `primitree inspect` reports for one token path from a configured DTCG source.
- `primitree diff` reports changed and affected tokens plus new and resolved policy findings.
- `primitree build` for token files, Resolver contexts, CSS, Tailwind CSS v4, TypeScript, transformer configuration, and a workflow template.
- `primitree diff` for ID-based comparison between two variables exports.
- `primitree check` for variables exports and built token directories.
- `primitree init` for token repository scaffolding.
- `primitree export` for Enterprise Variables REST API access.
- Unsafe-path checks for scaffold and generated file writes.

### Requirements

- Node.js 24 or newer.
