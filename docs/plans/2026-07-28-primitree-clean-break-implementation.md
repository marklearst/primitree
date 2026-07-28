# Primitree Clean-Break Rename Implementation Plan

> **Execution:** Work task by task. Each task ends with focused tests, a diff
> review, and a project-focused commit.

**Goal:** Ship a draft pull request that replaces the old product identity with
Primitree across public code, applications, documentation, assets, and release
controls.

**Architecture:** Primitree names product-owned interfaces and generated output.
Figma remains in names that describe Figma APIs and Figma data. The new
`@primitree/*` packages expose no old command, API, environment variable,
extension key, plugin ID, path, or styling prefix.

**Tech Stack:** Node.js 24, pnpm 11, TypeScript, React 19, Turborepo, Vite,
Next.js, Fumadocs, Vitest, the Node test runner, and Playwright.

## Global Constraints

- Keep the five public packages fixed at `1.0.0`.
- Keep the root and four private workspaces versionless.
- Remove compatibility aliases and old DTCG input support.
- Keep Figma API types, `FIGMA_TOKEN`, `FIGMA_PAT`, and `FIGMA_FILE_KEY`.
- Keep `@figma-vars/hooks@4.0.0` in migration and deprecation instructions.
- Keep former-scope rejection fixtures for `@figma-vars/*` and `@figmavars/*`.
- Use `Primitree` in prose and `primitree` in commands, IDs, paths, and keys.
- Apply the repository prose rules to Markdown, MDX, HTML, metadata, TSDoc,
  help text, and runtime messages.
- Do not publish npm packages, promote a Vercel deployment, or change a live
  domain in this pull request.
- Keep branch names, commits, and pull-request text focused on the project and
  Mark Learst’s authorship.
- Preserve the current quality and release work in the branch.

---

### Task 1: Add the old-brand regression guard

**Files:**

- Create: `scripts/brand-rules.mjs`
- Create: `scripts/check-brand.mjs`
- Create: `scripts/check-brand.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces:
  `findBrandViolations(records: Array<{ path: string, content: string | null }>): Array<{ path: string, line: number | null, match: string }>`
- Produces: `node scripts/check-brand.mjs`, which exits nonzero when a file path
  or text contains an old product identifier outside the approved migration
  lines.
- Consumes: no package build output.

- [ ] **Step 1: Write unit tests for rejected names**

Add tests that reject these values in filenames and text:

```js
const rejected = [
  'former product label',
  'former compact label',
  'former command/path form',
  'former environment/key form',
  'former CSS variable',
  'former utility class',
]
```

Cover public bins, provider names, extension keys, generated paths, plugin IDs,
and raster asset filenames.

- [ ] **Step 2: Write unit tests for approved references**

Accept Figma platform terms such as `FigmaVariable`, `Figma Variables API`,
`FIGMA_TOKEN`, and `apps/figma-plugin`.

Accept old package scopes in these files:

```text
apps/docs/content/docs/hooks/migration.mdx
docs/releasing.md
docs/launch/v1.0.0.md
docs/plans/2026-07-28-primitree-clean-break-implementation.md
packages/hooks/CHANGELOG.md
packages/hooks/README.md
scripts/check-release.mjs
scripts/check-release.test.mjs
scripts/check-brand.test.mjs
```

Limit each exception to an exact migration record, `@figma-vars/hooks`
reference, or former-scope guard pattern. Reject product copy and old runtime
identifiers in the same files. Use `null` for a filename match line and a
one-based line number for a content match.

- [ ] **Step 3: Run the focused tests and confirm the missing module failure**

Run:

```bash
node --test scripts/check-brand.test.mjs
```

Expected: FAIL because `scripts/brand-rules.mjs` does not exist.

- [ ] **Step 4: Implement the scanner**

Walk the repository without following symlinks. Exclude:

```text
.git
.next
.turbo
artifacts
coverage
dist
node_modules
```

Scan text files and file paths. Return one record per match with a one-based
line number. Do not invoke Git or a shell from the rule module.

- [ ] **Step 5: Add the command without wiring it into the root test yet**

`scripts/check-brand.mjs` should read the repository root, print each violation,
and exit with status `1` when violations exist. Add:

```json
"check:brand": "node scripts/check-brand.mjs"
```

The repository command should fail at this stage because the rename has not
run. The unit test must pass.

- [ ] **Step 6: Run tests and review the diff**

Run:

```bash
node --test scripts/check-brand.test.mjs
pnpm exec prettier --check scripts/brand-rules.mjs scripts/check-brand.mjs scripts/check-brand.test.mjs package.json
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit the guard**

