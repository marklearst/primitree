# Repository Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local and GitHub Actions release path validate complete package contracts, test supported runtimes without secrets, and publish only the exact five tarballs that passed CI.

**Architecture:** One release inventory drives manifest validation and artifact packaging. A Node 22 quality job builds and tests source, packs exactly five public tarballs, validates and hashes them, then uploads one seven-file artifact. An exact Node 20 consumer job downloads, validates, installs, and smoke-tests those tarballs without touching the source workspace. A stable-tag-only publish job depends on both jobs and publishes the same downloaded tarballs in dependency order without checkout, install, or rebuild.

**Tech Stack:** Node.js 22.13 source tooling, Node.js 20.0 tarball-consumer testing, pnpm 11.10, GitHub Actions, Vitest coverage-v8, Publint, Are the Types Wrong, npm tarballs.

## Global Constraints

- The public release set is exactly `@figmavars/core`, `@figmavars/dtcg`, `@figmavars/cli`, `@figmavars/hooks`, and `@figmavars/mcp`, all on one `MAJOR.MINOR.PATCH` version.
- Private apps and `@figmavars/plugin-export` are never publishable.
- Public consumer runtime remains Node `>=20.0.0`; the source workspace requires Node `>=22.13.0` and pnpm `11.10.0`.
- Unit tests use deterministic fake credentials and never receive live Figma secrets.
- CI creates the five npm tarballs once; the exact Node `20.0.0` consumer job and Node `22.13.0` publish job download those checksummed files and never rebuild them.
- The consumer job depends on quality, and publish depends on both quality and consumer compatibility.
- Publication accepts only strict stable `vMAJOR.MINOR.PATCH` tags. Every real publish names the npm registry and uses public access, `--tag=latest`, and `--ignore-scripts`.
- Package publication order is core, dtcg, cli, hooks, then mcp.
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
- missing or extra directory entries and missing/extra/reordered checksum lines
  fail;
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

Import `path` from `node:path` and `fileURLToPath` from `node:url`. Resolve the
artifact URL to an absolute filesystem directory, then use native
`path.join` for the pnpm output pattern. For each inventory entry, run one
command with `spawnSync`:

```js
const artifactDirectory = fileURLToPath(new URL('../artifacts/npm/', import.meta.url))
const outputPattern = path.join(artifactDirectory, '%s-%v.tgz')
const result = spawnSync(
  'pnpm',
  [
    '--filter',
    config.name,
    'pack',
    '--json',
    '--out',
    outputPattern,
    '--config.ignore-scripts=true',
  ],
  { cwd: repositoryRoot, encoding: 'utf8' }
)
```

Parse each JSON result and require its `name`, shared `version`, and filename
`figmavars-${config.name.split('/')[1]}-${version}.tgz`. Require the reported
filename to be absolute after resolution, have the expected basename, and
resolve to the exact expected absolute path:

```js
const expectedFilename = `figmavars-${config.name.split('/')[1]}-${version}.tgz`
const expectedPath = path.join(artifactDirectory, expectedFilename)
if (
  typeof packResult.filename !== 'string' ||
  path.basename(packResult.filename) !== expectedFilename ||
  path.resolve(packResult.filename) !== expectedPath
) {
  throw new Error(`pnpm pack returned an unsafe filename for ${config.name}`)
}
```

This rejects parent traversal and any output outside the owned artifact
directory. Hash each written file with SHA-256 and write:

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
anything. Verification requires the complete directory entry set to be exactly
the five tarballs, `manifest.json`, and `SHA256SUMS`. It compares the manifest
entries and checksum lines with the five names derived from the inventory and
shared version. It rejects missing or extra entries, symlinks, non-files,
duplicate entries, reordered checksums, uppercase/non-64-character digests,
and any computed digest mismatch.

- [ ] **Step 4: Validate exact tarballs with existing tools**

The `check` mode first verifies manifest/checksums. For every inventory entry,
call `spawnSync('pnpm', ['exec', 'publint', tarballPath, '--strict'])` exactly;
do not insert `run`. When
`config.attwProfile` is non-null, also call
`spawnSync('pnpm', ['exec', 'attw', tarballPath, '--profile',
config.attwProfile])`; this covers core (`node16`), dtcg (`strict`), hooks
(`strict`), and mcp (`esm-only`) while skipping the bin-only CLI. For all five,
call `spawnSync('npm', ['publish', tarballPath, '--dry-run',
'--offline', '--provenance=false', '--access=public', '--tag=latest',
'--ignore-scripts', '--registry=https://registry.npmjs.org/'])`.

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
- Produces: exact Node `22.13.0` source-quality artifact job, exact Node
  `20.0.0` downloaded-tarball consumer job, and stable-tag-only
  download-and-publish job.

