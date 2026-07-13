# Repository Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local and GitHub Actions release path validate complete package contracts, test supported runtimes without secrets, and publish only the exact five tarballs that passed CI.

**Architecture:** One release inventory drives manifest validation and artifact packaging. CI builds once, tests source, packs exactly five public tarballs, validates and hashes those artifacts, then uploads them. A tag-only publish job downloads the saved artifacts and publishes them in dependency order without checkout, install, or rebuild.

**Tech Stack:** Node.js 20/22, pnpm 11, GitHub Actions, Vitest coverage-v8, Publint, Are the Types Wrong, npm tarballs.

## Global Constraints

- The public release set is exactly `@figmavars/core`, `@figmavars/dtcg`, `@figmavars/cli`, `@figmavars/hooks`, and `@figmavars/mcp`, all on one `MAJOR.MINOR.PATCH` version.
- Private apps and `@figmavars/plugin-export` are never publishable.
- Public consumer runtime remains Node `>=20.0.0`; repository development uses Node `>=20.19.0` because Vite 8 requires it.
- Unit tests use deterministic fake credentials and never receive live Figma secrets.
- CI creates the five npm tarballs once; the publish job consumes those exact checksummed files and never rebuilds.
- Package publication order is core, dtcg, then cli/hooks/mcp.
- The existing token-based publish authentication remains until trusted publishing is configured for all five packages in the later external phase.
- No publish, tag creation/movement, push, merge, deployment, credential change, ruleset change, or npm/GitHub administrative mutation during this run.
- No new public package.

---

### Task 1: Single release inventory and complete manifest validation

**Files:**

- Create: `scripts/release-config.mjs`
- Modify: `scripts/check-release.mjs`
- Modify: `scripts/check-release.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: every `packages/*/package.json` and `apps/*/package.json`.
- Produces: `PUBLIC_RELEASE_PACKAGES`, `validateReleaseManifests`, and repository validation independent of process working directory.

- [ ] **Step 1: Create the canonical release inventory**

Create `scripts/release-config.mjs`:

```js
export const PUBLIC_RELEASE_PACKAGES = [
  {
    path: 'packages/core',
    name: '@figmavars/core',
    attwProfile: 'node16',
    requiredExports: ['.', './types'],
    requiredFiles: ['dist'],
  },
  {
    path: 'packages/dtcg',
    name: '@figmavars/dtcg',
    attwProfile: 'strict',
    requiredExports: ['.'],
    requiredFiles: ['dist'],
  },
  {
    path: 'packages/cli',
    name: '@figmavars/cli',
    attwProfile: null,
    requiredBin: 'figma-vars',
    requiredFiles: ['dist'],
  },
  {
    path: 'packages/hooks',
    name: '@figmavars/hooks',
    attwProfile: 'strict',
    requiredExports: ['.', './core'],
    requiredBin: 'figma-vars-export',
    requiredFiles: ['dist', 'scripts/export-variables.mjs'],
  },
  {
    path: 'packages/mcp',
    name: '@figmavars/mcp',
    attwProfile: 'esm-only',
    requiredExports: ['.'],
    requiredBin: 'figma-vars-mcp',
    requiredFiles: ['dist'],
  },
]

