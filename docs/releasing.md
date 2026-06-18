# Releasing FigmaVars

This is the source of truth for preparing, publishing, and recovering a
FigmaVars release. CI produces one checksummed artifact for the five public
`@figmavars/*` packages. Publish those files without rebuilding or substituting
a tarball after the release checks pass.

## Local preflight

Source development requires Node >=22.13.0 and pnpm 11.10.0. CI tests Node
20.0.0, the published-package consumer floor, against the packed tarballs.
Do not use Node 20 to build this source workspace. On a fresh machine, run
`pnpm run test:e2e:install` once to install Chromium before the release
preflight.

Run this exact sequence from the repository root. Stop at the first failure.

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

`check:release` builds once, packs the five public packages, validates their
metadata and artifact contents, runs Publint and Are the Types Wrong, checks
the hooks size limit, and installs the tarballs in a temporary consumer. It
also runs a sanitized, offline npm publish check for each tarball: the
repository clears npm authentication, OIDC, and provenance environment
values, uses an empty temporary npm configuration, and calls npm with
`--dry-run --offline --provenance=false`.

In general, `npm publish --dry-run` does not publish or mutate the registry,
but a dry-run can read credentials, attempt OIDC discovery, and contact the
registry unless it is isolated. A dry-run is not proof of npm access or
provenance. Only the real publish job can establish those external facts.

Bind the release attempt to the saved artifact and validate the intended tag:

```bash
ARTIFACT_DIR=artifacts/npm
pnpm run verify:release-artifacts
VERSION=$(node -p "require('./artifacts/npm/manifest.json').version")
GITHUB_REF_TYPE=tag GITHUB_REF_NAME="v$VERSION" pnpm run check:release-metadata
(cd "$ARTIFACT_DIR" && shasum -a 256 -c SHA256SUMS)
```

The schema-aware `verify:release-artifacts` command is portable. macOS ships
`shasum`; GitHub's Linux jobs use `sha256sum --check SHA256SUMS` instead.

## Stable release semantics

The current workflow supports stable releases only. All public and private
workspaces must have the same strict `MAJOR.MINOR.PATCH` version, and the only
accepted release tag is an exact `vMAJOR.MINOR.PATCH` that matches it. The five
packages publish in dependency order: core, dtcg, cli, hooks, then mcp. Every
stable publication uses the npm dist-tag `latest`.

Prerelease versions are not supported by this path. A future prerelease needs
a separate design that changes the version and tag validators, artifact
filenames, tests, and workflow together, with an explicit non-`latest`
dist-tag such as `next`.

## Release artifact boundary

For `VERSION=5.0.0`, one release attempt contains exactly seven regular,
non-symlink files under `artifacts/npm/`, in this contract:

1. `figmavars-core-$VERSION.tgz`
2. `figmavars-dtcg-$VERSION.tgz`
3. `figmavars-cli-$VERSION.tgz`
4. `figmavars-hooks-$VERSION.tgz`
5. `figmavars-mcp-$VERSION.tgz`
6. `manifest.json`
7. `SHA256SUMS`

`manifest.json` fixes the shared version, package names, filenames, dependency
order, and digests. The publish boundary gives the manifest a separate
validation because `SHA256SUMS` covers the five tarballs but not the manifest.
The required validation set includes the manifest schema, tag/version equality,
canonical checksum file, and every tarball hash. Publication requires all of
them to pass.

The quality job uploads the directory as `npm-packages-${{ github.sha }}`. The
Node 20 consumer job and the publish job download that same-run artifact; they
do not check out the repository, install the source workspace, build, or
repack. Only the real publish step creates npm provenance. That job alone
receives `id-token: write` and the npm token. Record the GitHub run ID and
commit SHA with the release notes before artifact retention expires.

## External npm and GitHub steps

Local checks never execute these steps. Keep every item unchecked until the
maintainer performs and verifies it during a real release. The current
workflow does not create a GitHub Release; release notes and assets remain a
manual step.

- [ ] Verify @figmavars ownership, 2FA, and new-package rights.
- [ ] Bootstrap each package with a token-authenticated publish if npm requires it.
- [ ] Configure trusted publishing for all five packages before removing token authentication.
- [ ] Create protected npm and GitHub environments and rulesets, including the GitHub environment `npm`; store and authenticate `NPM_TOKEN` there until its trusted-publisher configuration is complete.
- [ ] Make the stale `v4.2.0` tag decision apart from the v5 release.
- [ ] Recreate `v5.0.0` only at the final verified commit on `main`.
- [ ] Push the single intended tag; never use a blanket tag push.
- [ ] Verify GitHub release notes, npm provenance against the expected repository, workflow, tag, and commit, dist-tags, package pages, and install smoke tests for all five packages.

The workflow now references the GitHub environment `npm`. If it does not exist,
GitHub may create an unprotected environment record during a job. The workflow
does not configure or prove its protection, secret, or trusted publisher; an
administrator must configure and verify them before a tag run.

## Partial publication recovery

GitHub **Re-run failed jobs** on the same tag workflow run is the only supported
selective recovery path. Do not start a new workflow run and do not execute the
`npm publish` reference commands below locally. The failed job downloads the
unchanged same-run artifact, validates its seven-file boundary again, and keeps
the job's OIDC provenance context. Never rebuild or replace those files during
recovery.

The publish step queries every exact package version before its corresponding
publish command. It treats only npm `E404` as missing. For an existing version,
the step computes the local tarball SRI, requires an exact match with
`dist.integrity`, validates `dist.attestations.url`, and requires the SLSA v1
provenance predicate. It skips only that verified existing package. Any other
registry error, malformed metadata, integrity mismatch, or missing provenance
stops the rerun.

