# Source Graph and Output Architecture

Status: Draft for review

Date: 2026-07-27

## Purpose

The package family will accept one or more Figma variable exports, retain
source identity and alias data in a neutral graph, and render that graph as
DTCG, CSS, Tailwind, TypeScript, and metadata artifacts. The configuration
shape leaves room for more input adapters after launch.

This design adds one public package, `adapter-figma`, before npm publication.
It keeps component contracts, workbench integrations, Storybook tooling, and
additional source formats outside the first release.

## Decisions

- The first release accepts Figma variable exports through a Figma adapter.
- The core graph contains no Figma types, API calls, or mutation code.
- Each source and output has a unique ID.
- The default graph view preserves source collections, paths, modes, and
  aliases.
- The built-in profile may classify collections as `base`, `semantic`, or
  `component`.
- Builds read profile mappings from configuration. Builds do not infer or
  rewrite layers.
- Each output receives its own graph view from its selected profile. Context
  mappings belong to the profile.
- The CLI owns configuration, schema export, validation, initialization, build
  orchestration, and checks.
- README files, workflows, package scripts, and transformer configuration
  belong to `init`. Build output contains token artifacts. Diagnostics return
  through the CLI and programmatic API.
- npm publication waits for the package name, scope, repository, domain, CLI
  names, and extension key to use one identity.

## Data flow

```text
sources[]
  -> source adapters
  -> source graphs
  -> graph composition
  -> reference and context checks
  -> for each output
       -> profile and context projection
       -> output emitter
       -> artifacts
  -> diagnostics and summary
```

Source adapters retain authored values and reference edges. The composed graph
does not carry an output profile. Each output creates an immutable view of that
graph. Output emitters resolve values when their format needs concrete values.
Every emitter receives the composed graph and its output view. The DTCG output
keeps aliases as DTCG references. CSS, Tailwind, and TypeScript render the
contexts from their graph view.

## Package boundaries

