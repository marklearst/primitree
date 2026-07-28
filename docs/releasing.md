# Releasing Primitree

Use this runbook to prepare, publish, or recover a Primitree release. CI writes
one checksummed artifact for the five public `@primitree/*` packages.
Publish those files without rebuilding or substituting a tarball after the
release checks pass.

## Local preflight

Source development and release CI use Node 24.18.0 with pnpm 11.10.0. CI
installs and asserts npm 11.18.0 before the publish job reads the release
registry. On a fresh machine, run `pnpm run test:e2e:install` once to install
Chromium before the release preflight.

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
the hooks size limit, and installs the tarballs in a temporary consumer. For
each tarball, it runs a sanitized offline npm publish check. The repository
clears npm authentication, OIDC, and provenance environment values, uses an
empty temporary npm configuration, and calls npm with
`--dry-run --offline --provenance=false`.

`npm publish --dry-run` does not publish or mutate the registry. The isolation
blocks credential reads, OIDC discovery, and registry requests. A dry-run
cannot prove npm access or provenance. The publish job provides that proof.

Bind the release attempt to the saved artifact and validate the intended tag:

```bash
ARTIFACT_DIR=artifacts/npm
pnpm run verify:release-artifacts
VERSION=$(node -p "require('./artifacts/npm/manifest.json').version")
GITHUB_REF_TYPE=tag GITHUB_REF_NAME="v$VERSION" pnpm run check:release-metadata
(cd "$ARTIFACT_DIR" && shasum -a 256 -c SHA256SUMS)
```

`verify:release-artifacts` checks the manifest schema on macOS and Linux.
macOS ships `shasum`; GitHub's Linux jobs use
`sha256sum --check SHA256SUMS` instead.

## Stable release semantics

The workflow's sole release mode is stable. The five public packages must share
the same strict `MAJOR.MINOR.PATCH` version, and the accepted release tag must
equal `vMAJOR.MINOR.PATCH` using that shared version. The packages publish in
dependency order: core → dtcg → cli → hooks → mcp. Every stable publication
uses the npm dist-tag `latest`.

This path does not support prerelease versions. A future prerelease needs a
separate design that changes the version and tag validators, artifact
filenames, tests, and workflow together, with an explicit non-`latest` dist-tag
such as `next`.

## Release artifact boundary

For `VERSION=1.0.0`, one release attempt contains these seven regular,
non-symlink files and no others under `artifacts/npm/`:

1. `primitree-core-$VERSION.tgz`
2. `primitree-dtcg-$VERSION.tgz`
3. `primitree-cli-$VERSION.tgz`
4. `primitree-hooks-$VERSION.tgz`
5. `primitree-mcp-$VERSION.tgz`
6. `manifest.json`
7. `SHA256SUMS`

`manifest.json` fixes the shared version, package names, filenames, dependency
order, and digests. The publish boundary gives the manifest a separate
validation because `SHA256SUMS` covers the five tarballs but not the manifest.
The required checks cover the manifest schema, tag/version equality,
`SHA256SUMS` entries, and every tarball hash. Publication requires all of them
to pass.

The quality job uploads the directory as `npm-packages-${{ github.sha }}`.
The packed-consumer, publish, and GitHub Release jobs download that same-run
artifact. None of those jobs rebuilds or repacks it. The workflow gives
`id-token: write` and optional npm bootstrap-token access to the publish job and
no other job. Record the GitHub run ID and commit SHA before artifact retention
expires.

## Version pull requests

`.github/workflows/version-packages.yml` runs after a push to `main` and has no
other trigger. It uses the repository's `github.token` to open or synchronize
one Changesets version pull request. The workflow never publishes, receives no
npm token, and does not request an OIDC identity token. It applies
`changeset version`, updates the lockfile without lifecycle scripts, and proves
the result with a frozen, script-free install.

The initial 1.0.0 release needs no fabricated version pull request. The five
public package manifests already carry 1.0.0 and there is no pending changeset.
Do not fabricate a changeset or version pull request for that bootstrap.
Version pull request automation starts with later releases after reviewed
changesets reach `main`.

Before enabling the workflow, verify the repository setting **Allow GitHub
Actions to create and approve pull requests**. Run this check with a repository
owner credential that has `Administration` read permission:

```bash
test "$(
  gh api \
    -H 'X-GitHub-Api-Version: 2026-03-10' \
    /repos/marklearst/primitree/actions/permissions/workflow \
    --jq '.can_approve_pull_request_reviews == true'
)" = true
```

GitHub does not run the repository's `pull_request` workflow for events that
`github.token` creates. Each time the Changesets action opens or synchronizes
the version pull request, a maintainer must close and reopen it. That
maintainer-authored `reopened` event starts CI. Confirm that the version
workflow output matches the reopened pull request's current head commit.
Approve that workflow run in GitHub Actions. Require the normal `quality` and
`packed-consumer` checks for that exact head commit to pass before merge. Never
merge the version pull request unless the version workflow succeeds and those
normal checks pass for its exact head commit. Checks from an older head commit
do not count.

## External npm and GitHub steps

Local checks never execute the following steps. Keep every item unchecked until
the maintainer performs it and records the result during the launch session.
Follow the listed order because each phase removes or depends on authority from
the previous phase.

### 1. Branch preflight

- [ ] Verify the reviewed branch, repository controls, and external ownership.

Run the complete local preflight, require the version pull request checks when
one exists, and verify @primitree ownership, 2FA, and new-package rights. Confirm
the protected npm and GitHub environments and rulesets are ready. Confirm the
repository has no remote tags or GitHub Releases:

```bash
set -euo pipefail
REMOTE_TAG_REFS=$(git ls-remote --tags origin)
test -z "$REMOTE_TAG_REFS"
GITHUB_RELEASES=$(
  gh release list --repo marklearst/primitree --json tagName
)
test "$GITHUB_RELEASES" = '[]'
```

Confirm that an administrator enabled immutable releases. Run this check with a
maintainer credential that has repository `Administration` read permission. The
job-scoped `GITHUB_TOKEN` cannot perform this administrative check, so it stays
outside the release job:

```bash
test "$(
  gh api \
    -H 'X-GitHub-Api-Version: 2026-03-10' \
    /repos/marklearst/primitree/immutable-releases \
    --jq '.enabled == true'
)" = true
```

Configure the repository ruleset to block release tag updates and deletions
before you push the tag. GitHub applies immutable-release protection after
publication, so the ruleset covers the draft and asset-upload window.

### 2. Merge and bind exact main

- [ ] Merge the reviewed branch and bind the release to the exact `main` commit.

After every required review and check passes, merge, switch to `main`, and
record the exact commit. The initial release may proceed without a fabricated
version pull request because the public manifests are already at 1.0.0.

```bash
git switch main
git fetch origin main --tags
git pull --ff-only origin main
FINAL_COMMIT=$(git rev-parse 'origin/main^{commit}')
test "$(git rev-parse 'HEAD^{commit}')" = "$FINAL_COMMIT"
test -z "$(git status --short)"
```

### 3. Create the bootstrap credential and protected environment

- [ ] Create a granular npm token that expires after one day and make the protected GitHub `npm` environment its sole storage location.

Create the granular token in the npm website with the minimum publish access
needed for the five packages and CI 2FA bypass. Use it for the initial
token-authenticated publish and for no other purpose. Do not paste it into a
command, shell variable, file, issue, or log.

Create and protect the GitHub environment `npm` before the tag run, including
its required reviewer and deployment restrictions. The workflow references
that environment. GitHub may create an unprotected environment record if it is
missing. An administrator must configure and verify it before a tag run.

Set the secret through the prompt. Confirm that the command lists its name once
without showing a value:

```bash
set -euo pipefail
gh secret set NPM_TOKEN --env npm --repo marklearst/primitree
GH_ENV_SECRETS=$(
  gh secret list --env npm --repo marklearst/primitree --json name
) || return 1 2>/dev/null || exit 1
test "$(jq '[.[] | select(.name == "NPM_TOKEN")] | length' <<<"$GH_ENV_SECRETS")" = 1
```

### 4. Tag, publish, and create the GitHub Release

- [ ] Create `v1.0.0` at the final verified commit and no other commit, push the single intended tag, and approve publication.

For the initial release, create one annotated stable tag at the recorded
commit. Never use a blanket tag push.