```bash
git add package.json scripts/brand-rules.mjs scripts/check-brand.mjs scripts/check-brand.test.mjs
git commit -m "test: enforce Primitree identity"
```

---

### Task 2: Rename commands and generated repository output

**Files:**

- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/args.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/commands/build.ts`
- Modify: `packages/cli/src/commands/check.ts`
- Modify: `packages/cli/src/commands/diff.ts`
- Modify: `packages/cli/src/commands/export.ts`
- Modify: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/src/sample.ts`
- Modify: `packages/cli/tests/commands.test.ts`
- Modify: `packages/cli/tests/docs-parity.test.ts`
- Modify: `packages/cli/tests/public-copy.test.ts`
- Modify: `packages/dtcg/src/pipeline/build.ts`
- Modify: `packages/dtcg/tests/pipeline.test.ts`
- Modify: `packages/hooks/package.json`
- Delete: `packages/hooks/scripts/export-variables.mjs`

**Interfaces:**

- Produces: one public CLI bin named `primitree`.
- Produces: generated scripts that call `primitree`.
- Produces: `.primitree-generated` and `primitree-artifact-root.json`.
- Removes: the hooks package export bin and its script.

- [ ] **Step 1: Change focused tests to the new command contract**

Require:

```json
{
  "bin": {
    "primitree": "./dist/index.js"
  }
}
```

Assert `primitree init`, `primitree export`, `primitree build`,
`primitree check`, and `primitree diff` in help text and scaffolded files.
Assert that the hooks manifest has no `bin` field and packages no export
script.

- [ ] **Step 2: Run the package tests and confirm old-name failures**

Run:

```bash
pnpm --filter @primitree/cli test
pnpm --filter @primitree/dtcg test
```

Expected: FAIL on old command assertions.

- [ ] **Step 3: Rename the CLI and generated paths**

Update manifest bins, help, errors, examples, scaffolded scripts, workflow text,
temporary files, tests, and fixtures. Delete the hooks export script and remove
it from `files`.

- [ ] **Step 4: Run package checks**

Run:

```bash
pnpm --filter @primitree/cli typecheck
pnpm --filter @primitree/cli test
pnpm --filter @primitree/dtcg typecheck
pnpm --filter @primitree/dtcg test
pnpm --filter @primitree/hooks typecheck
node -e "const assert=require('node:assert/strict'); const cli=require('./packages/cli/package.json'); const hooks=require('./packages/hooks/package.json'); assert.deepEqual(cli.bin,{primitree:'./dist/index.js'}); assert.equal(hooks.bin,undefined)"
test ! -e packages/hooks/scripts/export-variables.mjs
```

Expected: PASS. The release suite can remain red until Task 7 updates its
contract.

- [ ] **Step 5: Commit the command surface**

Stage the files listed in this task and commit:

```bash
git commit -m "feat: rename Primitree commands"
```

---

### Task 3: Rename the React provider API

**Files:**

- Move: the former hooks provider file to
  `packages/hooks/src/contexts/FigmaVariablesProvider.tsx`
- Move: the former hooks provider test to
  `packages/hooks/tests/FigmaVariablesProvider.test.tsx`
- Modify: `packages/hooks/src/contexts/index.ts`
- Modify: `packages/hooks/src/contexts/useFigmaTokenContext.ts`
- Modify: `packages/hooks/src/index.ts`
- Modify: `packages/hooks/src/types/contexts.ts`
- Modify: `packages/hooks/src/types/index.ts`
- Modify: `packages/hooks/tests/contexts/index.test.ts`
- Modify: `packages/hooks/tests/hooks/usePublishedVariables.test.tsx`
- Modify: `packages/hooks/tests/hooks/useVariables.test.tsx`
- Modify: `packages/hooks/tests/index.test.ts`
- Modify: `packages/hooks/tests/test-utils.tsx`
- Modify: `packages/hooks/tests/tokens/tokens.test.tsx`
- Modify: `packages/hooks/CHANGELOG.md`
- Modify: `packages/hooks/README.md`