| Package role    | Responsibility                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core`          | Defines the graph, source-qualified identity, composition, reference checks, context resolution, diff data, and diagnostics.                                                                                 |
| `adapter-figma` | Reads REST, plugin, and file export shapes. Maps Figma collections, variables, modes, aliases, scopes, code syntax, and provider IDs into the graph. Owns Figma API and mutation code without Node file I/O. |
| `dtcg`          | Owns the built-in DTCG, Resolver, CSS, Tailwind, TypeScript, and metadata emitters for launch. Reads DTCG input in a later release.                                                                          |
| `cli`           | Owns configuration, runtime validation, JSON Schema export, `init`, `build`, `check`, `diff`, and source/output orchestration.                                                                               |
| `hooks`         | Keeps graph and built-token hooks source-neutral. Live Figma REST hooks depend on `adapter-figma`.                                                                                                           |
| `mcp`           | Reads a graph or built artifact set. CLI composition owns raw source loading.                                                                                                                                |

The export plugin stays private. Documentation and playground applications
consume public package APIs.

### API ownership changes

| Current surface                                                            | Launch owner and change                                                                                      |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Figma types, constants, normalization, API, retry, and mutations in `core` | Move to `adapter-figma`. Reference, context, and diff code stays in `core`.                                  |
| Raw Figma input passed straight to `dtcg`                                  | Replace with `adapter-figma` graph creation followed by a `dtcg` emitter. The CLI performs this composition. |
| Live Figma REST hooks                                                      | Stay in `hooks` and call `adapter-figma`. Graph and built-artifact hooks call `core`.                        |
| Raw Figma loading in `mcp`                                                 | Move to the CLI composition boundary. `mcp` reads a graph or an artifact set.                                |
| CSS, Tailwind, TypeScript, and metadata emitters                           | Stay in `dtcg` for launch and change their input from DTCG files to a graph view.                            |

The dependency direction is one way: `adapter-figma` and `dtcg` depend on
`core`; `cli` composes all three. `hooks` may depend on `core` and
`adapter-figma`. `core` never imports an adapter or emitter.

## Configuration

The CLI exports TypeScript types, `defineConfig`, runtime validation, and JSON
Schema from one runtime schema. Configuration contains serializable data and no
function hooks. `schemaVersion` guards later configuration changes.

```ts
export default defineConfig({
  schemaVersion: 1,

  sources: [
    {
      id: 'product',
      type: 'figma',
      file: './variables.json',
      namespace: 'acme',
    },
  ],

  profiles: {
    system: {
      model: 'three-layer',
      layers: {
        base: [{ source: 'product', collection: 'Primitives' }],
        semantic: [{ source: 'product', collection: 'Semantic' }],
        component: [{ source: 'product', collection: 'Components' }],
      },
      contexts: [
        {
          id: 'theme',
          default: 'light',
          options: {
            light: [
              {
                source: 'product',
                collection: 'Semantic',
                mode: 'Light',
              },
              {
                source: 'product',
                collection: 'Components',
                mode: 'Light',
              },
            ],
            dark: [
              {
                source: 'product',
                collection: 'Semantic',
                mode: 'Dark',
              },
              {
                source: 'product',
                collection: 'Components',
                mode: 'Dark',
              },
            ],
          },
        },
      ],
    },
  },

  outputs: [
    {
      id: 'tokens',
      type: 'dtcg',
      profile: 'system',
      dir: './tokens',
      resolver: {
        name: 'Acme Design Tokens',
      },
    },
    {
      id: 'web-css',
      type: 'css',
      profile: 'system',
      file: './dist/tokens.css',
      selectors: {
        theme: '[data-theme="{value}"]',
      },
    },
    {
      id: 'tailwind',
      type: 'tailwind',
      profile: 'system',
      file: './dist/tokens.tailwind.css',
      cssOutput: 'web-css',
    },
    {
      id: 'typescript',
      type: 'typescript',
      profile: 'system',
      file: './dist/tokens.ts',
    },
    {
      id: 'metadata',
      type: 'metadata',
      profile: 'system',
      file: './dist/tokens.manifest.json',
    },
  ],
})
```

The `collection` selector matches one collection name inside one source. A
duplicate name raises a configuration error. The selector accepts
`collectionId` for that case. Context options map named Figma modes from one or
more collections onto one shared axis. The default option must select the
default mode for every listed collection. The build does not infer shared
axes. A collection may take part in at most one shared axis in the first
schema. A shared mapping must cover every mode from each participating
collection. A multi-mode collection outside a shared mapping keeps its own
source context axis. Profile context axes apply in config order. Resolution
starts with every default option, applies one selected option per axis, and
then resolves aliases. Retained source axes follow profile axes in source and
collection order.

Source and output IDs are config identifiers, not file names or package names.
A source ID qualifies group and token identity. An output ID owns one artifact
set, its staging area, and its diagnostics. Paths and display names may change
without changing those IDs.

`init` writes source IDs and may propose a three-layer mapping and shared
context axes after it inspects the export. The user must save that mapping
before a build applies it.

An output without `profile` uses the source-preserving view. One project may
render both source-preserving and profiled DTCG outputs under different output
IDs and directories.

## Sources and composition

The first release accepts one or more entries with `type: 'figma'`. Each entry
needs a unique `id`. The graph combines the source ID with each provider ID, so
two Figma files may contain the same provider ID without an internal collision.
File paths do not define identity.

A source may set `namespace` to prefix every public token path from that
source. It becomes the first path segment before the collection group in every
view. A namespace must match `[a-z0-9][a-z0-9-_]*` and enters the path without
rewriting. Adding or removing one is a public token path change.

Composition never adds a namespace or renames an existing path. Projects with
overlapping paths across sources must set namespaces that make the paths
unique.

The Figma adapter returns:

- source metadata and adapter version;
- collections with IDs, names, modes, and default modes;
- tokens with provider IDs, authored paths, values by mode, types, and
  descriptions;
- alias edges, scopes, code syntax, publication flags, and JSON Pointer
  provenance;
- adapter diagnostics.

The source-preserving view keeps collection groups and authored token paths.
Multiple sources with overlapping public paths need configured namespaces. The
build stops on an ambiguous public path.

Exact duplicate public token paths are errors. A token may also be the parent
of another token path. The DTCG emitter represents that valid prefix case with
`$root`.

Mode overrides follow Resolver order. The first profile schema defines no
cross-source override or cross-source alias rule. Every other duplicate
projected path stops the build. The CLI reports both JSON Pointers and the
projected path.

## Neutral graph

The graph represents source data before any output format changes its shape.
The data model needs these records:

```ts
interface VariableGraph {
  schemaVersion: 1
  sources: SourceRecord[]
  groups: GroupNode[]
  tokens: TokenNode[]
  contexts: ContextAxis[]
  references: ReferenceEdge[]
}