Update the release copy before creating the tag. In the five package
changelogs, replace `1.0.0 (Unreleased)` with `1.0.0 (YYYY-MM-DD)`. In
`docs/launch/v1.0.0.md`, replace the draft status with
`Status: Released YYYY-MM-DD.` Use the same UTC date in all six files. The
tag-mode metadata check rejects a missing date, a mismatched date, or any
remaining `Unreleased` marker.

Run `git tag -d` to clear a local tag from an earlier failed launch attempt
before creating the release tag.

```bash
VERSION=1.0.0
GITHUB_REF_TYPE=tag GITHUB_REF_NAME="v$VERSION" pnpm run check:release-metadata
git tag -d "v$VERSION" 2>/dev/null || true
git tag -a "v$VERSION" "$FINAL_COMMIT" -m "Primitree $VERSION"
test "$(git rev-parse "v$VERSION^{commit}")" = "$FINAL_COMMIT"
git push origin "refs/tags/v$VERSION"
```

Approve the protected `npm` environment job. The workflow performs the
bootstrap token-authenticated publish, verifies npm provenance against the
expected repository, workflow, tag, and commit, smoke-tests the public
packages, and creates or resumes the immutable GitHub Release from the same
seven files. Record the run ID, package pages, `latest` dist-tags, provenance,
release notes, asset digests, and final release URL.

### 5. Configure all five trusted publishers

- [ ] Configure trusted publishing for all five packages and verify each saved relationship.

Use a browser-authenticated local npm >=11.15 session with package write access.
The bootstrap granular access token cannot authorize `npm trust`; authenticate
in the browser instead.

```bash
npm --version
npm login --auth-type=web --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm trust github '@primitree/core' --repository marklearst/primitree --file ci.yml --environment npm --allow-publish --yes --registry=https://registry.npmjs.org/
npm trust github '@primitree/dtcg' --repository marklearst/primitree --file ci.yml --environment npm --allow-publish --yes --registry=https://registry.npmjs.org/
npm trust github '@primitree/cli' --repository marklearst/primitree --file ci.yml --environment npm --allow-publish --yes --registry=https://registry.npmjs.org/
npm trust github '@primitree/hooks' --repository marklearst/primitree --file ci.yml --environment npm --allow-publish --yes --registry=https://registry.npmjs.org/
npm trust github '@primitree/mcp' --repository marklearst/primitree --file ci.yml --environment npm --allow-publish --yes --registry=https://registry.npmjs.org/
npm trust list '@primitree/core' --registry=https://registry.npmjs.org/
npm trust list '@primitree/dtcg' --registry=https://registry.npmjs.org/
npm trust list '@primitree/cli' --registry=https://registry.npmjs.org/
npm trust list '@primitree/hooks' --registry=https://registry.npmjs.org/
npm trust list '@primitree/mcp' --registry=https://registry.npmjs.org/
```

`npm trust list` confirms the saved configuration but cannot prove GitHub OIDC
until another package version publishes. The next token-free release proves
that GitHub OIDC can publish the package.

### 6. Delete the GitHub environment secret

- [ ] Delete `NPM_TOKEN` from the protected GitHub environment after you verify all five trust entries.

```bash
set -euo pipefail
gh secret delete NPM_TOKEN --env npm --repo marklearst/primitree
GH_ENV_SECRETS_AFTER=$(
  gh secret list --env npm --repo marklearst/primitree --json name
) || return 1 2>/dev/null || exit 1
test "$(jq '[.[] | select(.name == "NPM_TOKEN")] | length' <<<"$GH_ENV_SECRETS_AFTER")" = 0
```

Stop if the name remains listed. Do not continue to token revocation or package
security while GitHub retains the secret.

### 7. Revoke the exact bootstrap token

- [ ] Revoke the exact one-day bootstrap token by ID and verify its removal.

List tokens as JSON so npm returns full token IDs without exposing full token
values. Match the description and expiry recorded at creation, copy that exact
token ID into `BOOTSTRAP_TOKEN_ID`, revoke it, and list again:

```bash
set -euo pipefail
TOKENS_BEFORE=$(npm token list --json) ||
  return 1 2>/dev/null || exit 1
BOOTSTRAP_TOKEN_ID='<exact token ID from npm token list --json>'
test "$(jq --arg id "$BOOTSTRAP_TOKEN_ID" '[.[] | select(.key == $id)] | length' <<<"$TOKENS_BEFORE")" = 1
npm token revoke "$BOOTSTRAP_TOKEN_ID" --registry=https://registry.npmjs.org/
TOKENS_AFTER=$(npm token list --json) ||
  return 1 2>/dev/null || exit 1
test "$(jq --arg id "$BOOTSTRAP_TOKEN_ID" '[.[] | select(.key == $id)] | length' <<<"$TOKENS_AFTER")" = 0
```

Never substitute a token value for the ID.

### 8. Require package MFA and disallow token publishing

- [ ] Require 2FA while disallowing token-based publishing on all five packages.

Before this step, you must save trusted publishing, delete the GitHub secret,
and revoke the bootstrap token. Open each package on npm, go to
**Settings → Publishing access**, choose
**Require two-factor authentication and disallow tokens**, and save:

- `@primitree/core`
- `@primitree/dtcg`
- `@primitree/cli`
- `@primitree/hooks`
- `@primitree/mcp`

The npm CLI does not expose the disallow-tokens setting. After saving all five
packages, refresh each Publishing access page and confirm
**Require two-factor authentication and disallow tokens** remains selected.
Trusted OIDC publishing remains available through the exact repository,
workflow, and environment relationship.

### 9. Promote one staged production deployment

- [ ] Prove the docs project boundary, stage a tested Production fallback, and promote the verified release candidate.

The Vercel project is `primitree`, with project ID
`prj_J9yx9KZeG7q54CWTZm2ik2R4uwAd`. Its `rootDirectory` must equal `apps/docs`,
and `sourceFilesOutsideRootDirectory` is `true` so the docs build can consume
the workspace packages. Maintainers must commit `apps/docs/vercel.json` with
`"github": { "autoAlias": false }` before merge. The committed setting and
`--skip-domain` both block automatic domain assignment.

Prove those settings before any repo-root upload. Stop if any assertion fails;
do not use the repo-root deployment recipe without this proof:

```bash
set -euo pipefail
PROJECT_ID=prj_J9yx9KZeG7q54CWTZm2ik2R4uwAd
PROJECT_JSON=$(vercel api "/v9/projects/$PROJECT_ID" --scope marklearst --raw)
test "$(jq -r '.id' <<<"$PROJECT_JSON")" = "$PROJECT_ID"
test "$(jq -r '.name' <<<"$PROJECT_JSON")" = primitree
test "$(jq -r '.rootDirectory' <<<"$PROJECT_JSON")" = apps/docs
test "$(jq -r '.sourceFilesOutsideRootDirectory' <<<"$PROJECT_JSON")" = true
test "$(jq -r '.github.autoAlias' apps/docs/vercel.json)" = false
test "$(jq '[.protectionBypass // {} | to_entries[] | select(.value.scope == "automation-bypass")] | length' <<<"$PROJECT_JSON")" = 0
```

Record the production deployment ID and URL that Vercel returns. Do not use
the production deployment in place before launch as a docs rollback or
fallback:

```bash
set -euo pipefail
vercel list primitree --environment production --status READY --format=json --scope marklearst
```

Deployment Protection covers the fallback and candidate URLs even though both
target Production. Link a disposable directory to the exact project and create
one temporary automation-bypass secret. Never link the repository or save the
secret there. The exit trap is a cleanup fallback. The normal path revokes the
exact secret and removes the disposable directory before the launch session
ends.

