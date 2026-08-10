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
- Configured output paths limit intermediate directory segments to 255 UTF-8
  bytes and the final directory name to 200 UTF-8 bytes. Generated file path
  segments use the 255-byte limit, with at most 64 directory levels and 16,639
  UTF-8 bytes in total.
- Portable path checks reject lone UTF-16 surrogates before filesystem encoding
  can replace them.
- Positional input checks reject malformed UTF-8, symbolic links, and special nodes.
- Configured builds compare regular source files inspected during output-path
  validation with the files they open. They reject opened-file or
  configured-path changes during the bounded snapshot read.
- Configured builds reject malformed UTF-8 in installed manifests and preserve
  primary read, parse, and scan failures when closing a file or directory also
  fails.
- Configured `build --check` rechecks the output directory and its ancestors
  throughout inspection and stops if one changes.
- Built-source scans recheck directory identity after resolving each selected
  root path.
- Positional variables JSON can be up to 20 MiB. Built token sources can contain up to 1,000 token files, 100,000 directory entries, and 64 nested directory levels. Each built-source JSON file can be up to 20 MiB, with a 256 MiB combined limit that includes the Resolver.
- Built sources support nested token files with Resolver-relative paths. Checks warn for tokens without an explicit, inherited, or alias-derived type.

### Requirements

- Node.js 24 or newer.
