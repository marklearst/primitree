# Releasing Primitree

Use this runbook to prepare, publish, or recover a Primitree release. CI writes
one checksummed artifact for five `@primitree/*` packages and the unscoped
`primitree` command launcher.
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

`check:release` builds once, packs the six public packages, validates their
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

## Release channel semantics

All six public packages share one version. The workflow accepts stable
`MAJOR.MINOR.PATCH` versions and `MAJOR.MINOR.PATCH-next.N` prereleases. The tag
must be the exact version prefixed with `v`.

Packages publish in dependency order: core → dtcg → cli → hooks → mcp →
primitree. Stable versions use npm's `latest` dist-tag. Versions ending in
`-next.N` use `next` and GitHub marks their release as a prerelease. The release
controller also removes an unexpected `latest` tag from every prerelease
package and verifies that `next` identifies the exact version before
continuing.

## Release artifact boundary

For `VERSION=1.0.0-next.0`, one release attempt contains these eight regular,
non-symlink files and no others under `artifacts/npm/`:

1. `primitree-core-$VERSION.tgz`
2. `primitree-dtcg-$VERSION.tgz`
3. `primitree-cli-$VERSION.tgz`
4. `primitree-hooks-$VERSION.tgz`
5. `primitree-mcp-$VERSION.tgz`
6. `primitree-$VERSION.tgz`
7. `manifest.json`
8. `SHA256SUMS`

`manifest.json` fixes the shared version, package names, filenames, dependency
order, and digests. The publish boundary gives the manifest a separate
validation because `SHA256SUMS` covers the six tarballs but not the manifest.
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

The launcher pull request already contains the reviewed launch changeset,
`.changeset/pre.json`, aligned `1.0.0-next.0` package versions, lockfile, and
changelogs. It is the initial versioned release candidate. After it merges, the
Version Packages workflow has no second initial Changesets version pull request
to open. Keep prerelease mode active for later `next` releases;
each later releasable package change requires a reviewed changeset and the
resulting version pull request. Exit prerelease mode in a separate reviewed
version pull request before publishing stable `1.0.0`.

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

Make the source repository public before creating any npm package. This lets
package pages, provenance, issue links, and source links resolve to the same
public project. Review the visibility change in GitHub. Run and verify the
single repository mutation:

```bash
gh repo edit marklearst/primitree \
  --visibility public \
  --accept-visibility-change-consequences
test "$(gh repo view marklearst/primitree --json visibility --jq '.visibility')" = PUBLIC
```

Stop if the repository is not public. Do not create a package or bootstrap
token until this check passes.

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

Before merging, prove that Vercel links the docs project to the intended GitHub
repository and production branch. `autoAssignCustomDomains` must be `true`.
Record the current production deployment before merging so the launch has one
verified rollback target:

Use one release operator and reserve an exclusive production-change window from
this capture through step 3. During that window, do not promote or roll back
another deployment. The verifier stops on any third production ID. Before it
runs an automatic rollback, alias-event history must show the exact release and
no other events after the recorded baseline. Any other alias event aborts the
automatic rollback.

