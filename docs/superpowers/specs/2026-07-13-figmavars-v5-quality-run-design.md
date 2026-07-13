# FigmaVars v5 Quality Run Design

**Status:** Approved for implementation on 2026-07-13

## Context

FigmaVars is now a pnpm and Turborepo monorepo built around five public
`@figmavars/*` packages, one private export package, a documentation site, a
playground, and a Figma plugin. The namespace migration and new applications
exist as a coherent local baseline, but the pre-release review found runtime
contract defects, DTCG edge cases, CLI and documentation drift, UI quality
gaps, and release-process weaknesses that should be resolved before any v5
publication.

This quality run harmonizes those surfaces locally. It does not perform the
external npm or GitHub administration needed for a release.

## Goals

- Make Figma Variables mutations follow the current upstream REST contract
  without breaking the public `mutator` call shape during the v5 preparation.
- Make DTCG output deterministic, reference-correct, prototype-safe, and valid
  TypeScript for hostile or colliding source names.
- Make fallback data retain whether it represents local or published variables
  so hooks never reinterpret one response type as the other.
- Make `figma-vars init` refuse every unintended overwrite and expose an
  explicit `--force` escape hatch for scaffold-owned files.
- Make CLI documentation, examples, and generated workflow claims match actual
  behavior and keep them aligned with an automated parity check.
- Make the documentation site, playground, and plugin usable at narrow
  viewports and through keyboard and assistive-technology paths.
- Make repository-local CI and release validation exercise the supported Node
  floor, validate complete package metadata, and test the exact package
  artifacts intended for later publication.
- Finish with focused review gates for every implementation slice and a fresh
  whole-branch review.

## Non-goals

- No merge, push, tag creation or movement, npm publication, GitHub release, or
  deployment.
- No npm token, trusted-publishing, environment, branch-protection, or ruleset
  mutation.
- No new public package. A private test-only dependency is acceptable only when
  it provides a durable regression check that the existing stack cannot.
- No broad visual redesign. UI changes preserve the current FigmaVars visual
  direction while repairing responsive and accessibility behavior.
- No removal of legacy public exports solely for cleanup; compatibility remains
  the default unless correctness requires an additive API.

## Architecture and ordering

Work proceeds as risk-first vertical slices. Runtime correctness and unsafe
data handling land before documentation and visual polish. Each slice uses a
red-green-refactor cycle for behavior changes, receives a task-scoped review,
and resolves Critical and Important findings before the next slice begins.

The ordered slices are:

1. API mutation and fallback contracts.
2. DTCG naming, reference, and emission safety.
3. CLI overwrite safety and documentation parity.
4. Design-engineering repairs across docs, playground, and plugin.
5. Repository-local CI, package-artifact, and release-runbook hardening.

## Runtime contracts

### Figma Variables mutations

The Variables endpoint uses one mutation transport. `mutator` will therefore
send `POST` for create, update, and delete operations; the operation remains in
the request payload. The existing `action` argument stays in the public
signature for compatibility and documentation clarity, but no longer chooses
the HTTP method. Core contract tests and hook tests must assert the same
transport and payload behavior so the packages cannot drift.

The exported mutation payload types also mirror the current endpoint contract:
create operations may use optional temporary IDs, update and delete operations
require IDs, extended collections expose their parent/mode mapping fields,
mutation colors accept both RGB and RGBA input, and an extended-mode override
may use `null` to remove the override. Discriminated action unions encode those
requirements without weakening update/delete calls.

The implementation must be checked against current official Figma REST
documentation before it changes production code. If the upstream contract does
not match this design, implementation stops and the specification is amended
instead of forcing the reviewed recommendation.

### Fallback classification

Local and published responses share the same top-level keys but have different
collection and variable members. Validation will inspect record entries and
return a discriminated classification for internal hook use. Empty records,
which cannot be inferred safely, require an explicit kind or are treated as
ambiguous rather than silently cast.

Existing raw-response validation remains available for compatibility. The
provider stores the classification, and each hook uses a fallback only when its
kind matches the endpoint it represents. A mismatched fallback uses valid live
credentials when available and otherwise exposes the existing missing-input
error path.

## DTCG safety and determinism

Collection and mode slug allocation must be keyed by stable identity or input
position, not display name. Identical names receive deterministic numeric
suffixes and cannot overwrite files or resolver entries.

Token paths are canonicalized before values and alias references are emitted.
A trie-like allocation pass identifies token/group prefix collisions, moves a
terminal token to the DTCG 2025.10 reserved `$root` leaf, and records the final
path by variable ID. Both token insertion and alias formatting consume that
same final map. Flattening, resolution, and generated outputs include `$root`
in the canonical token path exactly as required by the format specification.

Nested output dictionaries use prototype-safe construction and own-property
checks. Reserved JavaScript object segments such as `__proto__`, `prototype`,
and `constructor` are encoded deterministically so hostile source names cannot
alter prototypes or create risky generated objects.

Generated TypeScript uses a single JavaScript-string encoder for token paths,
keys, and values. Regression fixtures include quotes, backslashes, line breaks,
reserved segments, identical collection names, and prefix collisions. The
generated module must pass a real TypeScript parse/typecheck, not only string
assertions.

## CLI and documentation parity

`figma-vars init` computes every scaffold-owned destination before writing. If
any destination exists, the command reports all collisions and writes nothing.
`--force` permits replacement of only that explicit destination set; it does
not delete unrelated files or directories.

The command help, package README, docs site, and generated repository README
must agree on:

- `init` always builds its initial pipeline and has no `--build` option.
- `diff` emits Markdown by default and supports `--json` and `--out`; it has no
  `--markdown` switch.