interface TokenNode {
  id: string
  sourceId: string
  externalId?: string
  groupId: string
  path: string[]
  type: TokenType
  description?: string
  authoredValues: Record<string, AuthoredValue>
  provenance: Provenance
}

interface GraphView {
  outputId: string
  profileId?: string
  groups: ProjectedGroup[]
  tokens: ProjectedToken[]
  contexts: ProjectedContextAxis[]
}

interface ProjectedToken {
  tokenId: string
  path: string[]
  layer?: 'base' | 'semantic' | 'component'
}

interface EmitterInput {
  graph: VariableGraph
  view: GraphView
}
```

The graph stores authored aliases and resolved values as different data. A
metadata output needs both. Diffs use source-qualified IDs for rename detection
and paths for consumer-facing changes.

The graph supports context axes beyond color themes. Figma modes map to source
contexts during adapter normalization. A profile may combine matching modes
from several collections into one projected axis. A future DTCG adapter will
map Resolver inputs and contexts into the same records.

`GraphView` stores output paths, layer membership, context axes, and context
order. It does not copy source values. Emitters use token IDs to read authored
values, references, and provenance from `VariableGraph`.

## Views and profiles

### Source-preserving view

The default view makes no layer claim. It emits one DTCG base file per
collection and one override file per non-default mode. The Resolver lists each
collection as a set and each multi-mode collection as a modifier.

This view supports teams whose collections represent themes, brands, density,
platforms, or another structure.

### Three-layer profile

The first schema supports the source-preserving view and one built-in
three-layer profile. The profile uses these ordered layers:

| Layer       | Values and references                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `base`      | Holds raw scales and base values. A base token may reference another base token.                                   |
| `semantic`  | Holds usage roles and themes. A semantic token may reference base or semantic tokens. Literal values remain valid. |
| `component` | Holds component decisions. A component token may reference base, semantic, or component tokens.                    |

Layer means design intent. Literal values and alias depth do not assign a
layer. Component remains a layer classification rather than a token type.

The profile changes file placement, Resolver set membership, and metadata. It
does not rewrite an authored token path. A token keeps its optional namespace,
collection group, and authored path in every view. Layer order controls
Resolver source order. It does not grant one layer permission to replace a
token from another layer.

The profile checks:

- each configured collection exists;
- the layer key set contains `base`, `semantic`, and `component` with no other
  keys;
- every collection has one layer mapping;
- references follow the built-in layer rules;
- projected paths stay unique;
- every shared context option maps valid modes;
- one collection does not take part in two shared axes;
- context mappings and output paths do not conflict.

The CLI may report a proposed mapping from collection names and reference
edges. A proposal never changes build output until the config includes it.

Custom layer IDs, path transforms, and reference policies wait for a later
schema.

## Output architecture

### DTCG and Resolver

A profiled DTCG output groups files by layer:

```text
tokens/
  base/
    acme.primitives.tokens.json
  semantic/
    acme.semantic.tokens.json
    acme.semantic.dark.tokens.json
  component/
    acme.components.tokens.json
  tokens.resolver.json