```bash
set -euo pipefail
PROJECT_ID=prj_J9yx9KZeG7q54CWTZm2ik2R4uwAd
PROJECT_JSON=$(vercel api "/v9/projects/$PROJECT_ID" --scope marklearst --raw)
test "$(jq -r '.id' <<<"$PROJECT_JSON")" = "$PROJECT_ID"
test "$(jq -r '.name' <<<"$PROJECT_JSON")" = primitree
test "$(jq -r '.rootDirectory' <<<"$PROJECT_JSON")" = apps/docs
test "$(jq -r '.sourceFilesOutsideRootDirectory' <<<"$PROJECT_JSON")" = true
test "$(jq -r '.link.type' <<<"$PROJECT_JSON")" = github
test "$(jq -r '.link.org' <<<"$PROJECT_JSON")" = marklearst
test "$(jq -r '.link.repo' <<<"$PROJECT_JSON")" = primitree
test "$(jq -r '.link.productionBranch' <<<"$PROJECT_JSON")" = main
test "$(jq -r '.autoAssignCustomDomains' <<<"$PROJECT_JSON")" = true

PREVIOUS_PRODUCTION_SUMMARY=$(vercel inspect primitree.com --format=json --scope marklearst)
PREVIOUS_PRODUCTION_ID=$(jq -er '.id | strings | select(startswith("dpl_"))' <<<"$PREVIOUS_PRODUCTION_SUMMARY")
PREVIOUS_PRODUCTION_JSON=$(vercel api "/v13/deployments/$PREVIOUS_PRODUCTION_ID" --scope marklearst --raw)
test "$(jq -r '.id' <<<"$PREVIOUS_PRODUCTION_JSON")" = "$PREVIOUS_PRODUCTION_ID"
test "$(jq -r '.projectId' <<<"$PREVIOUS_PRODUCTION_JSON")" = "$PROJECT_ID"
test "$(jq -r '.name' <<<"$PREVIOUS_PRODUCTION_JSON")" = primitree
test "$(jq -r '.readyState' <<<"$PREVIOUS_PRODUCTION_JSON")" = READY
test "$(jq -r '.target' <<<"$PREVIOUS_PRODUCTION_JSON")" = production

PREVIOUS_PRODUCTION_HOME=$(
  curl --fail --connect-timeout 5 --max-time 20 --location \
    --silent --show-error https://primitree.com/
)
grep -F '<title>Primitree' <<<"$PREVIOUS_PRODUCTION_HOME" >/dev/null
grep -F 'name="description"' <<<"$PREVIOUS_PRODUCTION_HOME" >/dev/null
grep -F 'property="og:title"' <<<"$PREVIOUS_PRODUCTION_HOME" >/dev/null
PREVIOUS_PRODUCTION_DOCS=$(
  curl --fail --connect-timeout 5 --max-time 20 --location \
    --silent --show-error https://primitree.com/docs
)
grep -F '<title>Build token files · Primitree' \
  <<<"$PREVIOUS_PRODUCTION_DOCS" >/dev/null
PREVIOUS_PRODUCTION_PLAYGROUND=$(
  curl --fail --connect-timeout 5 --max-time 20 --location \
    --silent --show-error https://primitree.com/playground
)
grep -F '<title>Playground · Primitree' \
  <<<"$PREVIOUS_PRODUCTION_PLAYGROUND" >/dev/null
PREVIOUS_PRODUCTION_MIGRATION=$(
  curl --fail --connect-timeout 5 --max-time 20 --location \
    --silent --show-error https://primitree.com/docs/hooks/migration
)
grep -F '<title>Migration from @figma-vars/hooks · Primitree' \
  <<<"$PREVIOUS_PRODUCTION_MIGRATION" >/dev/null
PREVIOUS_PRODUCTION_SEARCH=$(
  curl --fail --connect-timeout 5 --max-time 20 --location \
    --silent --show-error \
    'https://primitree.com/api/search?query=figma'
)
grep -F '"url":"/docs/concepts/figma-mcp"' \
  <<<"$PREVIOUS_PRODUCTION_SEARCH" >/dev/null
RELEASE_EVENT_BASELINE_JSON=$(
  vercel api \
    "/v3/events?projectIds=$PROJECT_ID&types=aliases-assigned&withPayload=true&limit=1" \
    --scope marklearst --raw
)
RELEASE_EVENT_BASELINE_ID=$(
  jq -er \
    '.events
    | select(length == 1)
    | .[0]
    | select(.type == "aliases-assigned")
    | select(.payload.projectId == $project)
    | .id
    | strings
    | select(startswith("uev_"))' \
    --arg project "$PROJECT_ID" \
    <<<"$RELEASE_EVENT_BASELINE_JSON"
)
POST_HEALTH_PRODUCTION_SUMMARY=$(
  vercel inspect primitree.com --format=json --scope marklearst
)
test "$(jq -r '.id' <<<"$POST_HEALTH_PRODUCTION_SUMMARY")" = \
  "$PREVIOUS_PRODUCTION_ID"
printf 'Previous production deployment ID: %s\n' "$PREVIOUS_PRODUCTION_ID"
printf 'Release alias-event baseline: %s\n' "$RELEASE_EVENT_BASELINE_ID"
```

After every required review and check passes, merge, switch to `main`, and
record the exact commit. The initial release may proceed without a fabricated
version pull request because the public manifests are already at 1.0.0.

```bash
set -euo pipefail
git switch main
git fetch origin main --tags
git pull --ff-only origin main
FINAL_COMMIT=$(git rev-parse 'origin/main^{commit}')
test "$(git rev-parse 'HEAD^{commit}')" = "$FINAL_COMMIT"
test -z "$(git status --short)"
printf 'Final main commit: %s\n' "$FINAL_COMMIT"
```

### 3. Verify the automatic main deployment

- [ ] Verify that the exact merged `main` commit owns the production domain and passes every public route check.

Successful Vercel deployments from the configured `main` production branch
assign the production domains. Use the full commit SHA and previous production
deployment ID recorded in step 2. The production domain must resolve to the
exact deployment ID for the exact merged commit before the release can
continue. Complete this verification before creating credentials, tagging, or
publishing.

The health verifier accepts content changes across releases, so it can validate
a rollback. The release verifier adds copy checks for the current release.
Restore the exact recorded previous production deployment and stop the launch
when Vercel does not assign the exact commit or a public check fails.