- [ ] **Step 1: Add failing workflow/config assertions**

In `check-release.test.mjs`, read the workflow, root manifest, public manifests,
and workspace config. Extract a top-level job by locating its
two-space-indented job key and slicing through the next two-space job key.
Assert:

```js
assert.doesNotMatch(workflow, /VITE_FIGMA_TOKEN|VITE_FIGMA_FILE_KEY/)
assert.equal(rootManifest.engines.node, '>=22.13.0')
assert.match(workflow, /node-version: 22\.13\.0/)
assert.match(workflow, /node-version: 20\.0\.0/)
assert.match(workflow, /download-artifact@[0-9a-f]{40}/)
assert.doesNotMatch(workspaceConfig, /onlyBuiltDependencies/)
```

Add exact assertions that:

- every `uses:` value in the repository workflow is one of the six approved
  40-character revisions in Step 4;
- each public package retains `engines.node: ">=20.0.0"` while the root and
  contributor documentation require Node `>=22.13.0` and pnpm `11.10.0`;
- the top-level jobs are `quality`, `consumer-compatibility`, and `publish`;
  consumer compatibility needs quality, and publish needs both preceding jobs;
- only quality uses checkout and pnpm setup. Its checkout uses
  `fetch-depth: 0` and `persist-credentials: false`, and its setup-node action
  uses exact Node `22.13.0` with the pnpm cache and lockfile dependency path;
- consumer compatibility uses exact Node `20.0.0` and contains no checkout,
  pnpm setup, source install/build/typecheck/test command, secret reference, or
  `id-token` permission;
- publish uses pinned setup-node with exact Node `22.13.0`, npm registry URL, and
  `@figmavars` scope;
- quality upload and both downloads share the literal artifact name
  `npm-packages-${{ github.sha }}` and path `artifacts/npm`;
- consumer and publish each reject anything other than the five expected
  tarballs, `manifest.json`, and `SHA256SUMS`; verify manifest names, shared
  stable version, checksum order, regular-file status, and SHA-256 digests;
- the consumer install uses the five absolute tarball paths in dependency order
  with the registry, engine-strict, no-user-config, no-script, no-lockfile,
  no-save, no-audit, and no-funding safeguards from Step 6;
- consumer smoke tests cover the required ESM and CommonJS exports plus all
  three executable `--help` paths;
- quality rejects every tag except strict `vMAJOR.MINOR.PATCH` and proves the
  tagged commit is on `origin/main`;
- publish is tag-only, retains token/provenance environment only in that job,
  names five literal tarballs in dependency order without globs, and gives
  every command `--registry=https://registry.npmjs.org`, `--access=public`,
  `--tag=latest`, and `--ignore-scripts`;
- concurrency is the exact two-line policy in Step 8, so tag runs cannot be
  canceled.

In `pipeline.test.ts`, assert generated workflows contain exact 40-character
checkout/setup-node pins and no `actions/checkout@v4` or `actions/setup-node@v4`.

- [ ] **Step 2: Run tests and record RED**

```bash
node --test scripts/check-release.test.mjs
pnpm --filter @figmavars/dtcg exec vitest run tests/pipeline.test.ts
```

Expected: the current workflow does not yet enforce the reviewed three-job
dependency chain, exact runtime boundary, immutable actions, stable-tag gate,
artifact validation in both downstream jobs, or tarball-only consumer smoke
tests. Generated workflows still use mutable action tags.

- [ ] **Step 3: Harmonize local toolchain policy**

Keep `packageManager` at `pnpm@11.10.0`. Set root `engines.node` and
`CONTRIBUTING.md` to `>=22.13.0`, leaving the five public package consumer
engines at `>=20.0.0`. In `pnpm-workspace.yaml`, retain:

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

- [ ] **Step 5: Build and upload once in the Node 22 quality job**

The `quality` job checks out with `fetch-depth: 0` and
`persist-credentials: false`, configures pnpm `11.10.0`, and uses exact Node
`22.13.0` with `cache: pnpm` and `cache-dependency-path: pnpm-lock.yaml`. It
runs the frozen install, formatting, linting, typechecking, build, root tests,
and `pnpm run test:coverage`. It installs Chromium and runs `pnpm test:e2e`.
No live Figma credential is present.

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

Configure the `artifacts/npm/` upload as
`npm-packages-${{ github.sha }}`. On tags, run an explicit gate before
packaging that accepts only `^v[0-9]+\.[0-9]+\.[0-9]+$`, rejects prerelease
tags, invokes tag-aware `pnpm run check:release-metadata` to compare the tag
with the five public package versions, and runs
`git merge-base --is-ancestor "$GITHUB_SHA" origin/main`. The full checkout
makes `origin/main` available.