**Interfaces:**

- Produces:
  `FigmaVariablesProvider(props: FigmaVariablesProviderProps): JSX.Element`
- Removes: the old provider component and props exports.
- Keeps: `FigmaTokenContext`, `useFigmaTokenContext`, `useFigmaToken`, and
  Figma API data types.

- [ ] **Step 1: Update export and rendering tests**

Require the new provider and props names. Assert that the package root has no
old provider export. Require `[primitree]` error prefixes and
`primitree-provider-*` DOM IDs.

- [ ] **Step 2: Run the hooks tests and confirm failures**

Run:

```bash
pnpm --filter @primitree/hooks test
```

Expected: FAIL on missing new exports.

- [ ] **Step 3: Move and rename the provider**

Rename the files, component, props interface, exports, imports, TSDoc links,
examples, error strings, and test utilities. Do not add a deprecated alias.

- [ ] **Step 4: Verify the hooks package**

Run:

```bash
pnpm --filter @primitree/hooks typecheck
pnpm --filter @primitree/hooks test
pnpm --filter @primitree/hooks build
pnpm --filter @primitree/hooks test:ssr
```

Expected: PASS.

- [ ] **Step 5: Commit the provider API**

Stage the files listed in this task and commit:

```bash
git commit -m "feat: rename the Figma variables provider"
```

---

### Task 4: Rename DTCG metadata and MCP identity

**Files:**

- Modify: `packages/dtcg/src/types.ts`
- Modify: `packages/dtcg/src/emit.ts`
- Modify: `packages/dtcg/src/index.ts`
- Modify: `packages/dtcg/tests/emit.test.ts`
- Modify: `packages/dtcg/tests/golden.test.ts`
- Modify: `packages/dtcg/tests/goldens/density.compact.tokens.json`
- Modify: `packages/dtcg/tests/goldens/density.tokens.json`
- Modify: `packages/dtcg/tests/goldens/primitives.tokens.json`
- Modify: `packages/dtcg/tests/goldens/semantic.dark.tokens.json`
- Modify: `packages/dtcg/tests/goldens/semantic.tokens.json`
- Modify: `packages/mcp/package.json`
- Modify: `packages/mcp/src/cli.ts`
- Modify: `packages/mcp/src/index.ts`
- Modify: `packages/mcp/src/source.ts`
- Modify: `packages/mcp/src/tools.ts`
- Modify: `packages/mcp/tests/index.test.ts`
- Modify: `packages/mcp/tests/tools.test.ts`

**Interfaces:**

- Produces: `FigmaMetadataExtension`.
- Produces: `PRIMITREE_EXTENSION_KEY = 'com.primitree'`.
- Produces: MCP bin `primitree-mcp`, server name `primitree`, and environment
  variable `PRIMITREE_TOKENS`.
- Removes: former DTCG key reads and former MCP identity.

- [ ] **Step 1: Update DTCG tests**

Assert output under:

```json
{
  "$extensions": {
    "com.primitree": {
      "variableId": "VariableID:1:2"
    }
  }
}
```

Assert no former key exists. Require the new public type and constant names.

- [ ] **Step 2: Update MCP tests**

Require `primitree-mcp`, `PRIMITREE_TOKENS`, and server name `primitree`.
Require MCP token responses to read Figma metadata from `com.primitree`.

- [ ] **Step 3: Run tests and confirm failures**

Run:

```bash
pnpm --filter @primitree/dtcg test
pnpm --filter @primitree/mcp test
```

Expected: FAIL on old keys and names.

- [ ] **Step 4: Implement the DTCG and MCP rename**

Rename the public type and key, rebuild golden fixtures, update MCP imports,
rename its bin and environment variable, and update startup and error text.
Remove all runtime reads of the former extension key.

- [ ] **Step 5: Verify both packages**

Run:

```bash
pnpm --filter @primitree/dtcg typecheck
pnpm --filter @primitree/dtcg test
pnpm --filter @primitree/dtcg build
pnpm --filter @primitree/mcp typecheck
pnpm --filter @primitree/mcp test
pnpm --filter @primitree/mcp build
```

Expected: PASS.

- [ ] **Step 6: Commit metadata and MCP identity**