```bash
set -euo pipefail

public_get() {
  local body
  local effective_url
  local expected_url="$1"
  local response
  response=$(
    curl --fail --location --silent --show-error \
      --connect-timeout 5 --max-time 20 --max-redirs 5 \
      --write-out $'\n%{url_effective}' "$expected_url"
  ) || return 1
  effective_url=${response##*$'\n'}
  body=${response%$'\n'*}
  [[ "${effective_url%/}" == "${expected_url%/}" ]] || return 1
  printf '%s\n' "$body"
}

verify_public_health() {
  local body
  body=$(public_get https://primitree.com/) || return 1
  grep -F '<title>Primitree' <<<"$body" >/dev/null || return 1
  grep -F 'name="description"' <<<"$body" >/dev/null || return 1
  grep -F 'property="og:title"' <<<"$body" >/dev/null || return 1
  body=$(public_get https://primitree.com/docs) || return 1
  grep -F '<title>Build token files · Primitree' <<<"$body" >/dev/null ||
    return 1
  body=$(public_get https://primitree.com/playground) || return 1
  grep -F '<title>Playground · Primitree' <<<"$body" >/dev/null || return 1
  body=$(public_get https://primitree.com/docs/hooks/migration) || return 1
  grep -F '<title>Migration from @figma-vars/hooks · Primitree' \
    <<<"$body" >/dev/null || return 1
  body=$(public_get 'https://primitree.com/api/search?query=figma') || return 1
  grep -F '"url":"/docs/concepts/figma-mcp"' <<<"$body" >/dev/null || return 1
  return 0
}

verify_public_site() {
  local body
  verify_public_health || return 1
  body=$(public_get https://primitree.com/) || return 1
  grep -F 'Govern token change. Know every consequence.' \
    <<<"$body" >/dev/null || return 1
  body=$(public_get https://primitree.com/docs) || return 1
  grep -F 'Primitree checks a local DTCG token file' \
    <<<"$body" >/dev/null || return 1
  body=$(public_get https://primitree.com/playground) || return 1
  grep -F 'This page calls the same build function as' <<<"$body" >/dev/null ||
    return 1
  body=$(public_get https://primitree.com/docs/hooks/migration) || return 1
  grep -F 'Primitree 1.0 moves the hooks package from' <<<"$body" >/dev/null ||
    return 1
  return 0
}

require_release_main_unchanged() {
  local current_main
  git fetch origin main || return 1
  current_main=$(git rev-parse 'origin/main^{commit}') || return 1
  if [[ "$current_main" != "$FINAL_COMMIT" ]]; then
    printf '%s\n' \
      'The main branch advanced after this release began. Stop without changing production.' \
      >&2
    return 1
  fi
  return 0
}

verify_previous_production_identity() {
  local previous_json
  previous_json=$(
    vercel api "/v13/deployments/$PREVIOUS_PRODUCTION_ID" \
      --scope marklearst --raw
  ) || return 1
  [[ "$(jq -r '.id' <<<"$previous_json")" == "$PREVIOUS_PRODUCTION_ID" ]] ||
    return 1
  [[ "$(jq -r '.projectId' <<<"$previous_json")" == "$PROJECT_ID" ]] ||
    return 1
  [[ "$(jq -r '.name' <<<"$previous_json")" == primitree ]] || return 1
  [[ "$(jq -r '.readyState' <<<"$previous_json")" == READY ]] || return 1
  [[ "$(jq -r '.target' <<<"$previous_json")" == production ]] || return 1
  return 0
}

verify_current_release_identity() {
  local current_id="$1"
  local current_json
  [[ "$current_id" =~ ^dpl_[A-Za-z0-9]+$ ]] || return 1
  current_json=$(
    vercel api "/v13/deployments/$current_id" --scope marklearst --raw
  ) || return 1
  [[ "$(jq -r '.id' <<<"$current_json")" == "$current_id" ]] || return 1
  [[ "$(jq -r '.projectId' <<<"$current_json")" == "$PROJECT_ID" ]] ||
    return 1
  [[ "$(jq -r '.name' <<<"$current_json")" == primitree ]] || return 1
  [[ "$(jq -r '.source' <<<"$current_json")" == git ]] || return 1
  [[ "$(jq -r '.target' <<<"$current_json")" == production ]] || return 1
  [[ "$(jq -r '.readyState' <<<"$current_json")" == READY ]] || return 1
  [[ "$(jq -r '.meta.githubCommitRef' <<<"$current_json")" == main ]] ||
    return 1
  [[ "$(jq -r '.meta.githubCommitSha' <<<"$current_json")" == \
    "$FINAL_COMMIT" ]] || return 1
  return 0
}

verify_previous_is_release_predecessor() {
  local baseline_index
  local event_count
  local release_events
  [[ -n "$PRODUCTION_DEPLOYMENT_ID" ]] || return 1
  release_events=$(
    vercel api \
      "/v3/events?projectIds=$PROJECT_ID&types=aliases-assigned&withPayload=true&limit=100" \
      --scope marklearst --raw
  ) || return 1
  event_count=$(jq '.events | length' <<<"$release_events") || return 1
  [[ "$event_count" =~ ^[0-9]+$ ]] || return 1
  ((event_count > 1 && event_count < 100)) || return 1
  baseline_index=$(
    jq --arg baseline "$RELEASE_EVENT_BASELINE_ID" \
      '[.events[].id] | index($baseline) // -1' <<<"$release_events"
  ) || return 1
  [[ "$baseline_index" =~ ^[0-9]+$ ]] || return 1
  ((baseline_index > 0 && baseline_index < event_count)) || return 1
  jq -e \
    --argjson baseline_index "$baseline_index" \
    --arg project "$PROJECT_ID" \
    --arg release "$PRODUCTION_DEPLOYMENT_ID" \
    'all(.events[0:$baseline_index][];
      .type == "aliases-assigned"
      and .payload.projectId == $project
      and .payload.deployment.id == $release)' \
    <<<"$release_events" >/dev/null
}

pause_automatic_production_domains() {
  vercel api "/v9/projects/$PROJECT_ID" \
    -X PATCH \
    -F autoAssignCustomDomains=false \
    --scope marklearst --silent || return 1
  verify_automatic_production_domains_paused
}

verify_automatic_production_domains_paused() {
  local project_json
  project_json=$(
    vercel api "/v9/projects/$PROJECT_ID" --scope marklearst --raw
  ) || return 1
  [[ "$(jq -r '.id' <<<"$project_json")" == "$PROJECT_ID" ]] || return 1
  [[ "$(jq -r '.name' <<<"$project_json")" == primitree ]] || return 1
  [[ "$(jq -r '.autoAssignCustomDomains' <<<"$project_json")" == false ]]
}

cancel_unfinished_release_deployment() {
  local attempt
  local cancel_json
  local release_count
  local release_json
  local release_list
  local release_state
  release_list=$(
    vercel api \
      "/v7/deployments?projectId=$PROJECT_ID&sha=$FINAL_COMMIT&branch=main&target=production&limit=2" \
      --scope marklearst --raw
  ) || return 1
  release_count=$(
    jq --arg project "$PROJECT_ID" --arg commit "$FINAL_COMMIT" \
      '[.deployments[]
        | select(.projectId == $project)
        | select(.source == "git")
        | select(.target == "production")
        | select(.meta.githubCommitRef == "main")
        | select(.meta.githubCommitSha == $commit)]
      | length' \
      <<<"$release_list"
  ) || return 1
  [[ "$release_count" =~ ^[0-9]+$ ]] || return 1
  ((release_count <= 1)) || return 1
  if ((release_count == 0)); then
    return 0
  fi
  RELEASE_DEPLOYMENT_ID=$(
    jq -er --arg project "$PROJECT_ID" --arg commit "$FINAL_COMMIT" \
      '.deployments[]
      | select(.projectId == $project)
      | select(.source == "git")
      | select(.target == "production")
      | select(.meta.githubCommitRef == "main")
      | select(.meta.githubCommitSha == $commit)
      | .uid' \
      <<<"$release_list"
  ) || return 1
  release_json=$(
    vercel api "/v13/deployments/$RELEASE_DEPLOYMENT_ID" \
      --scope marklearst --raw
  ) || return 1
  [[ "$(jq -r '.id' <<<"$release_json")" == "$RELEASE_DEPLOYMENT_ID" ]] ||
    return 1
  [[ "$(jq -r '.projectId' <<<"$release_json")" == "$PROJECT_ID" ]] ||
    return 1
  [[ "$(jq -r '.name' <<<"$release_json")" == primitree ]] || return 1
  [[ "$(jq -r '.source' <<<"$release_json")" == git ]] || return 1
  [[ "$(jq -r '.target' <<<"$release_json")" == production ]] || return 1
  [[ "$(jq -r '.meta.githubCommitRef' <<<"$release_json")" == main ]] ||
    return 1
  [[ "$(jq -r '.meta.githubCommitSha' <<<"$release_json")" == \
    "$FINAL_COMMIT" ]] || return 1
  release_state=$(jq -r '.readyState' <<<"$release_json") || return 1
  case "$release_state" in
    READY | ERROR | CANCELED)
      return 0
      ;;
    BUILDING | INITIALIZING | QUEUED)
      ;;
    *)
      return 1
      ;;
  esac

  if cancel_json=$(
    vercel api "/v12/deployments/$RELEASE_DEPLOYMENT_ID/cancel" \
      -X PATCH --scope marklearst --raw
  ); then
    [[ "$(jq -r '.id' <<<"$cancel_json")" == "$RELEASE_DEPLOYMENT_ID" ]] ||
      return 1
    [[ "$(jq -r '.projectId' <<<"$cancel_json")" == "$PROJECT_ID" ]] ||
      return 1
    [[ "$(jq -r '.readyState' <<<"$cancel_json")" == CANCELED ]] || return 1
  else
    release_json=$(
      vercel api "/v13/deployments/$RELEASE_DEPLOYMENT_ID" \
        --scope marklearst --raw
    ) || return 1
    release_state=$(jq -r '.readyState' <<<"$release_json") || return 1
    [[ "$release_state" == READY || "$release_state" == ERROR || \
      "$release_state" == CANCELED ]] || return 1
  fi

  for attempt in {1..12}; do
    release_json=$(
      vercel api "/v13/deployments/$RELEASE_DEPLOYMENT_ID" \
        --scope marklearst --raw
    ) || return 1
    release_state=$(jq -r '.readyState' <<<"$release_json") || return 1
    if [[ "$release_state" == READY || "$release_state" == ERROR || \
      "$release_state" == CANCELED ]]; then
      return 0
    fi
    if ((attempt < 12)); then
      sleep 5
    fi
  done
  return 1
}

contain_failed_release() {
  local current_id
  local current_summary
  pause_automatic_production_domains || return 1
  cancel_unfinished_release_deployment || return 1
  if ! current_summary=$(
    vercel inspect primitree.com --format=json --scope marklearst
  ); then
    verify_automatic_production_domains_paused || return 1
    return 1
  fi
  if ! current_id=$(jq -er '.id | strings | select(test("^dpl_[A-Za-z0-9]+$"))' \
    <<<"$current_summary"); then
    verify_automatic_production_domains_paused || return 1
    return 1
  fi
  if [[ "$current_id" != "$PREVIOUS_PRODUCTION_ID" ]]; then
    if ! verify_current_release_identity "$current_id"; then
      printf 'Rollback refused for unexpected production deployment: %s\n' \
        "$current_id" >&2
      verify_automatic_production_domains_paused || return 1
      return 1
    fi
    PRODUCTION_DEPLOYMENT_ID="$current_id"
  fi
  if ! require_release_main_unchanged; then
    verify_automatic_production_domains_paused || return 1
    return 1
  fi
  if ! restore_previous_production; then
    verify_automatic_production_domains_paused || return 1
    return 1
  fi
  verify_automatic_production_domains_paused
}

verify_production_domain_id() {
  local summary
  local current_id
  summary=$(
    vercel inspect primitree.com --format=json --scope marklearst
  ) || return 1
  current_id=$(jq -r '.id // empty' <<<"$summary") || return 1
  [[ "$current_id" == "$PRODUCTION_DEPLOYMENT_ID" ]]
}

wait_for_verified_public_site() {
  local attempt
  for attempt in {1..12}; do
    if verify_public_site && verify_production_domain_id; then
      return 0
    fi
    if ((attempt < 12)); then
      sleep 5
    fi
  done
  return 1
}

restore_previous_production() {
  local attempt
  local current_summary
  local current_id
  if current_summary=$(
    vercel inspect primitree.com --format=json --scope marklearst
  ); then
    current_id=$(jq -r '.id // empty' <<<"$current_summary") || current_id=
  else
    current_id=
  fi

  [[ "$current_id" =~ ^dpl_[A-Za-z0-9]+$ ]] || return 1
  require_release_main_unchanged || return 1
  verify_previous_production_identity || return 1
  if [[ "$current_id" != "$PREVIOUS_PRODUCTION_ID" ]]; then
    if ! verify_current_release_identity "$current_id"; then
      printf 'Rollback refused for unexpected production deployment: %s\n' \
        "${current_id:-unknown}" >&2
      return 1
    fi
    PRODUCTION_DEPLOYMENT_ID="$current_id"
    verify_previous_is_release_predecessor || return 1
    require_release_main_unchanged || return 1
    current_summary=$(
      vercel inspect primitree.com --format=json --scope marklearst
    ) || return 1
    [[ "$(jq -r '.id // empty' <<<"$current_summary")" == "$current_id" ]] ||
      return 1
    vercel rollback "$PREVIOUS_PRODUCTION_ID" \
      --scope marklearst \
      --yes \
      --timeout 3m || return 1
  fi

  for attempt in {1..12}; do
    if current_summary=$(
      vercel inspect primitree.com --format=json --scope marklearst
    ); then
      current_id=$(jq -r '.id // empty' <<<"$current_summary") || current_id=
      if [[ "$current_id" == "$PREVIOUS_PRODUCTION_ID" ]] &&
        verify_public_health; then
        return 0
      fi
    fi
    if ((attempt < 12)); then
      sleep 5
    fi
  done
  return 1
}

FINAL_COMMIT='<full main commit SHA recorded in step 2>'
PREVIOUS_PRODUCTION_ID='<deployment ID recorded before merge>'
RELEASE_EVENT_BASELINE_ID='<alias-event ID recorded before merge>'
[[ "$FINAL_COMMIT" =~ ^[0-9a-f]{40}$ ]]
[[ "$PREVIOUS_PRODUCTION_ID" =~ ^dpl_[A-Za-z0-9]+$ ]]
[[ "$RELEASE_EVENT_BASELINE_ID" =~ ^uev_[A-Za-z0-9]+$ ]]

PROJECT_ID=prj_J9yx9KZeG7q54CWTZm2ik2R4uwAd
PROJECT_JSON=$(vercel api "/v9/projects/$PROJECT_ID" --scope marklearst --raw)
test "$(jq -r '.id' <<<"$PROJECT_JSON")" = "$PROJECT_ID"
test "$(jq -r '.name' <<<"$PROJECT_JSON")" = primitree
test "$(jq -r '.rootDirectory' <<<"$PROJECT_JSON")" = apps/docs
test "$(jq -r '.link.type' <<<"$PROJECT_JSON")" = github
test "$(jq -r '.link.org' <<<"$PROJECT_JSON")" = marklearst
test "$(jq -r '.link.repo' <<<"$PROJECT_JSON")" = primitree
test "$(jq -r '.link.productionBranch' <<<"$PROJECT_JSON")" = main
test "$(jq -r '.autoAssignCustomDomains' <<<"$PROJECT_JSON")" = true
verify_previous_production_identity
require_release_main_unchanged

PRODUCTION_DEPLOYMENT_ID=
PRODUCTION_JSON=
UNEXPECTED_PRODUCTION_ID=
for attempt in {1..60}; do
  if PRODUCTION_SUMMARY=$(
    vercel inspect primitree.com --format=json --scope marklearst
  ); then
    OBSERVED_DEPLOYMENT_ID=$(
      jq -r '.id // empty' <<<"$PRODUCTION_SUMMARY"
    ) || OBSERVED_DEPLOYMENT_ID=
    if [[ "$OBSERVED_DEPLOYMENT_ID" == "$PREVIOUS_PRODUCTION_ID" ]]; then
      :
    elif [[ -n "$OBSERVED_DEPLOYMENT_ID" ]]; then
      if PRODUCTION_JSON=$(
        vercel api "/v13/deployments/$OBSERVED_DEPLOYMENT_ID" \
          --scope marklearst --raw
      ); then
        if [[ "$(jq -r '.id' <<<"$PRODUCTION_JSON")" == \
          "$OBSERVED_DEPLOYMENT_ID" ]] &&
          [[ "$(jq -r '.projectId' <<<"$PRODUCTION_JSON")" == \
            "$PROJECT_ID" ]] &&
          [[ "$(jq -r '.name' <<<"$PRODUCTION_JSON")" == primitree ]] &&
          [[ "$(jq -r '.source' <<<"$PRODUCTION_JSON")" == git ]] &&
          [[ "$(jq -r '.readyState' <<<"$PRODUCTION_JSON")" == READY ]] &&
          [[ "$(jq -r '.target' <<<"$PRODUCTION_JSON")" == production ]] &&
          [[ "$(jq -r '.meta.githubCommitRef' <<<"$PRODUCTION_JSON")" == \
            main ]] &&
          [[ "$(jq -r '.meta.githubCommitSha' <<<"$PRODUCTION_JSON")" == \
            "$FINAL_COMMIT" ]]; then
          PRODUCTION_DEPLOYMENT_ID="$OBSERVED_DEPLOYMENT_ID"
        else
          UNEXPECTED_PRODUCTION_ID="$OBSERVED_DEPLOYMENT_ID"
        fi
        break
      fi
    fi
  fi
  if ((attempt < 60)); then
    sleep 10
  fi
done

if [[ -n "$UNEXPECTED_PRODUCTION_ID" ]]; then
  printf 'Unexpected production deployment observed: %s. Pausing automatic assignment and containing the exact release candidate without rollback.\n' \
    "$UNEXPECTED_PRODUCTION_ID" >&2
  if ! contain_failed_release; then
    printf '%s\n' \
      'Containment stopped without rollback. Inspect the current deployment and automatic-domain setting before continuing.' \
      >&2
  fi
  exit 1
fi

if [[ -z "$PRODUCTION_DEPLOYMENT_ID" ]]; then
  printf '%s\n' \
    'The production domain did not reach the exact merged commit. Pausing automatic assignment and containing the release.' \
    >&2
  if ! contain_failed_release; then
    printf '%s\n' \
      'Containment did not complete every safety check. Inspect the current deployment and automatic-domain setting before continuing.' \
      >&2
  fi
  exit 1
fi

test "$(jq -r '.id' <<<"$PRODUCTION_JSON")" = "$PRODUCTION_DEPLOYMENT_ID"
test "$(jq -r '.projectId' <<<"$PRODUCTION_JSON")" = "$PROJECT_ID"
test "$(jq -r '.meta.githubCommitSha' <<<"$PRODUCTION_JSON")" = \
  "$FINAL_COMMIT"
if ! wait_for_verified_public_site; then
  printf '%s\n' \
    'Production route verification failed. Pausing automatic assignment and containing the release.' \
    >&2
  if ! contain_failed_release; then
    printf '%s\n' \
      'Containment did not complete every safety check. Inspect the current deployment and automatic-domain setting before continuing.' \
      >&2
  fi
  exit 1
fi
require_release_main_unchanged
verify_production_domain_id

printf 'Production deployment ID: %s\n' "$PRODUCTION_DEPLOYMENT_ID"
printf 'Production commit: %s\n' "$FINAL_COMMIT"
```