After the tag gate, run `pnpm run check:release:built`. Require it to leave
`artifacts/npm` with exactly five tarballs, `manifest.json`, and
`SHA256SUMS`. Upload that directory only after release-artifact validation
succeeds.

- [ ] **Step 6: Test downloaded tarballs at exact Node 20.0.0**

Add `consumer-compatibility` with `needs: quality`. It uses exact Node `20.0.0`
and downloads `npm-packages-${{ github.sha }}` to `artifacts/npm`. It has no
checkout, pnpm setup, repository install, source command, secret, or
`id-token: write` permission.

Using Node built-ins, validate before installation that the artifact directory
contains exactly these seven regular, non-symlink files:

```text
figmavars-core-<version>.tgz
figmavars-dtcg-<version>.tgz
figmavars-cli-<version>.tgz
figmavars-hooks-<version>.tgz
figmavars-mcp-<version>.tgz
manifest.json
SHA256SUMS
```

Require a strict stable manifest version, the five manifest entries in release
inventory order, matching names and filenames, lowercase 64-character digests,
and checksum lines in the same order. On a tag run, require `v$VERSION` to
equal `$GITHUB_REF_NAME`. Run `sha256sum --check SHA256SUMS` from
`artifacts/npm` after structural validation.

Create a temporary consumer directory and install the five absolute tarball
paths in dependency order:

```bash
NPM_CONFIG_USERCONFIG=/dev/null npm install \
  --registry=https://registry.npmjs.org \
  --engine-strict \
  --ignore-scripts \
  --package-lock=false \
  --no-save \
  --audit=false \
  --fund=false \
  "$ARTIFACT_DIR/figmavars-core-$VERSION.tgz" \
  "$ARTIFACT_DIR/figmavars-dtcg-$VERSION.tgz" \
  "$ARTIFACT_DIR/figmavars-cli-$VERSION.tgz" \
  "$ARTIFACT_DIR/figmavars-hooks-$VERSION.tgz" \
  "$ARTIFACT_DIR/figmavars-mcp-$VERSION.tgz"
```

Smoke-test ESM imports for `@figmavars/core`, `@figmavars/core/types`,
`@figmavars/dtcg`, `@figmavars/hooks`, `@figmavars/hooks/core`, and
`@figmavars/mcp`. Smoke-test CommonJS `require` for core, core types, dtcg,
hooks, and hooks core. Run `figma-vars --help`,
`figma-vars-export --help`, and `figma-vars-mcp --help` from the temporary
install.

- [ ] **Step 7: Publish only the validated stable-tag artifact**

The `publish` job has `needs: [quality, consumer-compatibility]` and runs only
for tags that passed the quality job's strict stable-tag gate. It uses pinned
setup-node with exact Node `22.13.0` plus
`registry-url: 'https://registry.npmjs.org'` and `scope: '@figmavars'`, then
downloads `npm-packages-${{ github.sha }}` to `artifacts/npm`. Bind the job to
the exact GitHub environment `npm`. A missing environment reference may create
an unprotected record; it does not configure or prove protection, `NPM_TOKEN`,
or trusted-publisher settings. An administrator must configure them before a
tag run.

Repeat the exact seven-file, manifest, regular-file, checksum-order, and digest
validation from the consumer job before publication. Read the stable version
from the downloaded manifest and require `v$VERSION` to equal
`$GITHUB_REF_NAME`. Before each literal publish command, query the exact
package/version with `--registry=https://registry.npmjs.org`. Only exact npm
`E404` permits publication. For an existing version, compute the local tarball
SRI as `sha512-${base64 SHA-512 bytes}` and require equality with
`dist.integrity`, a valid `dist.attestations.url`, and
`dist.attestations.provenance.predicateType ===
https://slsa.dev/provenance/v1`; then skip that package. Any other error or
metadata mismatch fails closed. Keep the five tarball commands literal:

```bash
VERSION=$(node -p "require('./artifacts/npm/manifest.json').version")
npm publish "artifacts/npm/figmavars-core-${VERSION}.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "artifacts/npm/figmavars-dtcg-${VERSION}.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "artifacts/npm/figmavars-cli-${VERSION}.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "artifacts/npm/figmavars-hooks-${VERSION}.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "artifacts/npm/figmavars-mcp-${VERSION}.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
```

It does not checkout, install dependencies, test, or build. Retain
`NODE_AUTH_TOKEN` and
`NPM_CONFIG_PROVENANCE: 'true'` until the later trusted-publishing migration.
Only this job receives the npm secret and `id-token: write` permission.
This makes **Re-run failed jobs** on the original run the only supported
selective recovery path: it downloads the unchanged same-run artifact and
skips only matching packages that the same attempt already published.

- [ ] **Step 8: Add safe concurrency and verify workflows locally**

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