export const RELEASE_REPOSITORY = 'git+https://github.com/marklearst/figmavars.git'
export const RELEASE_HOMEPAGE = 'https://github.com/marklearst/figmavars#readme'
export const RELEASE_BUGS = 'https://github.com/marklearst/figmavars/issues'
export const RELEASE_FUNDING = 'https://github.com/sponsors/marklearst'
```

- [ ] **Step 2: Expand valid test fixtures before validator code**

Build complete fixture manifests from the inventory with canonical author,
license, URLs, engine, `files`, `publishConfig`, package-specific exports/bin,
and allowed workspace dependencies. Add one negative test for each invariant:

- wrong license, author, repository URL, repository directory, homepage, bugs, or funding;
- wrong consumer engine, publish access, or provenance;
- missing description, or a missing/extra file, export, or bin entry;
- internal `@figmavars/*` dependency outside the allowlist;
- allowlisted internal dependency not using `workspace:*`;
- legacy `@figma-vars/` text anywhere in a public manifest;
- a sixth public workspace;
- validator executed from a temporary non-root current working directory.

The cwd test uses `spawnSync(process.execPath, [absoluteScriptPath], { cwd: tmpDir })` and expects status 0.

- [ ] **Step 3: Run release tests and record RED**

```bash
node --test scripts/check-release.test.mjs
```

Expected: new metadata assertions fail against the narrow validator; the
non-root cwd regression remains green because discovery already uses
`import.meta.url`.

- [ ] **Step 4: Implement inventory-driven validation**

Import the inventory and enforce:

```js
const EXPECTED_AUTHOR = 'Mark Learst'
const EXPECTED_LICENSE = 'MIT'
const EXPECTED_CONSUMER_ENGINE = '>=20.0.0'

function validateCanonicalMetadata(pkg, config, errors) {
  const { path, manifest } = pkg
  const manifestPath = `${path}/package.json`
  if (typeof manifest.description !== 'string' || manifest.description.trim() === '') {
    errors.push(`${manifestPath} must have a description`)
  }
  if (manifest.license !== EXPECTED_LICENSE) {
    errors.push(`${manifestPath} must use the MIT license`)
  }
  if (manifest.author !== EXPECTED_AUTHOR) {
    errors.push(`${manifestPath} must use author ${EXPECTED_AUTHOR}`)
  }
  if (manifest.repository?.url !== RELEASE_REPOSITORY) {
    errors.push(`${manifestPath} must use the canonical repository URL`)
  }
  if (manifest.repository?.directory !== path) {
    errors.push(`${manifestPath} repository.directory must be ${path}`)
  }
  if (manifest.homepage !== RELEASE_HOMEPAGE) {
    errors.push(`${manifestPath} must use the canonical homepage`)
  }
  if (manifest.bugs?.url !== RELEASE_BUGS) {
    errors.push(`${manifestPath} must use the canonical bugs URL`)
  }
  if (manifest.funding?.url !== RELEASE_FUNDING) {
    errors.push(`${manifestPath} must use the canonical funding URL`)
  }
  if (manifest.engines?.node !== EXPECTED_CONSUMER_ENGINE) {
    errors.push(`${manifestPath} must support Node ${EXPECTED_CONSUMER_ENGINE}`)
  }
  if (manifest.publishConfig?.access !== 'public') {
    errors.push(`${manifestPath} publishConfig.access must be public`)
  }
  if (manifest.publishConfig?.provenance !== true) {
    errors.push(`${manifestPath} publishConfig.provenance must be true`)
  }
  if (!Array.isArray(manifest.files) || !sameStringSet(manifest.files, config.requiredFiles)) {
    errors.push(`${manifestPath} files must be exactly ${config.requiredFiles.join(', ')}`)
  }
  if (JSON.stringify(manifest).includes('@figma-vars/')) {
    errors.push(`${manifestPath} contains the legacy namespace`)
  }
  const requiredExports = config.requiredExports ?? []
  if (!sameStringSet(Object.keys(manifest.exports ?? {}), requiredExports)) {
    errors.push(`${manifestPath} exports must be exactly ${requiredExports.join(', ') || '(none)'}`)
  }
  for (const exportName of requiredExports) {
    if (!manifest.exports?.[exportName]) {
      errors.push(`${manifestPath} must export ${exportName}`)
    }
  }
  if (config.requiredBin !== undefined && typeof manifest.bin?.[config.requiredBin] !== 'string') {
    errors.push(`${manifestPath} must define bin ${config.requiredBin}`)
  }
  const requiredBins = config.requiredBin === undefined ? [] : [config.requiredBin]
  if (!sameStringSet(Object.keys(manifest.bin ?? {}), requiredBins)) {
    errors.push(`${manifestPath} bins must be exactly ${requiredBins.join(', ') || '(none)'}`)
  }
}
```

Define `sameStringSet(actual, expected)` by sorting copies and comparing equal
length/elements. For every dependency in a public manifest's `dependencies`,
`optionalDependencies`, `peerDependencies`, or `devDependencies` whose name
begins `@figmavars/`, require a name from the five-package inventory and value
`workspace:*`. Do not apply that rule to private workspaces, because the plugin
app intentionally depends on private `@figmavars/plugin-export`. Keep
tag/version/private/LICENSE checks. Discover paths relative to the script URL,
never `process.cwd()`.

- [ ] **Step 5: Verify GREEN from root and non-root cwd**

```bash
node --test scripts/check-release.test.mjs
GITHUB_REF_TYPE=tag GITHUB_REF_NAME=v5.0.0 pnpm run check:release-metadata
ROOT=$(pwd)
(cd /tmp && node "$ROOT/scripts/check-release.mjs")
```

Expected: tests pass and both repository invocations report five valid public packages at 5.0.0.

- [ ] **Step 6: Commit the task**

```bash
git add scripts/release-config.mjs scripts/check-release.mjs scripts/check-release.test.mjs package.json
git commit -m "build: validate complete release metadata"
```

### Task 2: Secret-free tests and source coverage thresholds

**Files:**

- Modify: `packages/hooks/tests/test-utils.tsx`
- Modify: `packages/hooks/vitest.setup.ts`
- Modify: `packages/hooks/tests/test-utils.test.tsx`
- Modify: `packages/hooks/tests/hooks/useFigmaToken.test.tsx`
- Modify: `packages/hooks/tests/hooks/useCreateVariable.test.tsx`
- Modify: `packages/hooks/tests/hooks/useDeleteVariable.test.tsx`
- Modify: `packages/hooks/tests/hooks/useUpdateVariable.test.tsx`
- Modify: `packages/hooks/wallaby.js`
- Modify: `packages/hooks/tests/wallaby.test.js`
- Modify: `packages/hooks/package.json`
- Modify: `packages/core/vitest.config.ts`
- Modify: `packages/dtcg/vitest.config.ts`
- Modify: `packages/cli/vitest.config.ts`
- Modify: `packages/hooks/vitest.config.ts`
- Modify: `packages/mcp/vitest.config.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: deterministic test token/file key constants.
- Produces: source-only lcov/html/json-summary/text coverage for all five public packages with explicit regression floors.

- [ ] **Step 1: Make credential tests assert deterministic values**

Export from `test-utils.tsx`:

```ts
export const TEST_FIGMA_TOKEN = 'figmavars-test-token'
export const TEST_FIGMA_FILE_KEY = 'figmavars-test-file'
```

Update wrappers and hook expectations to use only those constants. Add Wallaby
tests asserting its environment does not include `VITE_FIGMA_TOKEN` or
`VITE_FIGMA_FILE_KEY` and its `files` array does not include `.env`.

- [ ] **Step 2: Run focused hooks tests and record RED**

```bash
pnpm --filter @figmavars/hooks exec vitest run tests/test-utils.test.tsx tests/hooks/useFigmaToken.test.tsx tests/hooks/useCreateVariable.test.tsx tests/hooks/useDeleteVariable.test.tsx tests/hooks/useUpdateVariable.test.tsx tests/wallaby.test.js
```

Expected: the Wallaby configuration still loads/forwards environment values.

- [ ] **Step 3: Remove environment loading from unit-test configuration**

Remove `.env` from the `wallaby.js` input files, remove dotenv setup and
forwarded credentials, and remove `dotenv` from hooks devDependencies with:

```bash
pnpm --filter @figmavars/hooks remove dotenv
```

Update setup/tests to import deterministic constants and never read
`process.env`/`import.meta.env` for credentials.

- [ ] **Step 4: Configure source-only coverage and floors**

Each public `vitest.config.ts` receives:

```ts
coverage: {
  provider: 'v8',
  include: ['src/**/*.{ts,tsx}'],
  reporter: ['text', 'json-summary', 'html', 'lcov'],
  thresholds: {
    statements: PACKAGE_STATEMENTS,
    branches: PACKAGE_BRANCHES,
    functions: PACKAGE_FUNCTIONS,
    lines: PACKAGE_LINES,
  },
},
```

Use these exact floors:

| Package | Statements | Branches | Functions | Lines |
| ------- | ---------: | -------: | --------: | ----: |
| core    |         90 |       85 |        80 |    90 |
| dtcg    |         85 |       70 |        95 |    85 |
| cli     |         70 |       50 |        80 |    70 |
| hooks   |         95 |       90 |        95 |    95 |
| mcp     |         60 |       50 |        60 |    60 |

- [ ] **Step 5: Run complete coverage and record GREEN**

```bash
pnpm --filter @figmavars/hooks test
pnpm run test:coverage
test -f packages/core/coverage/lcov.info
test -f packages/dtcg/coverage/lcov.info
test -f packages/cli/coverage/lcov.info
test -f packages/hooks/coverage/lcov.info
test -f packages/mcp/coverage/lcov.info
```

Expected: all five thresholds pass, every lcov file exists, and hooks tests emit no dotenv credential-loading line.

- [ ] **Step 6: Commit the task**

```bash
git add packages/hooks packages/core/vitest.config.ts packages/dtcg/vitest.config.ts packages/cli/vitest.config.ts packages/mcp/vitest.config.ts pnpm-lock.yaml
git commit -m "test: make coverage deterministic and secret free"
```

### Task 3: Exact release artifact creation and validation

**Files:**

- Create: `scripts/release-artifacts.mjs`
- Create: `scripts/release-artifacts.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**