Keep the previous production deployment ID through the rest of the launch. A
rollback may use that ID when alias-event history contains no intervening
deployment after the recorded baseline. Rerun `verify_public_health` before any
deprecation continues.

Failure containment pauses automatic production-domain assignment before it
cancels an unfinished release deployment or rolls back. After you repair
`main`, verify the exact fixed deployment before restoring normal Git deployment
behavior:

```bash
set -euo pipefail
PROJECT_ID=prj_J9yx9KZeG7q54CWTZm2ik2R4uwAd
PROJECT_JSON=$(vercel api "/v9/projects/$PROJECT_ID" --scope marklearst --raw)
test "$(jq -r '.id' <<<"$PROJECT_JSON")" = "$PROJECT_ID"
test "$(jq -r '.name' <<<"$PROJECT_JSON")" = primitree
test "$(jq -r '.autoAssignCustomDomains' <<<"$PROJECT_JSON")" = false
FIXED_DEPLOYMENT_ID='<exact verified fixed deployment ID>'
[[ "$FIXED_DEPLOYMENT_ID" =~ ^dpl_[A-Za-z0-9]+$ ]]
git fetch origin main
FIXED_COMMIT=$(git rev-parse 'origin/main^{commit}')
[[ "$FIXED_COMMIT" =~ ^[0-9a-f]{40}$ ]]
FIXED_JSON=$(
  vercel api "/v13/deployments/$FIXED_DEPLOYMENT_ID" \
    --scope marklearst --raw
)
test "$(jq -r '.id' <<<"$FIXED_JSON")" = "$FIXED_DEPLOYMENT_ID"
test "$(jq -r '.projectId' <<<"$FIXED_JSON")" = "$PROJECT_ID"
test "$(jq -r '.name' <<<"$FIXED_JSON")" = primitree
test "$(jq -r '.source' <<<"$FIXED_JSON")" = git
test "$(jq -r '.target' <<<"$FIXED_JSON")" = production
test "$(jq -r '.readyState' <<<"$FIXED_JSON")" = READY
test "$(jq -r '.meta.githubCommitRef' <<<"$FIXED_JSON")" = main
test "$(jq -r '.meta.githubCommitSha' <<<"$FIXED_JSON")" = "$FIXED_COMMIT"

public_get() {
  local body
  local effective_url
  local expected_url="$1"
  local response
  response=$(
    curl --fail --location --silent --show-error \
      --connect-timeout 5 --max-time 20 --max-redirs 5 \
      --write-out $'\n%{url_effective}' "$expected_url"
  )
  effective_url=${response##*$'\n'}
  body=${response%$'\n'*}
  test "${effective_url%/}" = "${expected_url%/}"
  printf '%s\n' "$body"
}

verify_fixed_public_site() {
  local body
  local summary
  summary=$(vercel inspect primitree.com --format=json --scope marklearst) ||
    return 1
  [[ "$(jq -r '.id // empty' <<<"$summary")" == "$FIXED_DEPLOYMENT_ID" ]] ||
    return 1
  body=$(public_get https://primitree.com/) || return 1
  grep -F 'Govern token change. Know every consequence.' <<<"$body" >/dev/null ||
    return 1
  body=$(public_get https://primitree.com/docs) || return 1
  grep -F 'Primitree checks a local DTCG token file' <<<"$body" >/dev/null ||
    return 1
  body=$(public_get https://primitree.com/playground) || return 1
  grep -F 'This page calls the same build function as' <<<"$body" >/dev/null ||
    return 1
  body=$(public_get https://primitree.com/docs/hooks/migration) || return 1
  grep -F 'Primitree 1.0 moves the hooks package from' <<<"$body" >/dev/null ||
    return 1
  body=$(public_get 'https://primitree.com/api/search?query=figma') || return 1
  grep -F '"url":"/docs/concepts/figma-mcp"' <<<"$body" >/dev/null ||
    return 1
  return 0
}

vercel promote "$FIXED_DEPLOYMENT_ID" --scope marklearst
vercel api "/v9/projects/$PROJECT_ID" \
  -X PATCH \
  -F autoAssignCustomDomains=false \
  --scope marklearst --silent
PROJECT_JSON=$(vercel api "/v9/projects/$PROJECT_ID" --scope marklearst --raw)
test "$(jq -r '.id' <<<"$PROJECT_JSON")" = "$PROJECT_ID"
test "$(jq -r '.autoAssignCustomDomains' <<<"$PROJECT_JSON")" = false
for attempt in {1..12}; do
  if verify_fixed_public_site; then
    break
  fi
  if ((attempt == 12)); then
    exit 1
  fi
  sleep 5
done
git fetch origin main
test "$(git rev-parse 'origin/main^{commit}')" = "$FIXED_COMMIT"
vercel api "/v9/projects/$PROJECT_ID" \
  -X PATCH \
  -F autoAssignCustomDomains=true \
  --scope marklearst --silent
PROJECT_JSON=$(vercel api "/v9/projects/$PROJECT_ID" --scope marklearst --raw)
test "$(jq -r '.id' <<<"$PROJECT_JSON")" = "$PROJECT_ID"
test "$(jq -r '.autoAssignCustomDomains' <<<"$PROJECT_JSON")" = true
FINAL_SUMMARY=$(vercel inspect primitree.com --format=json --scope marklearst)
test "$(jq -r '.id // empty' <<<"$FINAL_SUMMARY")" = "$FIXED_DEPLOYMENT_ID"
```