```bash
set -euo pipefail
VERCEL_PROBE_ROOT=$(mktemp -d)
VERCEL_PROBE_DIR="$VERCEL_PROBE_ROOT/project"
mkdir "$VERCEL_PROBE_DIR"
VERCEL_BYPASS_ACTIVE=false
VERCEL_BYPASS_REVOKE_SENT=false
cleanup_vercel_probe() {
  if [[ "${VERCEL_BYPASS_ACTIVE:-false}" == true ]]; then
    if [[ "${VERCEL_BYPASS_REVOKE_SENT:-false}" != true ]]; then
      vercel project protection disable "$PROJECT_ID" --protection-bypass \
        --protection-bypass-secret "$VERCEL_BYPASS_SECRET" \
        --scope marklearst || return 1
      VERCEL_BYPASS_REVOKE_SENT=true
    fi
    local cleanup_project_json
    cleanup_project_json=$(
      vercel api "/v9/projects/$PROJECT_ID" --scope marklearst --raw
    ) || return 1
    local cleanup_bypass_count
    cleanup_bypass_count=$(
      jq '[.protectionBypass // {} | to_entries[] | select(.value.scope == "automation-bypass")] | length' \
        <<<"$cleanup_project_json"
    ) || return 1
    if [[ "$cleanup_bypass_count" != 0 ]]; then
      VERCEL_BYPASS_REVOKE_SENT=false
      return 1
    fi
    VERCEL_BYPASS_ACTIVE=false
    VERCEL_BYPASS_REVOKE_SENT=false
    unset VERCEL_BYPASS_SECRET
  fi
  if [[ -n "${VERCEL_PROBE_ROOT:-}" && -d "$VERCEL_PROBE_ROOT" ]]; then
    rm -rf -- "$VERCEL_PROBE_ROOT" || return 1
  fi
  return 0
}
cleanup_vercel_probe_on_exit() {
  local exit_status=$?
  while ! cleanup_vercel_probe; do
    printf '%s\n' \
      'Could not confirm temporary Vercel bypass cleanup. Retrying in 5 seconds. Do not terminate this shell.' \
      >&2
    sleep 5
  done
  return "$exit_status"
}
trap cleanup_vercel_probe_on_exit EXIT
vercel link --cwd "$VERCEL_PROBE_DIR" \
  --yes \
  --scope marklearst \
  --project "$PROJECT_ID"
VERCEL_BYPASS_SECRET=$(openssl rand -hex 32)
VERCEL_BYPASS_ACTIVE=true
vercel project protection enable "$PROJECT_ID" --protection-bypass \
  --protection-bypass-secret "$VERCEL_BYPASS_SECRET" \
  --scope marklearst

protected_get() {
  local deployment="$1"
  local path="$2"
  (cd "$VERCEL_PROBE_DIR" &&
    vercel curl "$path" --deployment "$deployment" \
      --protection-bypass "$VERCEL_BYPASS_SECRET" \
      --yes -- --fail --silent --show-error) || return 1
}

verify_protected_deployment() {
  local deployment="$1"
  local body
  body=$(protected_get "$deployment" /) || return 1
  grep -F 'Run one command to write DTCG, CSS, Tailwind v4, TypeScript, and a' \
    <<<"$body" >/dev/null || return 1
  grep -F '<title>Primitree' <<<"$body" >/dev/null || return 1
  grep -F 'name="description"' <<<"$body" >/dev/null || return 1
  grep -F 'property="og:title"' <<<"$body" >/dev/null || return 1
  body=$(protected_get "$deployment" /docs) || return 1
  grep -F 'Primitree converts a Figma variables export into DTCG token files' \
    <<<"$body" >/dev/null ||
    return 1
  body=$(protected_get "$deployment" /playground) || return 1
  grep -F 'This page calls the same build function as' <<<"$body" >/dev/null ||
    return 1
  body=$(protected_get "$deployment" /docs/hooks/migration) || return 1
  grep -F 'Primitree 1.0 moves the hooks package from' <<<"$body" >/dev/null ||
    return 1
  body=$(protected_get "$deployment" '/api/search?query=figma') || return 1
  grep -F '"url":"/docs/concepts/figma-mcp"' <<<"$body" >/dev/null || return 1
  return 0
}

verify_public_site() {
  local base="${1%/}"
  local body
  body=$(curl --fail --silent --show-error "${base}/") || return 1
  grep -F 'Run one command to write DTCG, CSS, Tailwind v4, TypeScript, and a' \
    <<<"$body" >/dev/null || return 1
  grep -F '<title>Primitree' <<<"$body" >/dev/null || return 1
  grep -F 'name="description"' <<<"$body" >/dev/null || return 1
  grep -F 'property="og:title"' <<<"$body" >/dev/null || return 1
  body=$(curl --fail --silent --show-error "${base}/docs") || return 1
  grep -F 'Primitree converts a Figma variables export into DTCG token files' \
    <<<"$body" >/dev/null ||
    return 1
  body=$(curl --fail --silent --show-error "${base}/playground") || return 1
  grep -F 'This page calls the same build function as' <<<"$body" >/dev/null ||
    return 1
  body=$(curl --fail --silent --show-error "${base}/docs/hooks/migration") ||
    return 1
  grep -F 'Primitree 1.0 moves the hooks package from' <<<"$body" >/dev/null ||
    return 1
  body=$(curl --fail --silent --show-error "${base}/api/search?query=figma") ||
    return 1
  grep -F '"url":"/docs/concepts/figma-mcp"' <<<"$body" >/dev/null || return 1
  return 0
}
```

