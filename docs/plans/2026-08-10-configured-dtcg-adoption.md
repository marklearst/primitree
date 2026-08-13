# Configured DTCG Adoption Implementation Plan

> Implement this plan task by task. Finish each checked step before starting
> the next one.

**Goal:** Prove the full configured DTCG command sequence through packed npm
tarballs and make that sequence the first public setup path.

**Architecture:** Extend the existing packed CLI consumer instead of adding a
second test harness. Keep its local DTCG files and config as the shared example
for `check`, `inspect`, `diff`, `build`, and `build --check`. Update public docs
to describe the same two-layer source and fixed output folder.

**Tech Stack:** Node.js 24, npm 11.18.0, pnpm 11, TypeScript, DTCG 2025.10,
Node test runner, Fumadocs, Prettier, and Biome.

## Global Constraints

- Limit work to `/Users/mark/Developer/oss/primitree-worktrees/primitree-1-0-integration`.
- Run installs, tests, builds, generators, and formatters inside named
  disposable copies.
- Use no network access and add no dependency.
- Keep the older positional Figma commands working.
- Add no output format, adapter, plugin loader, remote source, or watch mode.
- Finish and commit one file set before starting the next set.
- Run a final behavior review after each code change exists.
- Run a final editorial review after each prose change exists.
- Set the author and committer to Mark Learst
  `<460323+marklearst@users.noreply.github.com>`. Commit subjects have no body
  or trailers.
- Do not push, open a pull request, switch branches, amend, rebase, reset,
  clean, or stash.

---

### Task 1: Verify configured builds through packed CLI tarballs

**Files:**

- Modify: `scripts/release-publish.test.mjs`
- Modify: `scripts/release-publish.mjs`

**Interfaces:**

- Consumes: `runPackedCliUserPath({ consumerDirectory, options, runCommand })`
- Produces: a packed-package check for `check`, `inspect`, `diff`, `build`, and
  `build --check`

- [ ] **Step 1: Add the failing command-sequence test**

  Extend the expected packed CLI calls with:

  ```js
  ['build', '--config', 'primitree.config.ts', '--source', 'brand']
  [
    'build',
    '--check',
    '--config',
    'primitree.config.ts',
    '--source',
    'brand',
  ]
  ```

  The fake packed command must create the same six relative files that the
  installed CLI writes so the release helper can inspect real files rather
  than assert on the fake command itself.

- [ ] **Step 2: Run the focused test in a disposable copy and verify RED**

  Run:

  ```sh
  node --test scripts/release-publish.test.mjs
  ```

  Expected: FAIL because the packed path does not call `build`.

- [ ] **Step 3: Add configured outputs to the packed consumer config**

  Add this source field:

  ```ts
  outputs: {
    directory: './generated',
    formats: ['dtcg', 'css', 'typescript', 'tailwind'],
  },
  ```

- [ ] **Step 4: Run the installed CLI build and read its files**

  After the existing diff check, run configured `build`. Require this exact
  relative file list:

  ```text
  .primitree-manifest.json
  css/tokens.css
  css/tokens.tailwind.css
  tokens/source.tokens.json
  tokens/tokens.resolver.json
  ts/tokens.ts
  ```

  Read every file as bytes. Run `build --check`, require exit code `0`, and
  confirm the relative paths and bytes did not change.

- [ ] **Step 5: Run the focused test in a disposable copy and verify GREEN**

  Run:

  ```sh
  node --test scripts/release-publish.test.mjs
  ```

  Expected: PASS.

- [ ] **Step 6: Run the real packed CLI consumer**

  In a fresh copy created from the Git index, run:

  ```sh
  pnpm install --offline --frozen-lockfile --ignore-scripts
  pnpm run build
  pnpm run pack:release
  node --input-type=module --eval "import path from 'node:path'; const { runPackedCliTarballConsumer } = await import('./scripts/release-publish.mjs'); runPackedCliTarballConsumer({ artifactDirectory: path.resolve('artifacts/npm') })"
  ```

  Require the real tarball CLI to create the six files and leave them
  byte-for-byte unchanged in check mode.