Rerun the project, deployment identity, domain, and public route checks from
this step. Do not assume another `main` push becomes public while Vercel remains
in rollback mode.

### 4. Create the bootstrap credential and protected environment

- [ ] Create a granular npm token that expires after one day and make the protected GitHub `npm` environment its sole storage location.

Create the granular token in the npm website with the minimum publish access
needed for the six packages and CI 2FA bypass. Use it for the initial
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

### 5. Tag, publish, and create the GitHub prerelease

- [ ] Create `v1.0.0-next.0` at the final verified commit and no other commit, push the single intended tag, and approve publication.

For the initial release, create one annotated prerelease tag at the recorded
commit. Never use a blanket tag push.

Update the release copy before creating the tag. In all six package changelogs,
change `1.0.0-next.0` to `1.0.0-next.0 (YYYY-MM-DD)`. In
`docs/launch/v1.0.0-next.0.md`, replace the draft status with
`Status: Released YYYY-MM-DD.` Use the same UTC date in all seven files. The
tag-mode metadata check rejects a missing date, a mismatched date, or an
`Unreleased` marker.

Run `git tag -d` to clear a local tag from an earlier failed launch attempt
before creating the release tag.

```bash
VERSION=1.0.0-next.0
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
eight files. Record the run ID, package pages, `next` dist-tags, absence of the
prerelease from `latest`, provenance, release notes, asset digests, and final
prerelease URL.

### 6. Configure all six trusted publishers

- [ ] Configure trusted publishing for all six packages and verify each saved relationship.

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
npm trust github 'primitree' --repository marklearst/primitree --file ci.yml --environment npm --allow-publish --yes --registry=https://registry.npmjs.org/
npm trust list '@primitree/core' --registry=https://registry.npmjs.org/
npm trust list '@primitree/dtcg' --registry=https://registry.npmjs.org/
npm trust list '@primitree/cli' --registry=https://registry.npmjs.org/
npm trust list '@primitree/hooks' --registry=https://registry.npmjs.org/
npm trust list '@primitree/mcp' --registry=https://registry.npmjs.org/
npm trust list 'primitree' --registry=https://registry.npmjs.org/
```

