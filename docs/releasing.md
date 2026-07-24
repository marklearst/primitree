# Releasing FigmaVars

This is the source of truth for preparing, publishing, and recovering a
FigmaVars release. CI produces one checksummed artifact for the five public
`@figmavars/*` packages. Publish those files without rebuilding or substituting
a tarball after the release checks pass.

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

The quality job uploads the directory as `npm-packages-${{ github.sha }}`.
The packed-consumer, publish, and GitHub Release jobs download that same-run
artifact. None of those jobs rebuilds or repacks it. Only the publish job
receives `id-token: write` or access to the optional npm bootstrap token.
Record the GitHub run ID and commit SHA before artifact retention expires.

## Version pull requests

`.github/workflows/version-packages.yml` runs only after a push to `main`. It
uses the repository's `github.token` to open or synchronize one Changesets
version pull request. The workflow never publishes, receives no npm token, and
does not request an OIDC identity token. It applies `changeset version`, updates
the lockfile without lifecycle scripts, and proves the result with a frozen,
script-free install.

The initial 5.0.0 release needs no fabricated version pull request. The five
public package manifests already carry 5.0.0 and there is no pending changeset.
Do not fabricate a changeset or version pull request for that bootstrap.
Version pull request automation starts with later releases after reviewed
changesets reach `main`.

Before enabling the workflow, verify the repository setting **Allow GitHub
Actions to create and approve pull requests**. This owner-authenticated
preflight requires repository `Administration` read permission:

```bash
test "$(
  gh api \
    -H 'X-GitHub-Api-Version: 2026-03-10' \
    /repos/marklearst/figmavars/actions/permissions/workflow \
    --jq '.can_approve_pull_request_reviews == true'
)" = true
```

An event created with `github.token` does not trigger the repository's
`pull_request` workflow. Each time the Changesets action opens or synchronizes
the version pull request, a maintainer must close and reopen it. That
maintainer-authored `reopened` event starts CI. Confirm the reopened pull
request still has the exact head commit produced by the version workflow, then
approve its workflow run in GitHub Actions. Require the normal `quality` and
`packed-consumer` checks for that exact head commit to pass before merge. Never
merge the version pull request based only on the version workflow succeeding
or on checks from an older head commit.

## External npm and GitHub steps

Local checks never execute the following steps. Keep every item unchecked until
the maintainer performs it and records the result during the launch session.
The order is enforced because each phase removes or depends on authority from
the previous phase.

### 1. Branch preflight

- [ ] Verify the reviewed branch, repository controls, and external ownership.

Run the complete local preflight, require the version pull request checks when
one exists, and verify @figmavars ownership, 2FA, and new-package rights. Confirm
the protected npm and GitHub environments and rulesets are ready. Resolve the
stale `v4.2.0` tag separately. Confirm immutable releases are enabled.

Run the immutable-releases check with a maintainer credential that has
repository `Administration` read permission. The job-scoped `GITHUB_TOKEN`
cannot perform this administrative check, so it stays outside the release job:

```bash
test "$(
  gh api \
    -H 'X-GitHub-Api-Version: 2026-03-10' \
    /repos/marklearst/figmavars/immutable-releases \
    --jq '.enabled == true'
)" = true
```

The repository ruleset must block release tag updates and deletions before the
tag is pushed. Immutable releases protect the associated tag only after
publish, so the ruleset covers the draft and asset-upload window.

### 2. Merge and bind exact main

- [ ] Merge the reviewed branch and bind the release to the exact `main` commit.

After every required review and check passes, merge, switch to `main`, and
record the exact commit. The initial release may proceed without a fabricated
version pull request because the public manifests are already at 5.0.0.

```bash
git switch main
git fetch origin main --tags
git pull --ff-only origin main
FINAL_COMMIT=$(git rev-parse 'origin/main^{commit}')
test "$(git rev-parse 'HEAD^{commit}')" = "$FINAL_COMMIT"
test -z "$(git status --short)"
```

### 3. Create the bootstrap credential and protected environment

- [ ] Create one one-day granular npm token and store it only in the protected GitHub `npm` environment.

Create the granular token in the npm website with the minimum publish access
needed for the five packages and CI 2FA bypass. It exists only for the initial
token-authenticated publish. Do not paste it into a command, shell variable,
file, issue, or log.

Create and protect the GitHub environment `npm` before the tag run, including
its required reviewer and deployment restrictions. The workflow references
that environment. GitHub may create an unprotected environment record if it is
missing. An administrator must configure and verify it before a tag run.

Set the secret through the interactive prompt, then confirm only its name is
listed:

```bash
set -euo pipefail
gh secret set NPM_TOKEN --env npm --repo marklearst/figmavars
GH_ENV_SECRETS=$(
  gh secret list --env npm --repo marklearst/figmavars --json name
) || return 1 2>/dev/null || exit 1
test "$(jq '[.[] | select(.name == "NPM_TOKEN")] | length' <<<"$GH_ENV_SECRETS")" = 1
```

### 4. Tag, publish, and create the GitHub Release

- [ ] Recreate `v5.0.0` only at the final verified commit, push the single intended tag, and approve publication.

For the initial release, create one annotated stable tag at the recorded
commit. Never use a blanket tag push.

```bash
VERSION=5.0.0
GITHUB_REF_TYPE=tag GITHUB_REF_NAME="v$VERSION" pnpm run check:release-metadata
git tag -d "v$VERSION" 2>/dev/null || true
git tag -a "v$VERSION" "$FINAL_COMMIT" -m "FigmaVars $VERSION"
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
interactively in the browser instead.

```bash
npm --version
npm login --auth-type=web --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
npm trust github '@figmavars/core' --repository marklearst/figmavars --file ci.yml --environment npm --allow-publish --yes --registry=https://registry.npmjs.org/
npm trust github '@figmavars/dtcg' --repository marklearst/figmavars --file ci.yml --environment npm --allow-publish --yes --registry=https://registry.npmjs.org/
npm trust github '@figmavars/cli' --repository marklearst/figmavars --file ci.yml --environment npm --allow-publish --yes --registry=https://registry.npmjs.org/
npm trust github '@figmavars/hooks' --repository marklearst/figmavars --file ci.yml --environment npm --allow-publish --yes --registry=https://registry.npmjs.org/
npm trust github '@figmavars/mcp' --repository marklearst/figmavars --file ci.yml --environment npm --allow-publish --yes --registry=https://registry.npmjs.org/
npm trust list '@figmavars/core' --registry=https://registry.npmjs.org/
npm trust list '@figmavars/dtcg' --registry=https://registry.npmjs.org/
npm trust list '@figmavars/cli' --registry=https://registry.npmjs.org/
npm trust list '@figmavars/hooks' --registry=https://registry.npmjs.org/
npm trust list '@figmavars/mcp' --registry=https://registry.npmjs.org/
```

`npm trust list` confirms the saved configuration but cannot prove GitHub OIDC
until another package version publishes. The next token-free release is the
end-to-end trust proof.

### 6. Delete the GitHub environment secret

- [ ] Delete `NPM_TOKEN` from the protected GitHub environment after all five trust entries are verified.

```bash
set -euo pipefail
gh secret delete NPM_TOKEN --env npm --repo marklearst/figmavars
GH_ENV_SECRETS_AFTER=$(
  gh secret list --env npm --repo marklearst/figmavars --json name
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

Run the five literal package security commands only after trusted publishing is
saved, the GitHub secret is deleted, and the bootstrap token is revoked:

```bash
npm access set mfa=publish @figmavars/core
npm access set mfa=publish @figmavars/dtcg
npm access set mfa=publish @figmavars/cli
npm access set mfa=publish @figmavars/hooks
npm access set mfa=publish @figmavars/mcp
```

Token-based publishing is then unavailable; trusted OIDC publishing remains
available through the exact repository, workflow, and environment relationship.

### 9. Promote one staged production deployment

- [ ] Prove the docs project boundary, stage a known-good Production fallback, then create, verify, and promote the exact release candidate.

The Vercel project is `figmavars`, with immutable project ID
`prj_J9yx9KZeG7q54CWTZm2ik2R4uwAd`. Its `rootDirectory` is exactly `apps/docs`,
and `sourceFilesOutsideRootDirectory` is `true` so the docs build can consume
the workspace packages. `apps/docs/vercel.json` with
`"github": { "autoAlias": false }` is required before merge. This is a
repository safety control in addition to the CLI's `--skip-domain` flag.

Prove those settings before any repo-root upload. Stop if any assertion fails;
do not use the repo-root deployment recipe without this proof:

```bash
set -euo pipefail
PROJECT_ID=prj_J9yx9KZeG7q54CWTZm2ik2R4uwAd
PROJECT_JSON=$(vercel api "/v9/projects/$PROJECT_ID" --scope marklearst --raw)
test "$(jq -r '.id' <<<"$PROJECT_JSON")" = "$PROJECT_ID"
test "$(jq -r '.name' <<<"$PROJECT_JSON")" = figmavars
test "$(jq -r '.rootDirectory' <<<"$PROJECT_JSON")" = apps/docs
test "$(jq -r '.sourceFilesOutsideRootDirectory' <<<"$PROJECT_JSON")" = true
test "$(jq -r '.github.autoAlias' apps/docs/vercel.json)" = false
test "$(jq '[.protectionBypass // {} | to_entries[] | select(.value.scope == "automation-bypass")] | length' <<<"$PROJECT_JSON")" = 0
```

Record the currently assigned production deployment ID and URL for audit only.
The current production deployment is not a valid docs rollback. Do not use it
as the fallback:

```bash
set -euo pipefail
vercel list figmavars --environment production --status READY --format=json --scope marklearst
```

The unique fallback and candidate URLs remain protected even though their
target is Production. Link a disposable directory to the exact project and
create one temporary automation-bypass secret. Never link the repository or
save the secret there. The exit trap is a cleanup fallback; the normal path
also revokes the exact secret and removes the disposable directory before the
launch session ends.

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
      'Temporary Vercel bypass cleanup is not confirmed; retrying in 5 seconds. Do not terminate this shell.' \
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
  grep -F '<title>FigmaVars' <<<"$body" >/dev/null || return 1
  grep -F 'name="description"' <<<"$body" >/dev/null || return 1
  grep -F 'property="og:title"' <<<"$body" >/dev/null || return 1
  body=$(protected_get "$deployment" /docs) || return 1
  grep -F 'FigmaVars converts a Figma variables export into DTCG token files' \
    <<<"$body" >/dev/null ||
    return 1
  body=$(protected_get "$deployment" /playground) || return 1
  grep -F 'This page calls the same build function as' <<<"$body" >/dev/null ||
    return 1
  body=$(protected_get "$deployment" /docs/hooks/migration) || return 1
  grep -F 'FigmaVars v5 moves the hooks package from' <<<"$body" >/dev/null ||
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
  grep -F '<title>FigmaVars' <<<"$body" >/dev/null || return 1
  grep -F 'name="description"' <<<"$body" >/dev/null || return 1
  grep -F 'property="og:title"' <<<"$body" >/dev/null || return 1
  body=$(curl --fail --silent --show-error "${base}/docs") || return 1
  grep -F 'FigmaVars converts a Figma variables export into DTCG token files' \
    <<<"$body" >/dev/null ||
    return 1
  body=$(curl --fail --silent --show-error "${base}/playground") || return 1
  grep -F 'This page calls the same build function as' <<<"$body" >/dev/null ||
    return 1
  body=$(curl --fail --silent --show-error "${base}/docs/hooks/migration") ||
    return 1
  grep -F 'FigmaVars v5 moves the hooks package from' <<<"$body" >/dev/null ||
    return 1
  body=$(curl --fail --silent --show-error "${base}/api/search?query=figma") ||
    return 1
  grep -F '"url":"/docs/concepts/figma-mcp"' <<<"$body" >/dev/null || return 1
  return 0
}
```

Choose a full, reviewed commit that is known to build the docs and pass these
routes. Stage that commit as a Production-target deployment with no domain
assignment. This is the known-good docs fallback; a Preview deployment does
not qualify. Record the exact fallback deployment ID and URL:

```bash
set -euo pipefail
FALLBACK_COMMIT='<full known-good docs commit SHA>'
git cat-file -e "$FALLBACK_COMMIT^{commit}"
FALLBACK_WORKTREE="$(mktemp -d)/figmavars-fallback"
git worktree add --detach "$FALLBACK_WORKTREE" "$FALLBACK_COMMIT"
FALLBACK_DEPLOY_JSON=$(vercel deploy "$FALLBACK_WORKTREE" \
  --project figmavars \
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
test "$(jq -r '.name' <<<"$FALLBACK_JSON")" = figmavars
test "$(jq -r '.url' <<<"$FALLBACK_JSON")" = "$FALLBACK_DEPLOYMENT_HOST"
test "$(jq -r '.readyState' <<<"$FALLBACK_JSON")" = READY
test "$(jq -r '.target' <<<"$FALLBACK_JSON")" = production
test "$(jq -r '.meta.gitCommitSha' <<<"$FALLBACK_JSON")" = "$FALLBACK_COMMIT"
verify_protected_deployment "$FALLBACK_DEPLOYMENT_URL"
```

Now build the candidate from a fresh detached worktree at the exact final
commit. The project-setting assertions above prove that the worktree-root
upload applies the `apps/docs` root and includes its workspace dependencies.
The detached worktree ensures uncommitted launch-machine files cannot enter the
upload. Keep the deployment off production domains, then derive its exact
deployment ID and URL from the deployment response. Never substitute a branch
alias, `latest`, or manually copied values. Confirm its target type
`production` before promotion.

```bash
set -euo pipefail
test "$(git rev-parse 'HEAD^{commit}')" = "$FINAL_COMMIT"
CANDIDATE_WORKTREE="$(mktemp -d)/figmavars-candidate"
git worktree add --detach "$CANDIDATE_WORKTREE" "$FINAL_COMMIT"
test "$(git -C "$CANDIDATE_WORKTREE" rev-parse 'HEAD^{commit}')" = "$FINAL_COMMIT"
CANDIDATE_DEPLOY_JSON=$(vercel deploy "$CANDIDATE_WORKTREE" \
  --project figmavars \
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
test "$(jq -r '.name' <<<"$CANDIDATE_JSON")" = figmavars
test "$(jq -r '.url' <<<"$CANDIDATE_JSON")" = "$DEPLOYMENT_HOST"
test "$(jq -r '.readyState' <<<"$CANDIDATE_JSON")" = READY
test "$(jq -r '.target' <<<"$CANDIDATE_JSON")" = production
test "$(jq -r '.meta.gitCommitSha' <<<"$CANDIDATE_JSON")" = "$FINAL_COMMIT"

verify_protected_deployment "$DEPLOYMENT_URL"
vercel promote "$DEPLOYMENT_ID" --scope marklearst
vercel domains inspect figmavars.com --scope marklearst
PRODUCTION_JSON=$(vercel inspect figmavars.com --format=json --scope marklearst)
test "$(jq -r '.id' <<<"$PRODUCTION_JSON")" = "$DEPLOYMENT_ID"
verify_public_site https://figmavars.com
if cleanup_vercel_probe; then
  trap - EXIT
else
  printf '%s\n' 'Temporary Vercel bypass cleanup failed; retry before continuing.' >&2
  return 1 2>/dev/null || exit 1
fi
```

If `figmavars.com` belongs to another project or promotion would reassign the
domain, stop and resolve ownership explicitly; do not reassign or force the
domain. The public production alias must resolve to the exact promoted
deployment ID before the public route checks run. After promotion, rerun the
complete production route and metadata checks shown above. Keep both immutable
deployment IDs until launch verification is complete. If rollback is needed,
promote only
`"$FALLBACK_DEPLOYMENT_ID"` after re-inspecting it and rerunning
`verify_protected_deployment "$FALLBACK_DEPLOYMENT_URL"`. Revoke the temporary
automation-bypass secret and remove the disposable link after either the
candidate or fallback is verified on the public domain.

### 10. Verify replacements and migration

- [ ] Verify every replacement package, the production documentation site, and the migration page.

```bash
npm view "@figmavars/core@5.0.0" version --registry=https://registry.npmjs.org/
npm view "@figmavars/dtcg@5.0.0" version --registry=https://registry.npmjs.org/
npm view "@figmavars/cli@5.0.0" version --registry=https://registry.npmjs.org/
npm view "@figmavars/hooks@5.0.0" version --registry=https://registry.npmjs.org/
npm view "@figmavars/mcp@5.0.0" version --registry=https://registry.npmjs.org/
curl --fail --silent --show-error https://figmavars.com/ >/dev/null
curl --fail --silent --show-error https://figmavars.com/docs/hooks/migration >/dev/null
```

All five replacement packages, the production documentation site, and the
migration page must be live and correct before deprecation.

### 11. Deprecate only the legacy 4.0.0 package

- [ ] Deprecate exactly `@figma-vars/hooks@4.0.0` after the replacements and migration are verified.

`@figma-vars/hooks@4.0.0` receives no new version. Never target every version
with a wildcard.

```bash
npm deprecate "@figma-vars/hooks@4.0.0" "Moved to @figmavars/hooks. See https://figmavars.com/docs/hooks/migration" --registry=https://registry.npmjs.org/
npm view "@figma-vars/hooks@4.0.0" deprecated --registry=https://registry.npmjs.org/
```

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

If npm succeeds but the GitHub Release fails, choose **Re-run failed jobs** on
the same run. The release job resumes the draft from the existing tag and
saved files without moving the tag. Resume is non-destructive: the helper keeps
only assets whose name, uploaded state, size, and SHA-256 digest exactly match
the reviewed files, then uploads only missing assets. It stops on any
unexpected, mismatched, duplicate, or `starter` asset and never deletes draft
assets automatically. Inspect and remove a known failed `starter` upload
manually before rerunning the failed job; do not replace an already verified
asset.

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