- Consumes: built public package directories and `PUBLIC_RELEASE_PACKAGES`.
- Produces: `artifacts/npm/figmavars-<name>-<version>.tgz`, `manifest.json`, and `SHA256SUMS`; `packReleaseArtifacts()` and `verifyReleaseArtifacts()`.

- [ ] **Step 1: Write pure artifact validation tests**

In a temporary directory, write five dummy tarball files and a manifest. Test:

- exactly five expected package names and one shared version pass;
- missing, extra, wrong-name, and wrong-version manifest entries fail;
- missing/extra `.tgz` files and missing/extra/reordered checksum lines fail;
- symlink or non-regular tarball paths fail;
- a modified artifact fails SHA-256 verification;
- `SHA256SUMS` contains one relative filename per package in dependency order.

Use Node's built-in `node:test`, `createHash`, and temp filesystem APIs; do not mock the filesystem.

- [ ] **Step 2: Run artifact tests and record RED**

```bash
node --test scripts/release-artifacts.test.mjs
```

Expected: module/functions do not exist.

- [ ] **Step 3: Implement packing and checksum verification**

Import `fileURLToPath` from `node:url`. For each inventory entry, run one
command with `spawnSync`:

```js
const artifactDirectory = new URL('../artifacts/npm/', import.meta.url)
const outputPattern = fileURLToPath(new URL('%s-%v.tgz', artifactDirectory))
const result = spawnSync(
  'pnpm',
  ['--filter', config.name, 'pack', '--json', '--out', outputPattern],
  { cwd: repositoryRoot, encoding: 'utf8' }
)
```