Choose a full, reviewed commit whose docs build passes these route checks. Stage
that commit as a Production-target deployment with no domain assignment. Use
that deployment as the docs fallback. A Preview deployment cannot serve as the
fallback. Record the exact fallback deployment ID and URL:

```bash
set -euo pipefail
FALLBACK_COMMIT='<full tested docs commit SHA>'
git cat-file -e "$FALLBACK_COMMIT^{commit}"
FALLBACK_WORKTREE="$(mktemp -d)/primitree-fallback"
git worktree add --detach "$FALLBACK_WORKTREE" "$FALLBACK_COMMIT"
FALLBACK_DEPLOY_JSON=$(vercel deploy "$FALLBACK_WORKTREE" \
  --project primitree \
  --scope marklearst \
  --prod --skip-domain \
  --meta gitCommitSha="$FALLBACK_COMMIT" \
  --yes \
  --format=json)
git worktree remove "$FALLBACK_WORKTREE"
FALLBACK_DEPLOYMENT_ID=$(jq -er '.id | strings | select(startswith("dpl_"))' <<<"$FALLBACK_DEPLOY_JSON")
FALLBACK_DEPLOYMENT_URL=$(jq -er '.url | strings | select(test("^https://[a-z0-9.-]+\\.vercel\\.app$"; "i"))' <<<"$FALLBACK_DEPLOY_JSON")
FALLBACK_DEPLOYMENT_HOST="${FALLBACK_DEPLOYMENT_URL#https://}"
FALLBACK_JSON=$(vercel inspect "$FALLBACK_DEPLOYMENT_ID" --format=json --scope marklearst)
test "$(jq -r '.id' <<<"$FALLBACK_JSON")" = "$FALLBACK_DEPLOYMENT_ID"
test "$(jq -r '.name' <<<"$FALLBACK_JSON")" = primitree
test "$(jq -r '.url' <<<"$FALLBACK_JSON")" = "$FALLBACK_DEPLOYMENT_HOST"
test "$(jq -r '.readyState' <<<"$FALLBACK_JSON")" = READY
test "$(jq -r '.target' <<<"$FALLBACK_JSON")" = production
test "$(jq -r '.meta.gitCommitSha' <<<"$FALLBACK_JSON")" = "$FALLBACK_COMMIT"
verify_protected_deployment "$FALLBACK_DEPLOYMENT_URL"
```

Build the candidate from a fresh detached worktree at the exact final commit.
The project-setting checks confirm that the worktree-root upload applies the
`apps/docs` root and includes its workspace dependencies. Build from a detached
worktree so unrelated files in the main checkout cannot enter the upload. Keep
the deployment off production domains. Read its exact deployment ID and URL
from the deployment response. Never substitute a branch alias, `latest`, or
values you copy by hand. Confirm its target type `production` before promotion.