These commands show the registry decisions the workflow makes. They are for
incident auditing, not a local retry:

```bash
VERSION=5.0.0
ARTIFACT_DIR=artifacts/npm
(cd "$ARTIFACT_DIR" && shasum -a 256 -c SHA256SUMS)
npm view "@figmavars/core@$VERSION" version --registry=https://registry.npmjs.org
npm view "@figmavars/dtcg@$VERSION" version --registry=https://registry.npmjs.org
npm view "@figmavars/cli@$VERSION" version --registry=https://registry.npmjs.org
npm view "@figmavars/hooks@$VERSION" version --registry=https://registry.npmjs.org
npm view "@figmavars/mcp@$VERSION" version --registry=https://registry.npmjs.org
```

GitHub's Linux jobs use `sha256sum --check SHA256SUMS` for the checksum step.
Only npm `E404` means that a package is missing. Any other error, including an
authentication, permission, rate-limit, DNS, or registry failure, stops
recovery.

The workflow conditionally executes these five literal commands in dependency
order. Maintainers must not execute them locally because local publication
cannot preserve the workflow's provenance:

```bash
npm publish "$ARTIFACT_DIR/figmavars-core-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "$ARTIFACT_DIR/figmavars-dtcg-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "$ARTIFACT_DIR/figmavars-cli-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "$ARTIFACT_DIR/figmavars-hooks-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "$ARTIFACT_DIR/figmavars-mcp-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
```

### Wrong dist-tag

Inspect and repair a dist-tag without republishing. This core example applies
to whichever package is affected:

```bash
npm dist-tag ls "@figmavars/core" --registry=https://registry.npmjs.org
npm dist-tag add "@figmavars/core@$VERSION" latest --registry=https://registry.npmjs.org
npm dist-tag rm "@figmavars/core" next --registry=https://registry.npmjs.org
```

### Bad package contents

Npm package versions are immutable. For bad package contents, deprecate the
bad version and release a new patch version; do not overwrite or unpublish it.

```bash
npm deprecate "@figmavars/core@$VERSION" "Use 5.0.1; this release contains invalid package contents" --registry=https://registry.npmjs.org
```

### Recover a retained artifact

Recover the artifact with an immutable run ID and commit SHA, not a mutable
branch or tag name:

```bash
RUN_ID=123456789
COMMIT_SHA=0123456789abcdef0123456789abcdef01234567
RECOVERY_DIR=$(mktemp -d)
gh run download "$RUN_ID" \
  --name "npm-packages-$COMMIT_SHA" \
  --dir "$RECOVERY_DIR"
ARTIFACT_DIR="$RECOVERY_DIR"
export ARTIFACT_DIR
node --input-type=module <<'NODE'
import path from 'node:path'
import { verifyReleaseArtifacts } from './scripts/release-artifacts.mjs'

verifyReleaseArtifacts({
  artifactDirectory: path.resolve(process.env.ARTIFACT_DIR),
})
NODE
VERSION=$(node -p "require('$ARTIFACT_DIR/manifest.json').version")
GITHUB_REF_TYPE=tag GITHUB_REF_NAME="v$VERSION" pnpm run check:release-metadata
(cd "$ARTIFACT_DIR" && shasum -a 256 -c SHA256SUMS)
```

This audit binds `ARTIFACT_DIR` and `VERSION` to the recovered directory and
validates the exact manifest schema, filenames, and hashes there. It does not
authorize local publication. If credentials, the environment, or trusted
publishing fail, preserve the artifact and checksums, repair the protected
GitHub configuration, and choose **Re-run failed jobs** on the same run. The
idempotent publish step retries only missing packages confirmed by npm from
those same verified bytes.

If npm succeeds but the GitHub Release fails, recreate its metadata from the
existing tag and saved files without moving the tag. The current workflow does
not perform this manual step.

### Replace a pushed wrong tag

Deleting a tag does not stop its existing workflow run. Identify the exact old
run ID and confirm its head SHA belongs to the wrong tag before cancellation.
Cancel only if the old run is still active. Then wait until all jobs are
terminal and inspect the final job state. If the run is already terminal, skip
the cancellation command and inspect it directly:

```bash
OLD_RUN_ID=123456789
gh run view "$OLD_RUN_ID" --json headSha,headBranch,event,status,jobs
gh run cancel "$OLD_RUN_ID"
gh run watch "$OLD_RUN_ID"
gh run view "$OLD_RUN_ID" --json status,conclusion,jobs
```

Continue only when the output proves the publish job never started. Re-query
all five versions against the release registry and require all five commands to
return npm `E404`:

```bash
VERSION=5.0.0
npm view "@figmavars/core@$VERSION" version --registry=https://registry.npmjs.org
npm view "@figmavars/dtcg@$VERSION" version --registry=https://registry.npmjs.org
npm view "@figmavars/cli@$VERSION" version --registry=https://registry.npmjs.org
npm view "@figmavars/hooks@$VERSION" version --registry=https://registry.npmjs.org
npm view "@figmavars/mcp@$VERSION" version --registry=https://registry.npmjs.org
```

After cancellation is terminal, the publish job never started, and all five
versions are absent, delete and recreate the tag at the verified commit and
push that single ref:

```bash
git tag -d "v$VERSION"
git push origin ":refs/tags/v$VERSION"
FINAL_COMMIT=0123456789abcdef0123456789abcdef01234567
git tag "v$VERSION" "$FINAL_COMMIT"
git push origin "refs/tags/v$VERSION"
```

If the publish job ever started, any package exists, or any state is uncertain,
never move the tag. Stop, preserve provenance, deprecate an invalid package if
necessary, and issue a new patch release.
