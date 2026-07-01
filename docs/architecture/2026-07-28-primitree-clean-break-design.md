# Primitree Clean-Break Rename

## Status

Approved for implementation on 2026-07-28.

## Goal

Rename the repository, public packages, applications, commands, runtime
messages, generated files, documentation, and release controls to Primitree
before the first `@primitree/*` release.

The new packages start at `1.0.0`. The former hooks package has no adoption that
justifies compatibility code in the new namespace.

## Naming rule

Primitree names product-owned code and output. Figma remains in names that
describe the Figma platform, its APIs, or data those APIs return.

Examples:

| Use Primitree           | Keep Figma          |
| ----------------------- | ------------------- |
| `primitree` command     | `FigmaVariable`     |
| `primitree-mcp` command | `FigmaApiError`     |
| `PRIMITREE_TOKENS`      | `FIGMA_TOKEN`       |
| `com.primitree`         | Figma Variables API |
| `Primitree Export`      | Figma Plugin API    |

The repository will not export an old command, type, environment variable,
extension key, plugin ID, generated path, or styling prefix from the new
packages.

## Public package surface

### CLI

`@primitree/cli` exposes one command named `primitree`.

The command owns `init`, `export`, `build`, `check`, and `diff`. Help text,
errors, generated scripts, examples, tests, package metadata, and release checks
use that command.

`@primitree/hooks` drops the standalone export executable and its supporting
script. Users who need a REST API export run `primitree export`. Users without
Enterprise REST API access can run the development Figma plugin.

### React hooks

The live API provider becomes `FigmaVariablesProvider` with
`FigmaVariablesProviderProps`.

The provider name describes its job: it supplies data from the Figma Variables
API. Primitree remains the package and product name. Figma-specific context,
hook, and data types keep their descriptive names.

The package exports no alias for the former provider name. Tests, TSDoc,
examples, generated API pages, error prefixes, DOM IDs, and filenames use the
new name.

### DTCG output

The DTCG package exports:

- `FigmaMetadataExtension`
- `PRIMITREE_EXTENSION_KEY`

The writer stores Figma metadata under `$extensions['com.primitree']`. Readers
look for `com.primitree` and ignore former keys. Users rebuild old generated
token files from their source export.

The boolean token type remains a Primitree extension to DTCG 2025.10.
Documentation will state that fact without repeating the product name in each
warning or type description.

### MCP

`@primitree/mcp` exposes `primitree-mcp`, identifies its server as `primitree`,
and reads `PRIMITREE_TOKENS`.

MCP responses expose Figma metadata from `com.primitree`. Source errors direct
users to `primitree build`.

### Generated repositories

Scaffolded scripts call `primitree`. Generated workflow staging uses
`.primitree-generated`, and the temporary root artifact uses
`primitree-artifact-root.json`.

### Figma plugin

The development plugin uses:

- Display name: `Primitree Export`
- Development ID: `primitree-export`

Plugin notifications, UI copy, tests, and documentation use the same name. The
`apps/figma-plugin` directory keeps its current name because it describes the
integration.

## Documentation and copy

The root README, package READMEs, authored docs, launch copy, release runbook,
application metadata, HTML, CLI help, runtime warnings, TSDoc, and generated API
pages will use Primitree.

Writers will use “Figma variables” for input from Figma and “design tokens” for
the DTCG output. Product copy will avoid treating those terms as synonyms.

The migration page will name the former hooks package at version 4.0.0 and its
former import paths so a user can replace them. The release runbook will retain the exact
deprecation command and former-scope checks. No other public page needs the old
product name.

The prose checker will scan Markdown, MDX, HTML, package descriptions, plugin
metadata, TSDoc, help text, and runtime messages. It will reject the former
brand outside the migration, deprecation, changelog, and release-guard lines
that need an exact package name.

## Visual assets

The fig tree mark remains.

The repository will rename the tree vector to `primitree-icon.svg`. The docs
and playground will pair that mark with a text Primitree wordmark. Mark can
replace the text treatment with the final outlined SVG without changing the
component API.

Old outlined wordmark vectors and raster taglines will leave the active
application and README paths. SVG titles, alternative text, favicons, Open
Graph images, and screenshots will use Primitree.

Docs design tokens will replace the `fv` prefix with `primitree`, including CSS
custom properties and utility classes.

## Package and release controls

The five public packages remain fixed at `1.0.0`:

1. `@primitree/core`
2. `@primitree/dtcg`
3. `@primitree/cli`
4. `@primitree/hooks`
5. `@primitree/mcp`

The workspace root, docs, playground, Figma plugin, and
`@primitree/plugin-export` remain private and omit versions.

Release validation will require the new bins, exports, extension key, generated
paths, environment variable, artifact names, repository URLs, and package
scope. The release tarballs must be rebuilt after the rename.

The initial `1.0.0` release has no pending changeset because the manifests carry
the release version. Later work uses the fixed Changesets group.

## Site and repository administration

The pull request will update source-controlled Vercel checks and deployment
instructions for the `primitree` project and `primitree-docs` workspace.

The live Vercel project uses an old build filter. The domains need assignment
after a tested production deployment exists. Maintainers will make those
account changes after the pull request passes review.

GitHub needs a protected npm environment, branch rules, immutable releases,
public repository visibility before provenance publication, and the release
settings described in the runbook. The pull request will document and test the
required state. It will not publish a package or promote a deployment.

## Verification

The implementation must pass:

- Frozen install with lifecycle scripts disabled
- Formatting and lint checks
- TypeScript checks
- Unit tests and coverage
- Package builds
- Docs generation, prose, links, and site build
- Browser tests
- Release metadata and artifact checks
- Packed-package consumer tests
- Residual old-brand scan with narrow migration and release exceptions
- Git diff and Git-visible attribution checks

The final review will inspect the packed tarballs, generated API pages, docs at
phone and desktop widths, CLI help, plugin UI, MCP startup text, and the full
repository diff.

## Pull request

The current quality and release work belongs in the same draft pull request as
the clean-break rename. Several tracked edits depend on the untracked plugin
formatter, prose scanners, and `1.0.0` release notes, so the pull request must
include those files.

The pull request will not include the earlier package-identity plan that
reserved the old command and API names. This design replaces that plan.

One focused commit will record this design. Implementation commits will group
the public code surface, docs and assets, release controls, and final cleanup so
reviewers can inspect each part.

## Separate history work

Current files and writable commit metadata contain no prohibited attribution.
Older commit snapshots and hosted pull-request refs still retain it. A normal
pull request cannot remove those objects. History rewriting and remote ref
cleanup remain a separate operation that needs its own verification and force
update.