Parse each JSON result and require its `name`, shared `version`, and filename
`figmavars-${config.name.split('/')[1]}-${version}.tgz`. Hash each written file
with SHA-256 and write:

```json
{
  "version": "5.0.0",
  "artifacts": [
    {
      "name": "@figmavars/core",
      "file": "figmavars-core-5.0.0.tgz",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  ]
}
```

The manifest example uses the SHA-256 of an empty fixture; production entries
contain each tarball's computed digest. Write `SHA256SUMS` as one digest, two
spaces, and the relative filename, for example
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  figmavars-core-5.0.0.tgz`.
`pack` owns and recreates `artifacts/npm`; `verify` never deletes or rebuilds
anything. Verification compares the directory's complete `.tgz` file set, the
manifest entries, and checksum lines with the five names derived from the
inventory and shared version. It rejects unlisted tarballs, symlinks, non-files,
duplicate entries, reordered checksums, uppercase/non-64-character digests,
and any computed digest mismatch.

- [ ] **Step 4: Validate exact tarballs with existing tools**

The `check` mode first verifies manifest/checksums. For every inventory entry,
call `spawnSync('pnpm', ['exec', 'publint', tarballPath, '--strict'])`. When
`config.attwProfile` is non-null, also call
`spawnSync('pnpm', ['exec', 'attw', tarballPath, '--profile',
config.attwProfile])`; this covers core (`node16`), dtcg (`strict`), hooks
(`strict`), and mcp (`esm-only`) while skipping the bin-only CLI. For all five,
call `spawnSync('npm', ['publish', tarballPath, '--dry-run',
'--ignore-scripts'])`.

Finally create a temporary consumer directory and call `spawnSync('npm',
['install', '--ignore-scripts', '--package-lock=false', ...tarballPaths],
{ cwd: consumerDirectory })`, where `tarballPaths` is the five absolute paths
in inventory order. Do not pass a shell glob or a repository-relative path.
Require all subprocesses to exit 0 and surface command, status, stdout, and
stderr on failure. Always remove the temporary consumer in `finally`.

- [ ] **Step 5: Add root scripts and ignore generated artifacts**

Add:

```json
{
  "test:release-artifacts": "node --test scripts/release-artifacts.test.mjs",
  "pack:release": "node scripts/release-artifacts.mjs pack",
  "verify:release-artifacts": "node scripts/release-artifacts.mjs verify",
  "check:release-artifacts": "node scripts/release-artifacts.mjs check",
  "check:release:built": "pnpm run check:release-metadata && pnpm run pack:release && pnpm run check:release-artifacts && pnpm --filter @figmavars/hooks run check:size",
  "check:release": "pnpm run build && pnpm run check:release:built"
}
```

Include `test:release-artifacts` in the root `test` script. Add to `.gitignore`:

```gitignore
/artifacts/
```

- [ ] **Step 6: Run RED-to-GREEN artifact verification**

```bash
node --test scripts/release-artifacts.test.mjs
pnpm run build
pnpm run check:release:built
```

Expected: five tarballs, manifest, and checksum file are created; unit tests,
Publint, ATTW, five npm dry-runs, absolute-path consumer install, metadata, and
size gates pass.

- [ ] **Step 7: Commit the task**

```bash
git add scripts/release-artifacts.mjs scripts/release-artifacts.test.mjs package.json .gitignore
git commit -m "build: validate exact npm release artifacts"
```

### Task 4: Node compatibility and tarball-first GitHub Actions

**Files:**

- Modify: `package.json`
- Modify: `CONTRIBUTING.md`
- Modify: `pnpm-workspace.yaml`
- Modify: `.github/workflows/ci.yml`
- Modify: `packages/dtcg/src/pipeline/build.ts`
- Modify: `packages/dtcg/tests/pipeline.test.ts`
- Modify: `scripts/check-release.test.mjs`

**Interfaces:**

- Consumes: source checkout, release scripts, exact artifact directory.
- Produces: Node 20.19 compatibility job, Node 22 quality/artifact job, tag-only download-and-publish job.

- [ ] **Step 1: Add failing workflow/config assertions**

In `check-release.test.mjs`, read the workflow and workspace config. Extract a
top-level job by locating its two-space-indented job key and slicing through
the next two-space job key. Assert:

```js
assert.doesNotMatch(workflow, /VITE_FIGMA_TOKEN|VITE_FIGMA_FILE_KEY/)
assert.match(workflow, /node-version: 20\.19\.0/)
assert.match(workflow, /download-artifact@[0-9a-f]{40}/)
assert.doesNotMatch(workspaceConfig, /onlyBuiltDependencies/)
```

Add exact assertions that:

- every `uses:` value in the repository workflow is one of the six approved
  40-character revisions in Step 4;
- both source jobs use checkout with `fetch-depth: 0`, while the publish job
  contains no checkout, pnpm setup, dependency install, test, or build step;
- publish uses pinned setup-node with Node 22, npm registry URL, and
  `@figmavars` scope;
- upload/download share the literal artifact name
  `npm-packages-${{ github.sha }}`, and download writes to `artifacts/npm`;
- checksum verification runs from `artifacts/npm`, manifest version is read,
  and the five exact versioned tarballs appear in dependency order without
  globs;
- publish depends on both source jobs, retains token/provenance environment,
  and tag concurrency can never be canceled.

In `pipeline.test.ts`, assert generated workflows contain exact 40-character
checkout/setup-node pins and no `actions/checkout@v4` or `actions/setup-node@v4`.

- [ ] **Step 2: Run tests and record RED**

```bash
node --test scripts/check-release.test.mjs
pnpm --filter @figmavars/dtcg exec vitest run tests/pipeline.test.ts
```

Expected: current workflow is Node-22-only, secret-bearing, mutable-tagged, and rebuilds on publish; generated workflows use mutable action tags.

- [ ] **Step 3: Harmonize local toolchain policy**

Set root `engines.node` and `CONTRIBUTING.md` to `>=20.19.0`, leaving the five
public package consumer engines at `>=20.0.0`. In `pnpm-workspace.yaml`, retain:

```yaml
allowBuilds:
  esbuild: true
  sharp: true