```

The Resolver orders base, semantic, and component sets before context
modifiers. Each layer is one Resolver set. Its `sources` list points to the
base files for that layer in the same order as the layer mapping entries.
Each configured shared axis becomes one Resolver modifier. Its default context
has no override files. Each other context lists the matching override files
across all mapped collections. A multi-mode collection outside a shared
mapping keeps one collection modifier.

Resolver modifiers follow profile context order. Consumers select one option
per modifier. An omitted selection uses that modifier's default. DTCG and CSS
emit independent axis overrides rather than files for every axis combination.

DTCG files retain authored references and remain split by source collection.
The layer adds a directory, not a new token group. The emitter targets DTCG
2025.10 and the Resolver module. It retains the documented boolean extension
because Figma variables include boolean values.

A file stem uses the collection slug. A namespaced source prefixes that stem,
such as `acme.semantic.tokens.json`. This keeps file ownership aligned with the
public path prefix. Artifact path collisions stop the build.

The implementation keeps the DTCG extension key behind one package constant.
Migration documentation records the extension-key change. Writers use one
documented key.

### CSS

The CSS emitter writes custom properties for the selected graph view. It emits
the default context at `:root`. A non-default option uses the selector template
for its axis. A missing template uses
`[data-{axis}="{value}"]`. CSS variable naming belongs to this emitter.

### Tailwind

The Tailwind emitter writes Tailwind CSS v4 `@theme inline` mappings that
reference the CSS custom properties. Its `cssOutput` must name a CSS output
with the same profile. Tailwind reads the variable-name map from that CSS
output. The CLI rejects a missing or mismatched CSS output. CSS owns the
context overrides. Tailwind path rules do not enter the graph.

### TypeScript

The TypeScript emitter writes typed token paths, CSS variable references, and
resolved values for the default context. It uses the same projected paths as
the selected profile.

### Metadata

`tokens.manifest.json` records:

- manifest and graph schema versions;
- stable source, group, token, and output IDs;
- authored paths, projected paths, types, descriptions, and layers;
- authored values keyed by stable context IDs;
- direct reference edges;
- provider IDs and JSON Pointer provenance;
- artifact paths;
- resolved values for the all-default context.

Callers may request another complete context selection through the resolver
API. A missing axis uses its default. The first manifest does not store every
cross-axis combination.

Workbench and Storybook integrations may consume this file after launch.
Component contract usage edges remain outside the first manifest version.
Consumers may compute transitive reference chains from the direct edges.

### Diagnostics

The build returns structured diagnostics:

```ts
interface Diagnostic {
  code: string
  severity: 'error' | 'warning' | 'info'
  phase: 'source' | 'compose' | 'profile' | 'policy' | 'output'
  sourceId?: string
  nodeId?: string
  outputId?: string
  path?: string
  message: string
  related?: DiagnosticLocation[]
}
```

Errors stop file writes. Warnings produce an exit code of zero. The CLI renders
short terminal text. Programmatic calls and MCP responses retain the fields.

## Build result

Programmatic callers receive the graph, artifacts, diagnostics, and summary:

```ts
interface BuildResult {
  graph: VariableGraph
  views: GraphView[]
  artifacts: Artifact[]
  diagnostics: Diagnostic[]
  summary: BuildSummary
}

