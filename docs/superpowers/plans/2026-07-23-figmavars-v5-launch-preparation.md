# FigmaVars 5.0 Launch Preparation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan task by task.
> Use test-driven development for behavior changes and request a focused review
> after each task.

**Goal:** Prepare the five-package `@figmavars` release train, repository,
documentation site, and protected release path for a reviewed 5.0.0 launch
without publishing, tagging, merging, or promoting a production deployment.

**Architecture:** The five public packages share one fixed version and move
through one dependency-ordered release artifact. CI builds and verifies that
artifact on Node 24, tests the public React 19 and command-line contracts, and
publishes the same bytes only from a stable tag at the exact `main` commit.
Changesets manages future version pull requests. The existing release workflow
continues to own publication so the first package creation and later trusted
publishing use one reviewed path.

**Tech stack:** Node.js 24, React 19, pnpm 11, Turborepo, Changesets, npm 11,
GitHub Actions, Vercel, Vitest, Playwright, Publint, and Are the Types Wrong.

## Global constraints

- The permanent GitHub location is `marklearst/figmavars`.
- The npm namespace is `@figmavars`.
- The public release set is exactly `@figmavars/core`, `@figmavars/dtcg`,
  `@figmavars/cli`, `@figmavars/hooks`, and `@figmavars/mcp`.
- All five public packages use one fixed version. The launch version is
  `5.0.0`.
- Publication order is core, dtcg, cli, hooks, then mcp.
- Node `>=24.0.0` is the public package and source-workspace requirement. The
  root source workspace supports pnpm `>=11.0.0` and pins pnpm `11.10.0` for
  reproducible Corepack and CI installs.
- React `^19.0.0` is the hooks peer contract. React 18 is unsupported.
- `@figma-vars/hooks` remains at `4.0.0`. Deprecate it only after all five
  replacement packages are live and verified.
- Keep private applications and `@figmavars/plugin-export` out of the public
  release train and out of fixed-version validation.
- Build and pack with pnpm. Publish the inspected tarballs with a pinned,
  trusted-publishing-capable npm CLI.
- Do not publish packages, move or push release tags, merge the branch, create a
  GitHub Release, or promote a production Vercel deployment during this plan.
- Do not add tool attribution, generated-by text, co-author trailers, or task
  links to branch names, commit messages, pull-request text, or release notes.
- Do not expose npm credentials in terminal output, repository files, logs, or
  chat. Mark creates the short-lived token in npm's web interface and stores it
  only in the protected GitHub `npm` environment.

---

