# FigmaVars Vercel Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the Fumadocs application from `apps/docs` as a verified Vercel preview under the existing `marklearst` account.

**Architecture:** Create one Vercel project with `apps/docs` as its monorepo root and allow access to workspace packages outside that directory. Deploy the current repository checkout from the local machine, then verify the preview through Vercel deployment data and HTTP requests.

**Tech Stack:** Vercel CLI 56.1.0, Vercel REST API, Vercel connector, Next.js 16, Fumadocs, pnpm 11, Turborepo

## Global Constraints

- Use the Vercel account scope `marklearst` and project name `figmavars`.
- Use Next.js with root directory `apps/docs` and Node.js `24.x`.
- Enable source files outside the root directory for workspace dependencies.
- Create a preview deployment from the local `quality/v5-harmonization` checkout.
- Do not create a production deployment, production alias, custom domain, Git integration, analytics integration, environment secret, or paid add-on.
- Do not change application source unless a captured build or runtime error requires a focused fix.
- Do not modify npm packages, Git tags, or release workflows.
- Keep Git metadata free of tooling attribution.

## State map

- External create: Vercel project `team_a4EYFEklZcRQWKGf0zMA0vCA/figmavars`
- External create: one Vercel preview deployment
- Local generated state: `apps/docs/.vercel/project.json`, already ignored by `apps/docs/.gitignore`
- Read: `apps/docs/package.json`
- Read: `apps/docs/next.config.mjs`
- Read: `pnpm-workspace.yaml`
- Read: `turbo.json`
- No tracked implementation file should change

---

### Task 1: Create and configure the Vercel project

**Files:**

- Create external state: Vercel project `figmavars`
- Create ignored local state: `apps/docs/.vercel/project.json`
- Verify ignore rule: `apps/docs/.gitignore:25`

**Interfaces:**

- Consumes: Vercel team ID `team_a4EYFEklZcRQWKGf0zMA0vCA` and team slug `marklearst`
- Produces: a Vercel project ID with the approved monorepo settings

- [ ] **Step 1: Confirm the project state before mutation**

Run:

```bash
vercel api /v9/projects/figmavars --scope marklearst --raw
```

Expected: HTTP 404 when the project does not exist. A successful response means a prior attempt created it; inspect that project and continue with Step 3 instead of creating a duplicate.

- [ ] **Step 2: Create the missing project**

Run only after Step 1 returns HTTP 404:

```bash
vercel api /v10/projects \
  --scope marklearst \
  --method POST \
  --raw-field name=figmavars \
  --raw-field framework=nextjs \
  --raw-field rootDirectory=apps/docs \
  --raw-field nodeVersion=24.x \
  --field sourceFilesOutsideRootDirectory=true \
  --field skipGitConnectDuringLink=true \
  --raw
```

Expected: JSON containing a `prj_` project ID, `"name":"figmavars"`, and account ID `team_a4EYFEklZcRQWKGf0zMA0vCA`.

- [ ] **Step 3: Apply the exact project settings**

Run:

```bash
vercel api /v9/projects/figmavars \
  --scope marklearst \
  --method PATCH \
  --raw-field framework=nextjs \
  --raw-field rootDirectory=apps/docs \
  --raw-field nodeVersion=24.x \
  --field sourceFilesOutsideRootDirectory=true \
  --field skipGitConnectDuringLink=true \
  --raw
```

Expected: JSON reports `framework` as `nextjs`, `rootDirectory` as `apps/docs`, `nodeVersion` as `24.x`, and `sourceFilesOutsideRootDirectory` as `true`.

- [ ] **Step 4: Link the documentation directory**

Run:

```bash
vercel link \
  --cwd apps/docs \
  --yes \
  --team team_a4EYFEklZcRQWKGf0zMA0vCA \
  --project figmavars
```

Expected: Vercel links `apps/docs` to `marklearst/figmavars` and writes `apps/docs/.vercel/project.json`. Git continues to ignore that directory.

- [ ] **Step 5: Verify the project through the connector**

Call `vercel_get_project` with the project ID from Step 2 or Step 3 and team ID `team_a4EYFEklZcRQWKGf0zMA0vCA`.