Stage the files listed in this task and commit:

```bash
git commit -m "feat: rename Primitree metadata and MCP"
```

---

### Task 5: Rename applications, visual assets, and styling tokens

**Files:**

- Move: the former icon asset to `assets/primitree-icon.svg`
- Delete: the former standalone icon asset
- Delete: former-brand tagline assets
- Replace: the former docs icon with
  `apps/docs/public/primitree-icon.svg`
- Replace: the former playground icon with
  `apps/playground/src/assets/primitree-icon.svg`
- Modify: `apps/docs/public/favicon.svg`
- Modify: `apps/playground/public/favicon.svg`
- Modify: `apps/docs/components/brand-logo.tsx`
- Modify: `apps/docs/components/landing/animated-mark.tsx`
- Modify: `apps/docs/components/landing/background.tsx`
- Modify: `apps/docs/components/landing/feature-grid.tsx`
- Modify: `apps/docs/components/landing/hero-terminal.tsx`
- Modify: `apps/docs/components/landing/hero.tsx`
- Modify: `apps/docs/components/landing/pipeline-preview.tsx`
- Modify: `apps/docs/components/landing/site-chrome.tsx`
- Modify: `apps/docs/components/landing/workflow.tsx`
- Modify: `apps/docs/components/playground/playground-app.tsx`
- Modify: `apps/docs/app/global.css`
- Modify: `apps/playground/index.html`
- Modify: `apps/playground/src/App.tsx`
- Modify: `apps/playground/src/styles.css`
- Modify: `apps/figma-plugin/manifest.json`
- Modify: `apps/figma-plugin/src/code.ts`
- Modify: `apps/figma-plugin/src/ui.html`
- Modify: `apps/figma-plugin/src/ui.ts`
- Modify: `apps/figma-plugin/tests/ui-state.test.ts`
- Modify: `apps/figma-plugin/README.md`

**Interfaces:**

- Produces: a reusable tree-mark asset named `primitree-icon.svg`.
- Produces: a docs `BrandLogo` that pairs the mark with text `Primitree`.
- Produces: CSS variables and utility classes with the `primitree` prefix.
- Produces: plugin name `Primitree Export` and ID `primitree-export`.

- [ ] **Step 1: Update application tests**

Require Primitree titles, alternative text, plugin identity, and application
copy. Add a docs component test or E2E assertion for the text wordmark.

- [ ] **Step 2: Run focused tests and confirm failures**

Run:

```bash
pnpm --filter primitree-plugin test
pnpm --filter primitree-playground test
pnpm --filter primitree-docs test
```

Expected: FAIL on old app identity.

- [ ] **Step 3: Rename assets and application identity**

Keep the fig tree path data. Update SVG titles and filenames. Compose the docs
and playground wordmark from the mark and live text. Remove old raster
wordmarks from active paths.

- [ ] **Step 4: Rename styling tokens**

Replace `--color-fv-*`, `bg-fv-*`, `text-fv-*`, and `border-fv-*` with
`primitree` equivalents across the docs app. Update tests that inspect classes
or CSS variables.

- [ ] **Step 5: Rename the development plugin**

Update the manifest, notification strings, UI copy, README, and tests. Keep
Figma Plugin API terminology.

- [ ] **Step 6: Verify applications**

Run:

```bash
pnpm --filter primitree-plugin typecheck
pnpm --filter primitree-plugin test
pnpm --filter primitree-plugin build
pnpm --filter primitree-playground typecheck
pnpm --filter primitree-playground test
pnpm --filter primitree-playground build
pnpm --filter primitree-docs test
```

Expected: PASS.

- [ ] **Step 7: Commit application identity**

Stage the files listed in this task and commit:

```bash
git commit -m "feat: update Primitree applications"
```

---

### Task 6: Rewrite documentation, TSDoc, and public copy

**Files:**

- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `apps/docs/README.md`
- Modify: `apps/docs/lib/discovery.ts`
- Modify: `apps/docs/scripts/generate-api.mjs`
- Modify: `apps/docs/app/docs/[[...slug]]/page.tsx`
- Modify: `apps/docs/content/docs/index.mdx`
- Modify: `apps/docs/content/docs/playground.mdx`
- Modify: `apps/docs/content/docs/cli/build.mdx`
- Modify: `apps/docs/content/docs/cli/check.mdx`
- Modify: `apps/docs/content/docs/cli/diff.mdx`
- Modify: `apps/docs/content/docs/cli/export.mdx`
- Modify: `apps/docs/content/docs/cli/index.mdx`
- Modify: `apps/docs/content/docs/cli/init.mdx`
- Modify: `apps/docs/content/docs/concepts/diffing.mdx`
- Modify: `apps/docs/content/docs/concepts/dtcg.mdx`
- Modify: `apps/docs/content/docs/concepts/figma-mcp.mdx`
- Modify: `apps/docs/content/docs/concepts/resolver.mdx`
- Modify: `apps/docs/content/docs/figma-plugin/index.mdx`
- Modify: `apps/docs/content/docs/getting-started/export-variables.mdx`
- Modify: `apps/docs/content/docs/getting-started/index.mdx`
- Modify: `apps/docs/content/docs/getting-started/pipeline-output.mdx`
- Modify: `apps/docs/content/docs/hooks/index.mdx`
- Modify: `apps/docs/content/docs/hooks/live-api.mdx`
- Modify: `apps/docs/content/docs/hooks/local-tokens.mdx`
- Modify: `apps/docs/content/docs/hooks/migration.mdx`
- Modify: `apps/docs/content/docs/mcp/index.mdx`
- Modify: `docs/architecture/2026-07-27-source-graph-output-design.md`
- Modify: `docs/launch/announcement.md`
- Modify: `docs/launch/v1.0.0.md`
- Modify: `docs/releasing.md`
- Confirm absent: `docs/plans/primitree-package-identity.md`
- Modify: `packages/cli/README.md`
- Modify: `packages/cli/CHANGELOG.md`
- Modify: `packages/core/README.md`
- Modify: `packages/core/CHANGELOG.md`
- Modify: `packages/dtcg/README.md`
- Modify: `packages/dtcg/CHANGELOG.md`
- Modify: `packages/hooks/README.md`
- Modify: `packages/hooks/CHANGELOG.md`
- Modify: `packages/mcp/README.md`
- Modify: `packages/mcp/CHANGELOG.md`
- Modify: `packages/core/src/normalize/normalize.ts`
- Modify: `packages/dtcg/src/emit.ts`
- Modify: `packages/dtcg/src/types.ts`
- Modify: `packages/hooks/src/index.ts`
- Modify: `packages/hooks/src/tokens/TokensProvider.tsx`
- Modify: `packages/hooks/src/tokens/index.ts`
- Modify: `packages/hooks/src/tokens/useTheme.ts`
- Modify: `packages/mcp/src/cli.ts`
- Modify: `packages/mcp/src/source.ts`
- Modify: `apps/docs/tests/api-reference.test.ts`
- Modify: `apps/docs/tests/discovery.test.ts`
- Modify: `packages/cli/tests/docs-parity.test.ts`
- Modify: `packages/cli/tests/public-copy.test.ts`
- Modify: `scripts/check-prose.test.mjs`
- Modify: `tests/e2e/docs-playground.spec.ts`
- Modify: `tests/e2e/docs-shell.spec.ts`

**Interfaces:**

- Produces: public copy that uses Primitree for the product and Figma variables
  for source data.
- Produces: one migration table from the old hooks package to
  `@primitree/hooks`.
- Produces: generated API pages with Primitree headings and renamed public
  symbols.

- [ ] **Step 1: Update copy tests and route assertions**

Require:

```text
Primitree
primitree
@primitree/*
https://primitree.com
```

Keep old package scope assertions in migration and deprecation tests. Reject
the old product name in homepage, metadata, CLI help, and generated API titles.

- [ ] **Step 2: Run focused docs tests and confirm failures**

Run:

```bash
pnpm --filter primitree-docs test
node --test scripts/check-prose.test.mjs scripts/prose/rules.test.mjs
```

Expected: FAIL on old product copy.

- [ ] **Step 3: Rewrite authored documentation**

Update README files, MDX, launch copy, changelogs, release instructions, and the
source graph design. Keep sentences direct. Remove banned filler, binary
contrast patterns, em dashes, vague claims, and repeated brand mentions.

- [ ] **Step 4: Rewrite TSDoc and runtime messages**