Expected: config assertions, generated workflow tests, the frozen install, the
full root tests, and the exact-artifact release check pass.

- [ ] **Step 9: Commit the task**

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
- create protected npm and GitHub environments/rulesets, including the exact
  GitHub environment `npm`, its `NPM_TOKEN`, and trusted-publisher settings;
- decide the stale `v4.2.0` tag separately;
- recreate `v5.0.0` only at the final verified commit;
- push the single intended tag, never a blanket `--tags` push;
- verify GitHub release notes, npm provenance, dist-tags, package pages, and install smoke tests.

- [ ] **Step 3: Document failure recovery without rebuilding**

Make **Re-run failed jobs** on the original tag workflow run the only supported
selective recovery path. It must download the unchanged same-run artifact and
must not rebuild or accept a locally substituted tarball. The idempotent
publish step queries each exact package/version at the public npm registry.
Only `E404` publishes a missing package; an existing version is skipped only
after `dist.integrity` matches the local SRI and `dist.attestations` proves the
SLSA v1 provenance predicate. Any other state fails closed.

Use `VERSION=5.0.0` and `ARTIFACT_DIR=artifacts/npm` in audit examples. Begin
every audit with the macOS-provided `shasum` command below. GitHub's Linux jobs
use `sha256sum --check SHA256SUMS` instead.

```bash
(cd "$ARTIFACT_DIR" && shasum -a 256 -c SHA256SUMS)
npm view "@figmavars/core@$VERSION" version --registry=https://registry.npmjs.org
npm view "@figmavars/dtcg@$VERSION" version --registry=https://registry.npmjs.org
npm view "@figmavars/cli@$VERSION" version --registry=https://registry.npmjs.org
npm view "@figmavars/hooks@$VERSION" version --registry=https://registry.npmjs.org
npm view "@figmavars/mcp@$VERSION" version --registry=https://registry.npmjs.org
```

Document that only exact `E404` identifies a missing package and any other
error stops recovery. Keep the five commands below as literal references to
what CI conditionally executes, and forbid maintainers from executing them
locally because local publication cannot preserve provenance:

```bash
npm publish "$ARTIFACT_DIR/figmavars-core-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "$ARTIFACT_DIR/figmavars-dtcg-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "$ARTIFACT_DIR/figmavars-cli-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "$ARTIFACT_DIR/figmavars-hooks-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "$ARTIFACT_DIR/figmavars-mcp-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
```

For wrong dist-tags, pin `npm dist-tag ls`, `npm dist-tag add`, and
`npm dist-tag rm` to `--registry=https://registry.npmjs.org`; repair the
affected package without republishing. Pin `npm deprecate` to the same registry
for bad contents and require a new patch version rather than
overwrite/unpublish.

For artifact recovery, show a fresh directory and immutable run coordinates:

```bash
RUN_ID=123456789
COMMIT_SHA=0123456789abcdef0123456789abcdef01234567
RECOVERY_DIR=$(mktemp -d)
gh run download "$RUN_ID" \
  --name "npm-packages-$COMMIT_SHA" \
  --dir "$RECOVERY_DIR"
ARTIFACT_DIR="$RECOVERY_DIR"
export ARTIFACT_DIR
# Call verifyReleaseArtifacts with this absolute ARTIFACT_DIR.
VERSION=$(node -p "require('$ARTIFACT_DIR/manifest.json').version")
(cd "$ARTIFACT_DIR" && shasum -a 256 -c SHA256SUMS)
```

The recovered-directory procedure must run the exact seven-file schema and hash
validator against `ARTIFACT_DIR`, derive `VERSION` from that verified manifest,
and keep every conditional decision bound to those paths. The artifact is for
audit; repair authentication and use **Re-run failed jobs** on the same run.

Before moving a pushed wrong tag, identify its exact old workflow run. Cancel
only if that run is still active, wait until the run and every job are terminal,
and require proof that the publish job never started. Then query all five package versions with the
explicit public registry and require all five results to be `E404`. Only after
that cancellation -> terminal -> publish job never started -> all five absent
sequence may the maintainer delete, recreate, and push the single tag. If the
publish job started or any state is uncertain, preserve provenance, never move
the tag, and release a patch.

- [ ] **Step 4: Link one source of truth**

Link `docs/releasing.md` from `CONTRIBUTING.md`. Replace ad-hoc release commands
in `docs/launch/announcement.md` with the runbook link so release instructions
cannot diverge.

In `check-release.test.mjs`, assert `CONTRIBUTING.md` links
`docs/releasing.md`, the announcement links `../releasing.md`, the announcement
contains neither `npm publish` nor `git push --tags`, and the runbook contains
the five exact version-query and tarball-publish command stems above, including
the registry, public-access, `latest` dist-tag, and ignored-script flags.

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