### Task 1: Codify the Node 24, React 19, and fixed-release contract

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/{core,dtcg,cli,hooks,mcp}/package.json`
- Modify: `scripts/release-config.mjs`
- Modify: `scripts/check-release.mjs`
- Modify: `scripts/check-release.test.mjs`
- Create: `.changeset/config.json`
- Create: `.changeset/README.md`

**Contract:**

- Every public manifest declares Node `>=24.0.0`.
- The root source workspace declares Node `>=24.0.0`.
- The root source workspace declares pnpm `>=11.0.0` while pinning the tested
  pnpm 11.x patch through `packageManager`.
- Hooks declares React `^19.0.0` and does not require an unused React DOM peer.
- Changesets has one fixed group containing the five public package names.
- Changesets uses public access, `main` as the base branch, and does not version
  private workspaces.
- Release validation compares only the five public package versions.

- [ ] Add failing validator tests for the Node 24 engine, pnpm 11 floor, React
      19 peer, fixed package group, and private-workspace version independence.
- [ ] Run the focused release tests and record the expected failures.
- [ ] Update manifests, the canonical release inventory, and validator logic.
- [ ] Install and pin the Changesets CLI, then update the lockfile.
- [ ] Add Changesets configuration and root scripts for creating changesets and
      updating versions.
- [ ] Run the focused tests, frozen install, and manifest validation.
- [ ] Review the task for contract compliance and package-manager correctness.

---

### Task 2: Separate the MCP library from its executable

**Files:**

- Modify: `packages/mcp/src/index.ts`
- Create: `packages/mcp/src/cli.ts`
- Modify: `packages/mcp/package.json`
- Modify: `packages/mcp/tsup.config.ts`
- Create: `packages/mcp/tests/index.test.ts`
- Create or modify: MCP executable integration tests
- Modify: release-artifact smoke tests where needed

**Contract:**

- Importing `@figmavars/mcp` never parses command-line arguments, writes to
  standard error, opens stdio transport, or exits the process.
- `figma-vars-mcp` points to a dedicated executable entry.
- The server reports the package manifest version instead of a duplicated
  version string.
- A real stdio client can initialize the built executable and list its tools.

- [ ] Add an import-safety regression test whose consumer entrypoint ends in
      `dist/index.js`.
- [ ] Run the focused test against the current build and record the process-exit
      failure.
- [ ] Add a real MCP stdio initialization and tool-list test.
- [ ] Split the executable entry and derive the server version from package
      metadata.
- [ ] Point the package bin and build configuration at the executable entry.
- [ ] Run the MCP build, unit tests, integration tests, Publint, and packed
      import smoke.
- [ ] Review the task for side effects, protocol behavior, and package layout.

---

### Task 3: Make public compatibility checks deterministic

**Files:**

- Modify: `packages/hooks/tests/**`
- Modify: `packages/cli/tests/**`
- Modify: `packages/dtcg/tests/pipeline.test.ts`
- Modify: `packages/dtcg/src/pipeline/build.ts`
- Modify: `playwright.config.ts`
- Modify: `.prettierignore`
- Modify: related package scripts and release-artifact tests

**Contract:**

- Hooks render on the server with React 19 through `react-dom/server`.
- The CLI export command exercises a successful local fixture path and its
  important failure paths.
- Generated token workflows use Node 24 and install the current
  `@figmavars/cli` package version.
- Browser tests never reuse an unrelated process already listening on the
  configured ports.
- Formatting ignores local Vercel link state.

- [ ] Add a failing React 19 server-render test for the hooks public entry.
- [ ] Add functional CLI export tests that exercise real file input and output.
- [ ] Add failing generated-workflow assertions for Node 24 and package-version
      synchronization.
- [ ] Run each focused test and record its expected failure.
- [ ] Implement the minimum runtime, generation, and configuration changes.
- [ ] Run hooks, CLI, DTCG, browser, and formatting checks on isolated ports.
- [ ] Review the task for test realism and deterministic local behavior.

---

### Task 4: Complete release automation and recovery checks

**Files:**

- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/version-packages.yml`
- Modify: `scripts/release-artifacts.mjs`
- Modify: `scripts/release-artifacts.test.mjs`
- Modify: `docs/releasing.md`
- Create or modify: reviewed 5.0.0 GitHub Release notes

**Contract:**

- Quality, artifact-consumer, and publish jobs use Node 24.
- Publish jobs install a pinned npm CLI that supports current trusted
  publishing.
- The public-package consumer test runs on Node 24 and installs the exact
  tarballs.
- A stable release tag must equal the current `origin/main` commit, not any
  ancestor.
- The publish job sends the five inspected tarballs in dependency order.
- After publication, bounded registry checks require the exact version,
  integrity, `latest` dist-tag, attestation, provenance identity, workflow, tag,
  and commit.
- A clean public-registry consumer installs and smokes the published packages.
- A separate idempotent job creates the GitHub Release only after npm
  verification and attaches the five tarballs, `manifest.json`, and
  `SHA256SUMS`.
- Changesets creates version pull requests only. It never publishes.
- Third-party actions use reviewed full commit SHAs.

- [ ] Add failing workflow and release-script tests for Node 24, pinned npm,
      exact-main tags, post-publish verification, release assets, and Changesets
      version-only behavior.
- [ ] Run the focused workflow tests and record the expected failures.
- [ ] Update the workflow and reusable release verification code.
- [ ] Add the Changesets version-pull-request workflow.
- [ ] Update the release runbook for bootstrap-token and trusted-publishing
      phases.
- [ ] Run workflow parsing, release artifact tests, and shell/static checks.
- [ ] Review the task for least privilege, retry safety, and partial-release
      recovery.

---

### Task 5: Finish package changelogs and public documentation

**Files:**

- Create: `packages/{core,dtcg,cli,mcp}/CHANGELOG.md`
- Modify: `packages/hooks/CHANGELOG.md`
- Modify: `packages/{core,dtcg,cli,hooks,mcp}/README.md`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `apps/docs/content/docs/**`
- Modify: `apps/docs/app/layout.tsx`
- Create: `apps/docs/app/sitemap.ts`
- Create: `apps/docs/app/robots.ts`
- Modify: `docs/launch/announcement.md`
- Create: `docs/launch/v5.0.0.md`

**Contract:**

- Each public package has specific 5.0.0 release notes marked as unreleased
  until the release commit.
- Root and contributor docs describe the full monorepo, including docs,
  playground, plugin, and private export package.
- Public links use `https://figmavars.com` and the permanent GitHub repository.
- Core and DTCG have dedicated install and API documentation.
- DTCG copy says "DTCG 2025.10 plus a documented boolean extension" wherever
  strict conformance would be overstated.
- Migration docs link to the relevant changelog and name the replacement
  namespace.
- The docs site declares canonical metadata, sitemap, robots policy, and social
  card metadata.
- Launch copy claims only behavior covered by the finished checks.

- [ ] Add documentation parity or metadata tests where structured behavior can
      regress.
- [ ] Write package-specific changelogs and release notes.
- [ ] Update package, repository, migration, and contribution docs.
- [ ] Add docs-site discovery and canonical metadata.
- [ ] Run the prose cleanup pass for filler, unsupported claims, and stale
      namespace references.
- [ ] Run docs typechecking, build, link/search checks, and package README
      parity checks.
- [ ] Review the task for technical accuracy and release-note completeness.

---

### Task 6: Prepare GitHub and Vercel without releasing

**External state:**

- GitHub repository: `marklearst/figmavars`
- GitHub environment: `npm`
- Vercel project: `figmavars`
- Branch: `quality/v5-harmonization`

**Contract:**

- Repository description, homepage, and source remote match FigmaVars.
- The protected GitHub `npm` environment exists with release-tag deployment
  policy and the feasible solo-maintainer review controls.
- `main` requires the quality and package-consumer checks, pull requests, and
  protected history.
- Release tags cannot be changed or deleted through ordinary pushes.
- No npm token is created or stored during this task.
- The branch preview deploys from the reviewed branch and serves the main docs,
  package docs, sitemap, robots file, playground, and search endpoint.

- [ ] Verify the current remote, repository metadata, environments, rulesets,
      tags, and Vercel project before mutation.
- [ ] Push the reviewed branch using project-only Git metadata.
- [ ] Create or update the protected `npm` environment.
- [ ] Add feasible `main` and release-tag protections after required check names
      exist on GitHub.
- [ ] Update repository description and homepage.
- [ ] Deploy or inspect the Vercel branch preview and verify launch-facing
      routes through authenticated access.
- [ ] Record any plan or account limitation that prevents a requested control.

---

### Task 7: Run the full launch-preparation quality gate

**Verification:**

- Frozen dependency install
- Formatting and linting with no actionable findings
- Typechecking
- Unit and integration tests
- Coverage
- Production builds
- Isolated Playwright suite
- Release manifest and exact-tarball validation
- Clean external tarball installs on Node 24
- Documentation build and preview route checks
- Whole-branch code review

- [ ] Run every verification command from a clean branch state and capture
      fresh results.
- [ ] Generate a whole-branch review package from the branch merge base.
- [ ] Request a fresh code review for correctness, security, package contracts,
      documentation accuracy, and release safety.
- [ ] Fix every Critical and Important finding with focused tests, then request
      re-review.
- [ ] Confirm the branch contains no new prohibited Git-visible attribution.
- [ ] Leave publication, tag creation, merge, npm trusted-publisher setup, token
      creation, token revocation, legacy deprecation, and production deployment
      unchecked for the launch session.

## Launch-session handoff

After this plan passes review and Mark approves the merge:

1. Merge the reviewed branch to `main`.
2. Confirm the final `main` commit and recreate one annotated `v5.0.0` tag at
   that exact commit.
3. Create a one-day granular npm token for the `@figmavars` scope with the
   minimum publish access and CI 2FA bypass.
4. Store the token only as `NPM_TOKEN` in the protected GitHub `npm`
   environment.
5. Push `v5.0.0` and approve the protected publish job.
6. Let the workflow publish core, dtcg, cli, hooks, and mcp from the verified
   tarballs, then verify npm and create the GitHub Release.
7. Configure trusted publishing on each package for repository
   `marklearst/figmavars`, workflow `ci.yml`, and environment `npm`.
8. Verify all five publisher relationships.
9. Delete the GitHub environment secret and revoke the bootstrap token.
10. Configure each npm package to require two-factor authentication and
    disallow token-based publishing.
11. Deprecate `@figma-vars/hooks@*` with a concise move notice only after the
    replacement packages and migration documentation are live.
12. Promote the reviewed Vercel deployment and attach `figmavars.com`.