Expected: the connector returns the same project name, account, framework, root directory, Node version, and outside-root source setting.

### Task 2: Build and deploy the Fumadocs preview

**Files:**

- Read: `apps/docs/package.json`
- Read: `apps/docs/next.config.mjs`
- Read: `packages/core/package.json`
- Read: `packages/dtcg/package.json`
- Create external state: one preview deployment

**Interfaces:**

- Consumes: the configured Vercel project ID from Task 1 and the current repository checkout
- Produces: `deploymentId: string` and `deploymentUrl: string` for the newest
  Vercel preview

- [ ] **Step 1: Confirm the repository starts clean**

Run:

```bash
git status --short
```

Expected: no output.

- [ ] **Step 2: Build the documentation application locally**

Run:

```bash
pnpm --filter figmavars-docs run build
```

Expected: Next.js compiles the Fumadocs application, typechecks it, and generates all static pages with exit code 0.

- [ ] **Step 3: Inspect the deployment input**

Run:

```bash
vercel deploy /Users/mark/Developer/oss/figma-vars-hooks \
  --dry \
  --project figmavars \
  --scope marklearst
```

Expected: Vercel detects the linked `figmavars` project and prepares a preview upload from the repository root. Stop before deployment if Vercel selects a different project or scope.

- [ ] **Step 4: Deploy to the preview environment**

Run:

```bash
vercel deploy /Users/mark/Developer/oss/figma-vars-hooks \
  --project figmavars \
  --scope marklearst \
  --yes \
  --logs
```

Expected: Vercel prints a `vercel.app` preview URL and finishes the build without creating a production deployment.

- [ ] **Step 5: Capture the deployment identity**

Call `vercel_list_deployments` with the Task 1 project ID and team ID `team_a4EYFEklZcRQWKGf0zMA0vCA`.

Expected: the newest deployment targets `preview`; record its `dpl_` ID and URL for Task 3.

### Task 3: Verify the deployed site and repository state

**Files:**

- Read external state: Vercel deployment metadata and logs
- Verify local state: Git working tree and ignored Vercel link

**Interfaces:**

- Consumes: the preview deployment ID and URL from Task 2
- Produces: route, build-log, runtime, and repository evidence for the handoff

- [ ] **Step 1: Verify deployment readiness**

Call `vercel_get_deployment` with the preview deployment ID and team ID `team_a4EYFEklZcRQWKGf0zMA0vCA`.

Expected: deployment state `READY`, target `preview`, and no production alias.

- [ ] **Step 2: Inspect build errors**

Call `vercel_get_deployment_build_logs` with `deploymentId` from Task 2:

```ts
{
  idOrUrl: deploymentId,
  teamId: 'team_a4EYFEklZcRQWKGf0zMA0vCA',
  errorsOnly: true,
  direction: 'tail',
  limit: 100,
}
```

Expected: no fatal, exit, stderr, or error event that affects the deployment.

- [ ] **Step 3: Verify the public routes**

Use `vercel_web_fetch_vercel_url` with each path resolved against
`deploymentUrl` from Task 2:

```text
/
/docs
/playground
/api/search?query=figma
```

Expected: each request returns HTTP 200. The search request returns a valid response body rather than an HTML error page.

- [ ] **Step 4: Inspect preview runtime errors**

Call `vercel_get_runtime_errors` with the Task 1 project ID, team ID `team_a4EYFEklZcRQWKGf0zMA0vCA`, and `since` set to `1h`.

Expected: no error cluster caused by the four verification requests.

- [ ] **Step 5: Confirm local and external boundaries**

Run:

```bash
git status --short
git check-ignore -v apps/docs/.vercel/project.json
```

Expected: Git reports no tracked or untracked change, and `apps/docs/.gitignore` matches the Vercel link file. Vercel still has no production deployment or `figmavars.com` domain assignment.

- [ ] **Step 6: Report the preview URL**

Provide the verified `vercel.app` URL, project ID, deployment ID, route results, and any non-blocking build warning. Do not claim success unless Tasks 1 through 3 provide current evidence.