```bash
set -euo pipefail
test "$(git rev-parse 'HEAD^{commit}')" = "$FINAL_COMMIT"
CANDIDATE_WORKTREE="$(mktemp -d)/primitree-candidate"
git worktree add --detach "$CANDIDATE_WORKTREE" "$FINAL_COMMIT"
test "$(git -C "$CANDIDATE_WORKTREE" rev-parse 'HEAD^{commit}')" = "$FINAL_COMMIT"
CANDIDATE_DEPLOY_JSON=$(vercel deploy "$CANDIDATE_WORKTREE" \
  --project primitree \
  --scope marklearst \
  --prod --skip-domain \
  --meta gitCommitSha="$FINAL_COMMIT" \
  --yes \
  --format=json)
git worktree remove "$CANDIDATE_WORKTREE"
DEPLOYMENT_ID=$(jq -er '.id | strings | select(startswith("dpl_"))' <<<"$CANDIDATE_DEPLOY_JSON")
DEPLOYMENT_URL=$(jq -er '.url | strings | select(test("^https://[a-z0-9.-]+\\.vercel\\.app$"; "i"))' <<<"$CANDIDATE_DEPLOY_JSON")
DEPLOYMENT_HOST="${DEPLOYMENT_URL#https://}"
CANDIDATE_JSON=$(vercel inspect "$DEPLOYMENT_ID" --format=json --scope marklearst)
test "$(jq -r '.id' <<<"$CANDIDATE_JSON")" = "$DEPLOYMENT_ID"
test "$(jq -r '.name' <<<"$CANDIDATE_JSON")" = primitree
test "$(jq -r '.url' <<<"$CANDIDATE_JSON")" = "$DEPLOYMENT_HOST"
test "$(jq -r '.readyState' <<<"$CANDIDATE_JSON")" = READY
test "$(jq -r '.target' <<<"$CANDIDATE_JSON")" = production
test "$(jq -r '.meta.gitCommitSha' <<<"$CANDIDATE_JSON")" = "$FINAL_COMMIT"

verify_protected_deployment "$DEPLOYMENT_URL"
vercel promote "$DEPLOYMENT_ID" --scope marklearst
vercel domains inspect primitree.com --scope marklearst
PRODUCTION_JSON=$(vercel inspect primitree.com --format=json --scope marklearst)
test "$(jq -r '.id' <<<"$PRODUCTION_JSON")" = "$DEPLOYMENT_ID"
verify_public_site https://primitree.com
if cleanup_vercel_probe; then
  trap - EXIT
else
  printf '%s\n' 'Temporary Vercel bypass cleanup failed; retry before continuing.' >&2
  return 1 2>/dev/null || exit 1
fi
```

Stop when another project owns `primitree.com` or promotion would reassign the
domain. Establish ownership before continuing. Do not reassign or force the
domain. The public production alias must resolve to the exact promoted
deployment ID before the public route checks run. After
promotion, rerun the complete production route and metadata checks. Keep both
deployment IDs until launch verification finishes. For rollback, re-inspect
`"$FALLBACK_DEPLOYMENT_ID"` and rerun
`verify_protected_deployment "$FALLBACK_DEPLOYMENT_URL"`. Use that deployment
ID as the sole rollback target. Revoke the temporary automation-bypass secret
and remove the disposable link after either the candidate or fallback passes
verification on the public domain.

### 10. Verify replacements and migration

- [ ] Verify every replacement package, the production documentation site, and the migration page.

```bash
npm view "@primitree/core@1.0.0" version --registry=https://registry.npmjs.org/
npm view "@primitree/dtcg@1.0.0" version --registry=https://registry.npmjs.org/
npm view "@primitree/cli@1.0.0" version --registry=https://registry.npmjs.org/
npm view "@primitree/hooks@1.0.0" version --registry=https://registry.npmjs.org/
npm view "@primitree/mcp@1.0.0" version --registry=https://registry.npmjs.org/
curl --fail --silent --show-error https://primitree.com/ >/dev/null
curl --fail --silent --show-error https://primitree.com/docs/hooks/migration >/dev/null
```

All five replacement packages, the production documentation site, and the
migration page must be live and correct before deprecation.

### 11. Deprecate the sole legacy target: 4.0.0

- [ ] After you verify the replacements and migration, deprecate `@figma-vars/hooks@4.0.0` and no other version.

`@figma-vars/hooks@4.0.0` receives no new version. Never target every version
with a wildcard.

```bash
npm deprecate "@figma-vars/hooks@4.0.0" "Moved to @primitree/hooks. See https://primitree.com/docs/hooks/migration" --registry=https://registry.npmjs.org/
npm view "@figma-vars/hooks@4.0.0" deprecated --registry=https://registry.npmjs.org/
```

## Partial publication recovery

Use GitHub **Re-run failed jobs** on the same tag workflow run as the sole
supported selective recovery path. Do not start a new workflow run. The
`npm publish` commands in this section are reference material; do not execute
them from a local machine. The failed job downloads the unchanged same-run
artifact, validates its seven-file boundary again, and keeps the job's OIDC
provenance context. Never rebuild or replace those files during recovery.