- [ ] **Step 7: Review and commit the release set**

  Run the code scanner on both files, inspect every signal, complete
  OMP-CODE-000 through OMP-CODE-021, and scan their prose. Run the root release
  tests, formatter check, Biome, and `git diff --check` in a disposable copy.

  Commit subject:

  ```text
  test(release): verify configured DTCG builds
  ```

---

### Task 2: Lead the documentation site with configured DTCG

**Files:**

- Modify: `apps/docs/content/docs/index.mdx`
- Modify: `apps/docs/content/docs/getting-started/index.mdx`
- Modify: `apps/docs/content/docs/cli/index.mdx`

**Interfaces:**

- Consumes: the packed two-layer DTCG config and fixed generated file list
- Produces: one setup path that starts with a local DTCG file and
  `primitree.config.ts`

- [ ] **Step 1: Rewrite the docs home introduction and quick start**

  State that Primitree checks a local DTCG source against layer and owner rules.
  Use `primitree check`, `primitree build`, and `primitree build --check` as the
  first commands. Keep Figma export as an optional input path.

- [ ] **Step 2: Replace the Getting Started sequence**

  Show installation, one two-layer DTCG file, one matching config, `check`,
  `inspect`, `build`, and `build --check`. Name every generated file. Move the
  older Figma export path to its own follow-up section.

- [ ] **Step 3: Update the CLI overview**

  Replace the Figma-first typical sequence with the same configured DTCG
  commands. Keep the command table and older command references accurate.

- [ ] **Step 4: Review and commit the docs-site set**

  Run the writing scanner on all three MDX files and review every finding. Run
  API generation, prose checks, link checks, the docs tests, formatter check,
  and `git diff --check` in a disposable copy.

  Commit subject:

  ```text
  docs: lead with configured DTCG
  ```

---

### Task 3: Match the root release note to the DTCG-first path

**Files:**

- Modify: `docs/launch/v1.0.0.md`

**Interfaces:**

- Consumes: the public setup path from Task 2
- Produces: a 1.0 release description that names local DTCG rules and outputs
  before optional Figma input

- [ ] **Step 1: Correct the release description and highlights**

  Describe local DTCG source checks, inspection, comparison, configured builds,
  and fixed first-party output formats. Keep the documented boolean extension,
  optional Figma input, package versions, requirements, and hooks migration
  facts unchanged.

- [ ] **Step 2: Review and commit the root release note**

  Run the writing scanner on the file and review every finding. Run the root
  prose checks, formatter check, and `git diff --check` in a disposable copy.

  Commit subject:

  ```text
  docs(release): describe configured DTCG builds
  ```

---

### Task 4: Verify the completed branch

**Files:**

- No source file changes

**Interfaces:**

- Consumes: Tasks 1 through 3
- Produces: command evidence for the final local report

- [ ] **Step 1: Restore the committed tree into a new disposable copy**

  Confirm its HEAD and tracked file hashes match the integration worktree.

- [ ] **Step 2: Run repository checks**

  Use the existing offline install and project scripts. Run:

  ```sh
  pnpm install --offline --frozen-lockfile --ignore-scripts
  pnpm run build
  pnpm run typecheck
  pnpm run test
  pnpm run format:check
  pnpm run lint
  pnpm run check:release:built
  node --input-type=module --eval "import path from 'node:path'; const { runPackedCliTarballConsumer } = await import('./scripts/release-publish.mjs'); runPackedCliTarballConsumer({ artifactDirectory: path.resolve('artifacts/npm') })"
  ```

- [ ] **Step 3: Report local commit and worktree state**

  Report commit hashes, subjects, file sets, command exit codes, failures,
  author and committer data, ignored live build folders, and remaining work.
  Confirm that no push, pull request, branch switch, or other-checkout write
  occurred.