Update source comments, warning strings, help text, and plugin HTML. Keep Figma
in descriptive API and data names.

- [ ] **Step 5: Regenerate API documentation**

Run:

```bash
pnpm --filter primitree-docs run generate:api
```

Inspect all generated pages for old public symbols and old product headings.

- [ ] **Step 6: Verify prose and links**

Run:

```bash
pnpm run check:prose
pnpm --filter primitree-docs run check:links
pnpm --filter primitree-docs test
```

Expected: PASS.

- [ ] **Step 7: Commit documentation**

Stage the files listed in this task and commit:

```bash
git commit -m "docs: complete the Primitree rename"
```

---

### Task 7: Update release, CI, and deployment controls

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/version-packages.yml`
- Modify: `.changeset/README.md`
- Modify: `.changeset/config.json`
- Modify: `apps/docs/next.config.mjs`
- Modify: `apps/docs/vercel.json`
- Modify: `apps/docs/tests/vercel-config.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `scripts/check-release.mjs`
- Modify: `scripts/check-release.test.mjs`
- Modify: `scripts/release-config.mjs`
- Modify: `scripts/release-artifacts.mjs`
- Modify: `scripts/release-artifacts.test.mjs`
- Modify: `scripts/release-publish.mjs`
- Modify: `scripts/release-publish.test.mjs`
- Modify: `scripts/github-release.mjs`
- Modify: `scripts/github-release.test.mjs`
- Modify: `playwright.config.ts`
- Modify: `tests/e2e/docs-shell.spec.ts`
- Modify: `tests/e2e/docs-playground.spec.ts`
- Modify: `tests/e2e/standalone-playground.spec.ts`
- Modify: `turbo.json`

**Interfaces:**

- Produces release inventory with bins `primitree` and `primitree-mcp`; hooks
  has no bin.
- Produces CI coverage upload with Codecov OIDC and job-level
  `id-token: write`.
- Produces Vercel checks for project `primitree`, workspace
  `primitree-docs`, and `https://primitree.com`.
- Wires `check:brand` into root tests and release checks.

- [ ] **Step 1: Update release contract tests**

Require new bins, no hooks bin, new extension key, new command smoke tests, new
artifact content, and new docs route markers. Keep fixed package order and
`1.0.0`.

- [ ] **Step 2: Update CI trust tests**

Require the Codecov step to use:

```yaml
permissions:
  contents: read
  id-token: write
```

and:

```yaml
with:
  use_oidc: true
```

Reject `CODECOV_TOKEN` in the workflow.

- [ ] **Step 3: Run release tests and confirm failures**

Run:

```bash
node --test scripts/check-release.test.mjs scripts/release-artifacts.test.mjs scripts/release-publish.test.mjs scripts/github-release.test.mjs
```

Expected: FAIL on old bins, old smoke commands, and old route markers.

- [ ] **Step 4: Update release inventory and scripts**

Require:

```text
@primitree/cli -> primitree
@primitree/hooks -> no bin
@primitree/mcp -> primitree-mcp
```

Update packed-consumer commands, attestation fixtures, temp paths, release
copy, GitHub Release text, and Vercel assertions.

- [ ] **Step 5: Wire the brand guard**

Add `node --test scripts/check-brand.test.mjs` to the root test command. Add
`pnpm run check:brand` before packaging in `check:release:built`.

Run:

```bash
pnpm run check:brand
```

Expected: PASS after Tasks 2 through 6.

- [ ] **Step 6: Refresh the lockfile without lifecycle scripts**

Run:

```bash
pnpm install --lockfile-only --no-frozen-lockfile --ignore-scripts
pnpm install --frozen-lockfile --ignore-scripts
```

Expected: PASS.

- [ ] **Step 7: Verify release controls**

Run:

```bash
node scripts/check-release.mjs
node --test scripts/check-brand.test.mjs scripts/check-release.test.mjs scripts/release-artifacts.test.mjs scripts/release-publish.test.mjs scripts/github-release.test.mjs
pnpm run check:brand
git diff --check
```

Expected: PASS.

- [ ] **Step 8: Commit release controls**

Stage the files listed in this task and commit:

```bash
git commit -m "ci: enforce the Primitree release contract"
```

---

### Task 8: Run full verification and inspect built output

**Files:**