The publish step queries every exact package version before its corresponding
publish command. It treats npm `E404`, and no other response, as missing. For an
existing version,
the step computes the local tarball SRI, requires an exact match with
`dist.integrity`, validates `dist.attestations.url`, and requires the SLSA v1
provenance predicate. It skips that verified existing package and no other
package. Any other registry error, malformed metadata, integrity mismatch, or
missing provenance stops the rerun.

Audit the workflow's registry decisions with these commands. Run recovery
through GitHub Actions:

```bash
VERSION=1.0.0
ARTIFACT_DIR=artifacts/npm
(cd "$ARTIFACT_DIR" && shasum -a 256 -c SHA256SUMS)
npm view "@primitree/core@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/dtcg@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/cli@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/hooks@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/mcp@$VERSION" version --registry=https://registry.npmjs.org
```

GitHub's Linux jobs use `sha256sum --check SHA256SUMS` for the checksum step.
Treat npm `E404` as a missing package. Any other error, including an
authentication, permission, rate-limit, DNS, or registry failure, stops recovery.

The workflow uses its registry query to decide whether to execute each of these
five literal commands in dependency order. Maintainers must not execute them
from a local machine because local publication cannot preserve the workflow's
provenance:

```bash
npm publish "$ARTIFACT_DIR/primitree-core-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "$ARTIFACT_DIR/primitree-dtcg-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "$ARTIFACT_DIR/primitree-cli-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "$ARTIFACT_DIR/primitree-hooks-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
npm publish "$ARTIFACT_DIR/primitree-mcp-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag=latest --ignore-scripts
```

### Wrong dist-tag

Inspect and repair a dist-tag without republishing. Use this core example for
the package whose dist-tag needs repair:

```bash
npm dist-tag ls "@primitree/core" --registry=https://registry.npmjs.org
npm dist-tag add "@primitree/core@$VERSION" latest --registry=https://registry.npmjs.org
npm dist-tag rm "@primitree/core" next --registry=https://registry.npmjs.org
```

### Bad package contents

Npm package versions are immutable. For bad package contents, deprecate the
bad version and release a new patch version; do not overwrite or unpublish it.

```bash
npm deprecate "@primitree/core@$VERSION" "Use 1.0.1; this release contains invalid package contents" --registry=https://registry.npmjs.org
```

### Recover a retained artifact

Recover the artifact with its run ID and commit SHA. Do not use a branch or tag
name:

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

Use the recovered `ARTIFACT_DIR` and `VERSION` after the manifest, filenames,
and hashes pass validation. This validation does not authorize local
publication. A failed credential or trusted-publishing check requires you to
preserve the artifact and checksums, repair the protected GitHub configuration,
and choose **Re-run failed jobs** on the same run. On rerun, the publish step
retries packages that npm confirms missing from those verified tarballs.

A failed GitHub Release after npm succeeds requires **Re-run failed jobs** on
the same run. The release job resumes the draft from the existing tag and saved
files without moving the tag. The helper keeps assets whose name, uploaded
state, size, and SHA-256 digest match the reviewed files. It uploads missing
assets and stops on any unexpected, mismatched, duplicate, or `starter` asset.
The helper does not delete draft assets. Inspect and remove a known failed
`starter` upload by hand before rerunning the failed job. Do not replace an
asset that passed verification.

### Replace a pushed wrong tag

Deleting a tag does not stop its existing workflow run. Identify the exact old
run ID and confirm its head SHA belongs to the wrong tag before cancellation.
Cancel an active old run and wait until all jobs reach a terminal state.
Inspect a terminal run without sending another cancellation request:

```bash
OLD_RUN_ID=123456789
gh run view "$OLD_RUN_ID" --json headSha,headBranch,event,status,jobs
gh run cancel "$OLD_RUN_ID"
gh run watch "$OLD_RUN_ID"
gh run view "$OLD_RUN_ID" --json status,conclusion,jobs
```

Before continuing, require the output to prove the publish job never started.
Re-query all five versions against the release registry and require all five
commands to return npm `E404`:

```bash
VERSION=1.0.0
npm view "@primitree/core@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/dtcg@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/cli@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/hooks@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/mcp@$VERSION" version --registry=https://registry.npmjs.org
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

A started publish job or published package blocks tag movement. Treat uncertain
state the same way. Preserve provenance, deprecate an invalid package when
needed, and issue a new patch release.