```

Remove `onlyBuiltDependencies` and the stale version-specific
`minimumReleaseAgeExclude` block.

- [ ] **Step 4: Pin every repository and generated workflow action**

Use these immutable revisions with major-version comments:

```yaml
actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4
actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
pnpm/action-setup@f40ffcd9367d9f12939873eb1018b921a783ffaa # v4
actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4
codecov/codecov-action@04b047e8bb82a0c002c8312c1c880fbc6a999d45 # v5
```

Generated customer workflows use the same checkout and setup-node pins.

- [ ] **Step 5: Add the Node 20.19 compatibility job**

It performs checkout with `fetch-depth: 0`, pnpm setup, Node `20.19.0`, frozen
install, typecheck, build, and tests. It receives no secrets. The Node 22
quality job also checks out with `fetch-depth: 0`, keeps lint and formatting,
runs full tests and `pnpm run test:coverage`, installs Chromium, runs
`pnpm test:e2e`, then runs `pnpm run check:release:built`.

Upload coverage from `packages/*/coverage/`. Configure Codecov with:

```yaml
files: >-
  ./packages/core/coverage/lcov.info,
  ./packages/dtcg/coverage/lcov.info,
  ./packages/cli/coverage/lcov.info,
  ./packages/hooks/coverage/lcov.info,
  ./packages/mcp/coverage/lcov.info
disable_search: true
fail_ci_if_error: true
```

Upload `artifacts/npm/` as `npm-packages-${{ github.sha }}`. On tags, run
`git merge-base --is-ancestor "$GITHUB_SHA" origin/main` before packaging;
the full checkout makes `origin/main` available.

- [ ] **Step 6: Make publish consume only downloaded artifacts**

The tag-only `publish` job depends on both compatibility and quality jobs. It
uses pinned setup-node with Node 22 plus
`registry-url: 'https://registry.npmjs.org'` and `scope: '@figmavars'`, then
downloads `npm-packages-${{ github.sha }}` to `artifacts/npm`. Its checksum step
uses `working-directory: artifacts/npm` and runs `sha256sum --check
SHA256SUMS`. The publish step reads the version from the downloaded manifest
and names every tarball exactly:

```bash
VERSION=$(node -p "require('./artifacts/npm/manifest.json').version")
npm publish "artifacts/npm/figmavars-core-${VERSION}.tgz" --access public
npm publish "artifacts/npm/figmavars-dtcg-${VERSION}.tgz" --access public
npm publish "artifacts/npm/figmavars-cli-${VERSION}.tgz" --access public
npm publish "artifacts/npm/figmavars-hooks-${VERSION}.tgz" --access public
npm publish "artifacts/npm/figmavars-mcp-${VERSION}.tgz" --access public
```

It does not checkout, install dependencies, test, or build. Retain
`NODE_AUTH_TOKEN` and
`NPM_CONFIG_PROVENANCE: 'true'` until the later trusted-publishing migration.

- [ ] **Step 7: Add safe concurrency and verify workflows locally**

Add exactly:

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref_type != 'tag' }}
```

This cancels superseded branch/PR runs but never tag runs. Then run:

```bash
node --test scripts/check-release.test.mjs
pnpm --filter @figmavars/dtcg exec vitest run tests/pipeline.test.ts
pnpm install --frozen-lockfile
pnpm run test
pnpm run check:release
```

Expected: config assertions, generated workflow tests, install, full tests, and exact-artifact release check pass.

- [ ] **Step 8: Commit the task**

```bash
git add package.json CONTRIBUTING.md pnpm-workspace.yaml .github/workflows/ci.yml packages/dtcg/src/pipeline/build.ts packages/dtcg/tests/pipeline.test.ts scripts/check-release.test.mjs
git commit -m "ci: test supported runtimes and publish tested tarballs"
```

### Task 5: Release and recovery runbook

**Files:**

- Create: `docs/releasing.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/launch/announcement.md`
- Modify: `scripts/check-release.test.mjs`

**Interfaces:**

- Consumes: local release scripts and tag-only workflow.
- Produces: separated automated/local and later external checklists with partial-publish recovery.

- [ ] **Step 1: Write the local preflight section**

Document these commands in order:

```bash
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run test:coverage
pnpm run test:e2e
pnpm run check:release
```

Explain that `artifacts/npm/manifest.json` and
`artifacts/npm/SHA256SUMS` identify the only files eligible for a given release
attempt.

- [ ] **Step 2: Document the later npm/GitHub administration checklist**

Leave every item unchecked and explicitly external:

- verify `@figmavars` ownership, 2FA, and new-package rights;
- bootstrap each package if npm requires an initial token-authenticated publish;
- configure trusted publishing for all five packages before removing token auth;
- create protected npm and GitHub environments/rulesets;
- decide the stale `v4.2.0` tag separately;
- recreate `v5.0.0` only at the final verified commit;
- push the single intended tag, never a blanket `--tags` push;
- verify GitHub release notes, npm provenance, dist-tags, package pages, and install smoke tests.

- [ ] **Step 3: Document failure recovery without rebuilding**

Use `VERSION=5.0.0` and `ARTIFACT_DIR=artifacts/npm` in command examples. Begin
every recovery by running:

```bash
(cd "$ARTIFACT_DIR" && sha256sum --check SHA256SUMS)
npm view "@figmavars/core@$VERSION" version
npm view "@figmavars/dtcg@$VERSION" version
npm view "@figmavars/cli@$VERSION" version
npm view "@figmavars/hooks@$VERSION" version
npm view "@figmavars/mcp@$VERSION" version
```

Document that a 404 identifies a missing package and any other error stops
recovery. Show one exact same-byte retry per package, to be run only when that
package is missing:

```bash
npm publish "$ARTIFACT_DIR/figmavars-core-$VERSION.tgz" --access public
npm publish "$ARTIFACT_DIR/figmavars-dtcg-$VERSION.tgz" --access public
npm publish "$ARTIFACT_DIR/figmavars-cli-$VERSION.tgz" --access public
npm publish "$ARTIFACT_DIR/figmavars-hooks-$VERSION.tgz" --access public
npm publish "$ARTIFACT_DIR/figmavars-mcp-$VERSION.tgz" --access public
```

For wrong dist-tags, use `npm dist-tag ls`, then show
`npm dist-tag add "@figmavars/core@$VERSION" latest` and
`npm dist-tag rm @figmavars/core next`; repeat explicitly for the affected
package, never republish. For bad contents, show
`npm deprecate "@figmavars/core@$VERSION" "Use 5.0.1; this release contains invalid package contents"`
and require a new patch version rather than overwrite/unpublish.

For artifact recovery, show a fresh directory and immutable run coordinates:

```bash
RUN_ID=123456789
COMMIT_SHA=0123456789abcdef0123456789abcdef01234567
RECOVERY_DIR=$(mktemp -d)
gh run download "$RUN_ID" \
  --name "npm-packages-$COMMIT_SHA" \
  --dir "$RECOVERY_DIR"
(cd "$RECOVERY_DIR" && sha256sum --check SHA256SUMS)
```

If npm succeeded but the GitHub Release failed, recreate release metadata from
the existing tag and saved files without moving the tag. Before any npm package
was published, a wrong tag may be deleted locally with `git tag -d
"v$VERSION"` and remotely with `git push origin ":refs/tags/v$VERSION"`, then
recreated only after verification. After any npm publication, do not move the
tag; stop, preserve provenance, deprecate if necessary, and release a patch.
For credential/trusted-publisher failures, preserve the directory/checksums and
retry the same files only after authentication is repaired.

- [ ] **Step 4: Link one source of truth**

Link `docs/releasing.md` from `CONTRIBUTING.md`. Replace ad-hoc release commands
in `docs/launch/announcement.md` with the runbook link so release instructions
cannot diverge.

In `check-release.test.mjs`, assert `CONTRIBUTING.md` links
`docs/releasing.md`, the announcement links `../releasing.md`, the announcement
contains neither `npm publish` nor `git push --tags`, and the runbook contains
the five exact version-query and tarball-publish command stems above.

- [ ] **Step 5: Verify formatting and commands named by the runbook**

```bash
pnpm exec prettier --check docs/releasing.md CONTRIBUTING.md docs/launch/announcement.md
node --test scripts/check-release.test.mjs scripts/release-artifacts.test.mjs
pnpm run check:release-metadata
```

Expected: docs format, release tests, and metadata validation pass. Do not execute any external checklist item.

- [ ] **Step 6: Commit the task**

```bash
git add docs/releasing.md CONTRIBUTING.md docs/launch/announcement.md scripts/check-release.test.mjs
git commit -m "docs: add the v5 release recovery runbook"
```