- Modify files required to fix a verified failure from this task.

**Interfaces:**

- Consumes: all source, docs, assets, tests, and release controls from Tasks 1
  through 7.
- Produces: a verified branch ready for draft pull-request review.

- [ ] **Step 1: Clean ignored generated output**

Run Git’s ignore check for each target before removing generated output:

```bash
for path in apps/docs/.next apps/docs/.turbo apps/playground/dist apps/figma-plugin/dist packages/cli/dist packages/core/dist packages/dtcg/dist packages/hooks/dist packages/mcp/dist packages/plugin-export/dist packages/cli/coverage packages/core/coverage packages/dtcg/coverage packages/hooks/coverage packages/mcp/coverage .turbo artifacts; do
  test ! -e "$path" || git check-ignore -q "$path"
done
rm -rf apps/docs/.next apps/docs/.turbo apps/playground/dist apps/figma-plugin/dist packages/cli/dist packages/core/dist packages/dtcg/dist packages/hooks/dist packages/mcp/dist packages/plugin-export/dist packages/cli/coverage packages/core/coverage packages/dtcg/coverage packages/hooks/coverage packages/mcp/coverage .turbo artifacts
```

Do not remove authored or untracked source files.

- [ ] **Step 2: Run the full local gate**

Run:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run build
pnpm run test
pnpm run test:coverage
pnpm run check:release
pnpm run test:e2e
```

Expected: PASS. Record lint warnings without hiding them.

- [ ] **Step 3: Inspect release artifacts**

Run:

```bash
node scripts/release-artifacts.mjs verify
(cd artifacts/npm && shasum -a 256 -c SHA256SUMS)
```

Inspect each tarball with `pnpm pack --dry-run` or `tar -tf`. Confirm new bins,
new public type declarations, and no old brand files.

- [ ] **Step 4: Inspect the docs and applications**

Run the docs app and inspect phone and desktop widths. Check:

```text
/
/docs
/docs/getting-started
/docs/hooks/live-api
/docs/hooks/migration
/docs/mcp
/playground
```

Confirm the Primitree wordmark, tree mark, metadata, focus states, code samples,
and route titles.

- [ ] **Step 5: Audit residual names and Git metadata**

Run:

```bash
pnpm run check:brand
git diff --check
git log origin/main..HEAD --format='%H%n%an <%ae>%n%B'
git branch --show-current
git diff --stat origin/main...HEAD
git status -sb
```

Confirm no prohibited attribution appears in commits, the branch, or pending
pull-request text.

- [ ] **Step 6: Request code review and address findings**

Run independent reviews for public API behavior, docs and assets, release
controls, and Git metadata. Reproduce each issue before changing code. Rerun
the affected focused test after each fix. Rerun the full gate after all fixes.

- [ ] **Step 7: Commit verified fixes**

Stage each verified fix by path and commit:

```bash
git commit -m "chore: finish the Primitree launch pass"
```

Skip this commit when review finds no changes.

---

### Task 9: Push and open the draft pull request

**Files:**

- No source edits unless final metadata review finds a project-text problem.

**Interfaces:**

- Consumes: the verified `quality/primitree-launch` branch.
- Produces: a draft pull request into `marklearst/primitree:main`.

- [ ] **Step 1: Confirm GitHub access**

Run:

```bash
gh --version
gh auth status
gh repo view marklearst/primitree --json nameWithOwner,defaultBranchRef,visibility
```

- [ ] **Step 2: Review commit and file scope**

Run:

```bash
git status -sb
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
git diff --name-status origin/main...HEAD
```

Confirm the branch contains the design, current quality work, clean-break
rename, tests, docs, and release controls.

- [ ] **Step 3: Push the branch**

Run:

```bash
git push -u origin quality/primitree-launch
```

- [ ] **Step 4: Open a draft pull request**

Use title:

```text
Complete the Primitree 1.0 rename
```

The body must cover:

- Public commands and API renames
- Docs, plugin, playground, and visual assets
- Package and release controls
- Tests and release artifact checks
- External GitHub, npm, and Vercel setup that remains

Use project-focused text and Mark Learst’s authorship.

- [ ] **Step 5: Verify the hosted pull request**

Confirm the title, body, base branch, head branch, commits, and changed-file
list. Report CI status without merging the pull request.