interface Artifact {
  outputId: string
  path: string
  mediaType: string
  contents: string | Uint8Array
}
```

The CLI validates the complete artifact list before it writes a file. Duplicate
paths, paths outside the output root, unsafe link traversal, and file-directory
collisions stop the write phase. The CLI reads source files without edits and
redacts Figma access tokens from errors.

The writer keeps an ownership ledger for each output ID under
`.token-build/outputs/`. A ledger records the files from the last successful
build. The writer removes a stale file when that output's prior ledger lists
it. It leaves every unowned file in place.

Outputs may share a destination directory, but two outputs may not claim the
same path. The writer stages every output before replacement begins. It records
the files to replace or remove in a recovery journal and keeps their prior
contents in a rollback directory. A replacement failure restores changes from
that build and leaves the prior ledgers in place. The next build reads an
unfinished journal and restores it before starting new work. Successful
replacement writes all ledgers last. The writer removes the staging, rollback,
and journal data after the ledger writes succeed.

## `init` behavior

`init` detects the active package manager, pins the installed CLI version, and
writes:

- a TypeScript config;
- a source file copied from `--from` or the bundled sample;
- package scripts for build, check, diff, and backup;
- the first token build.

The command offers the three-layer profile when the export contains collection
names or references that support a useful proposal. The user reviews the
mapping before `init` saves it.

GitHub Actions, Style Dictionary, and Terrazzo templates require flags or an
interactive choice. The base scaffold does not add a workflow.

## Compatibility and migration

Tests freeze DTCG, Resolver, CSS, Tailwind, and TypeScript artifacts before
code moves across package boundaries. Golden comparisons allow the listed
behavior changes and reject unlisted output changes.

The new graph introduces these planned behavior changes:

1. Token path collisions raise errors instead of receiving suffixes.
2. `build` stops writing README, workflow, and transformer scaffold files.
3. A new product identity may replace the extension key.

The CLI will document these changes and provide migration examples.

The former hooks package ends at version 4.0.0. The replacement package family
follows one fixed version train. The release plan sets its starting version
after the product identity decision.

The fixed Changesets group will include:

```text
core
adapter-figma
dtcg
cli
hooks
mcp
```

Publication follows dependency order:

```text
core
adapter-figma and dtcg
cli, hooks, and mcp
```

## Runtime requirements

- Repository tooling uses Node 24 and pnpm 11 or newer.
- CLI, core, adapter, DTCG, and MCP packages require Node 24 or newer.
- Hooks require React 19 and the documented SWR peer range.
- Published packages ship ESM, CommonJS where declared, and type declarations.

## Verification

| Area          | Required coverage                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Core graph    | Source-qualified IDs, composition, references, cycles, contexts, output views, and structured diagnostics.                                |
| Figma adapter | REST, bare-meta, and plugin fixtures; duplicate provider IDs across sources; missing collections; unsupported values; metadata retention. |
| Profiles      | Preserve view, three-layer mapping, shared context axes, unmapped collections, layer reference rules, and duplicate projected paths.      |
| Outputs       | Golden profiled DTCG and Resolver files, CSS selectors, Tailwind and CSS linking, TypeScript types, metadata, and artifact paths.         |
| CLI           | Config validation, JSON Schema, package-manager detection, init ownership, multi-source builds, ledgers, rollback, and recovery.          |
| Packages      | Build, typecheck, tests, package exports, tarball contents, dependency order, and release metadata.                                       |

Acceptance requires:

1. `core` imports no Figma types or Figma API modules.
2. One Figma source and multiple Figma sources produce valid graphs.
3. Existing non-collision fixtures retain their expected artifacts apart from
   the listed behavior changes.
4. DTCG output retains aliases, modes, and provider metadata.
5. A profiled golden fixture proves layer folders, ordered Resolver sources,
   one shared theme modifier, unchanged token paths, and invalid mapping
   errors.
6. Metadata retains source, layer, context, and reference data.
7. CSS, Tailwind, and TypeScript emitters read the same graph view.
8. `init` works with pnpm and npm without adding a workflow by default.
9. Node 24, React 19, prose, type, test, package, and release checks pass.
10. Release tarballs contain no private workspace package or file used for
    scaffolding.
11. `core` does not import `adapter-figma`; the adapter depends on `core`.

## Deferred and separate work

The implementation plan for this architecture excludes:

- DTCG, Tokens Studio, and Style Dictionary input adapters;
- arbitrary third-party adapter functions in config;
- component contract ingestion and usage edges;
- Workbench and Storybook panels;
- VDS, DIP, or GLU policy packages;
- native platform outputs;
- layer inference during normal builds;
- custom layer IDs, path transforms, reference policies, and overlays;
- diagnostic severity overrides and diagnostic report files;
- stored transitive reference chains;
- registry publication and legacy-package deprecation actions.

The package and brand decision must finish before implementation updates public
names, executable names, documentation URLs, extension keys, and release
metadata.