- Backup/new argument order matches the implemented diff command.
- Generated automation claims only what the emitted workflow actually does.
- `check` documentation describes only validations implemented by the command.
- Live hook examples import low-level API helpers from `@figmavars/core` and do
  not encourage shipping a personal access token in a public client bundle.

A repository-local documentation check compares the documented option surface
with exported command help and scans examples for obsolete namespace and flag
forms. It runs in the standard test or release gate.

## Design-engineering quality

The UI slice follows the repository's existing visual system and applies these
binding interaction rules:

- Pages retain a usable layout at 320 px and 375 px without document-level
  horizontal scrolling; intentionally wide data regions scroll within their
  own labeled container.
- Interactive targets are at least 44 by 44 CSS pixels on touch layouts.
- Hover-only styling is limited to fine pointers; keyboard focus remains
  visible, and reduced-motion preferences are honored.
- Each application has one meaningful `main` landmark and a persistent page
  heading in the accessibility tree.
- Tabs and segmented controls use native or equivalent semantics with explicit
  selected state and keyboard operation.
- File and export errors are announced through an appropriate live region.
- Starting a new plugin export and every export failure clear stale downloadable
  or copyable output before actions can be used again.

Responsive fixes use content-driven breakpoints where the current interface
actually fails. They do not hide primary navigation without providing an
equivalent accessible path.

## Repository-local release hardening

The release validator expands from name/version/license checks to the complete
public contract: repository, homepage, bugs, funding, engines, publish access,
provenance, exports, executable bins where applicable, allowed workspace
dependencies, and absence of legacy namespace leakage. Tests exercise
repository discovery from a non-root working directory and representative
environment/tag cases.

The source workspace requires Node `>=22.13.0` and pnpm `11.10.0`; CI uses the
exact Node `22.13.0` runtime for source quality and publication. Published
package manifests retain the broader Node `>=20.0.0` consumer contract. That
floor is tested at exact Node `20.0.0` against downloaded package tarballs,
with no pnpm workspace install or source build in that job.

Unit coverage does not receive live Figma credentials. The Node 20 consumer
job has no source checkout, pnpm setup, repository install, source command,
secret, or identity-token permission. Package-manager build policy is
represented by the `allowBuilds` setting for `esbuild` and `sharp`. Every
workflow action reference is pinned to an approved immutable revision with a
major-version update comment.

Release packaging creates the five public tarballs once in the Node 22 quality
job, then runs metadata, Publint, type-surface, packed-file-set, checksum,
dry-run, and install checks against those exact artifacts. The hooks bundle-size
budget runs against the same single built output within that release gate. The
job uploads an artifact containing exactly the five tarballs, `manifest.json`,
and `SHA256SUMS`.

The workflow dependency chain is quality, then consumer compatibility, then
publish. The exact Node `20.0.0` consumer job downloads the quality artifact,
validates its seven-entry structure and checksums, installs all five tarballs by
absolute path with scripts, lockfile creation, audit, and funding disabled, and
smoke-tests ESM, CommonJS, and executable entry points. The tag-only publish job
depends on both preceding jobs, downloads and validates the same artifact, and
conditionally publishes the five literal tarball paths in dependency order.
The job is bound to the GitHub environment `npm`. Before each command it queries
the exact package version at the public npm registry. Only `E404` permits a
publish. An existing version is skipped only after its `dist.integrity` matches
the local tarball SRI and its `dist.attestations` contains a valid URL and the
SLSA v1 provenance predicate; every other state fails closed. Publication
accepts only strict `vMAJOR.MINOR.PATCH` tags; prerelease tags are rejected, and
every publish command names the npm registry and uses public access,
`--tag=latest`, and `--ignore-scripts`. Neither downstream job rebuilds source.
This run may implement and test that workflow locally but must not exercise its
publishing step.

A checked-in runbook separates automated preflight from manual external steps:
scope access, two-factor authentication, new-package bootstrap, trusted
publishing, the protected GitHub environment `npm`, GitHub rulesets, tag
recreation, ordered publication, partial-failure recovery,
rollback/deprecation, and post-publish verification. **Re-run failed jobs** on
the original workflow run is the only selective recovery path, and it consumes
the unchanged same-run artifact. A pushed wrong tag may move only after the old
run is canceled and terminal, the publish job never started, and all five npm
queries return `E404`. External steps remain unchecked until Mark performs
them.

## Error handling and compatibility

- Public errors remain actionable and never include access tokens.
- Unsafe CLI operations fail before the first write and name every conflicting
  destination.
- Data classification never chooses a response kind from top-level shape alone.
- DTCG conversion reports non-fatal source collisions through deterministic
  warnings while preserving resolvable output.
- Changes remain additive where practical; any unavoidable public type change
  is documented in migration notes before release.

## Verification and review

Every behavior change begins with a focused failing regression test, records
the expected failure, receives the minimum implementation, and passes its
focused package suite before broader verification.

Each slice receives a fresh task-scoped review for both specification
compliance and code quality. Review feedback is treated as a technical claim:
it is verified against current code and upstream contracts before changes are
made. Critical and Important findings block the next slice; Minor findings are
recorded for the final whole-branch review.

The final local gate includes formatting, linting, source typechecking and tests
on the Node 22 toolchain, coverage thresholds, all builds, static workflow tests
for the exact Node 20 tarball-consumer boundary, release metadata validation,
package linting, type-surface checks, size checks, exact-tarball dry runs,
narrow-viewport browser checks, and a fresh whole-branch review. The release
slice explicitly runs its focused workflow tests, a frozen install, the root
test suite, and `pnpm run check:release`. Passing that gate means the branch is
ready for Mark's later npm/GitHub phase, not that it has been merged or
released.