`npm trust list` confirms the saved configuration but cannot prove GitHub OIDC
until another package version publishes. The next token-free release proves
that GitHub OIDC can publish the package.

### 7. Delete the GitHub environment secret

- [ ] Delete `NPM_TOKEN` from the protected GitHub environment after you verify all six trust entries.

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

### 8. Revoke the exact bootstrap token

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

### 9. Require package MFA and disallow token publishing

- [ ] Require 2FA while disallowing token-based publishing on all six packages.

Before this step, you must save trusted publishing, delete the GitHub secret,
and revoke the bootstrap token. Open each package on npm, go to
**Settings → Publishing access**, choose
**Require two-factor authentication and disallow tokens**, and save:

- `@primitree/core`
- `@primitree/dtcg`
- `@primitree/cli`
- `@primitree/hooks`
- `@primitree/mcp`
- `primitree`

The npm CLI does not expose the disallow-tokens setting. After saving all six
packages, refresh each Publishing access page and confirm
**Require two-factor authentication and disallow tokens** remains selected.
Trusted OIDC publishing remains available through the exact repository,
workflow, and environment relationship.

### 10. Verify replacements and migration

- [ ] Verify every replacement package, the production documentation site, and the migration page.

```bash
npm view "@primitree/core@1.0.0-next.0" version --registry=https://registry.npmjs.org/
npm view "@primitree/dtcg@1.0.0-next.0" version --registry=https://registry.npmjs.org/
npm view "@primitree/cli@1.0.0-next.0" version --registry=https://registry.npmjs.org/
npm view "@primitree/hooks@1.0.0-next.0" version --registry=https://registry.npmjs.org/
npm view "@primitree/mcp@1.0.0-next.0" version --registry=https://registry.npmjs.org/
npm view "primitree@1.0.0-next.0" version --registry=https://registry.npmjs.org/
curl --fail --silent --show-error https://primitree.com/ >/dev/null
curl --fail --silent --show-error https://primitree.com/docs/hooks/migration >/dev/null
```

All six replacement packages, the production documentation site, and the
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
artifact, validates its eight-file boundary again, and keeps the job's OIDC
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
VERSION=1.0.0-next.0
RELEASE_CHANNEL=next
ARTIFACT_DIR=artifacts/npm
(cd "$ARTIFACT_DIR" && shasum -a 256 -c SHA256SUMS)
npm view "@primitree/core@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/dtcg@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/cli@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/hooks@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/mcp@$VERSION" version --registry=https://registry.npmjs.org
npm view "primitree@$VERSION" version --registry=https://registry.npmjs.org
```

GitHub's Linux jobs use `sha256sum --check SHA256SUMS` for the checksum step.
Treat npm `E404` as a missing package. Any other error, including an
authentication, permission, rate-limit, DNS, or registry failure, stops recovery.

The workflow uses its registry query to decide whether to execute each of these
six literal commands in dependency order. Maintainers must not execute them
from a local machine because local publication cannot preserve the workflow's
provenance:

```bash
npm publish "$ARTIFACT_DIR/primitree-core-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag="$RELEASE_CHANNEL" --ignore-scripts
npm publish "$ARTIFACT_DIR/primitree-dtcg-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag="$RELEASE_CHANNEL" --ignore-scripts
npm publish "$ARTIFACT_DIR/primitree-cli-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag="$RELEASE_CHANNEL" --ignore-scripts
npm publish "$ARTIFACT_DIR/primitree-hooks-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag="$RELEASE_CHANNEL" --ignore-scripts
npm publish "$ARTIFACT_DIR/primitree-mcp-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag="$RELEASE_CHANNEL" --ignore-scripts
npm publish "$ARTIFACT_DIR/primitree-$VERSION.tgz" --registry=https://registry.npmjs.org --access=public --tag="$RELEASE_CHANNEL" --ignore-scripts
```

### Wrong dist-tag

Inspect and repair a dist-tag without republishing. A prerelease must remain on
`next` and must not occupy `latest`. Remove `latest` when the listing shows that
it points to `$VERSION`; preserve it when it points to a stable version.
Use this core example for the package whose dist-tag needs repair:

```bash
npm dist-tag ls "@primitree/core" --registry=https://registry.npmjs.org
npm dist-tag add "@primitree/core@$VERSION" next --registry=https://registry.npmjs.org
LATEST_VERSION="$(
  npm view "@primitree/core" dist-tags.latest --registry=https://registry.npmjs.org
)"
if [ "$LATEST_VERSION" = "$VERSION" ]; then
  npm dist-tag rm "@primitree/core" latest --registry=https://registry.npmjs.org
fi
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
Re-query all six versions against the release registry and require all six
commands to return npm `E404`:

```bash
VERSION=1.0.0-next.0
npm view "@primitree/core@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/dtcg@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/cli@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/hooks@$VERSION" version --registry=https://registry.npmjs.org
npm view "@primitree/mcp@$VERSION" version --registry=https://registry.npmjs.org
npm view "primitree@$VERSION" version --registry=https://registry.npmjs.org
```

After cancellation is terminal, the publish job never started, and all six
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
