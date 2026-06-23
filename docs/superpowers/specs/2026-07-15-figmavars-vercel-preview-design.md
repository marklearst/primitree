# FigmaVars Vercel Preview Design

**Status:** Approved for implementation on 2026-07-15

## Context

The FigmaVars monorepo contains a Next.js documentation application in
`apps/docs`. The application imports `@figmavars/core` and `@figmavars/dtcg`
from the same pnpm workspace. Mark wants a hosted copy of the current checkout
for review before the repository, domain, and launch infrastructure reach their
final state.

The Vercel account exposes one scope, `Mark Learst's projects`, with the slug
`marklearst`. That scope has no FigmaVars project.

## Goal

Create a Vercel project named `figmavars` under the existing account and deploy
the current checkout as a preview. The preview must build the documentation app
with its workspace dependencies and provide a stable Vercel URL for review.

## Project configuration

The project will use these settings:

- Account scope: `marklearst`
- Project name: `figmavars`
- Framework: Next.js
- Root directory: `apps/docs`
- Node.js version: `24.x`
- Source files outside the root directory: enabled
- Deployment target: preview

The setup will not connect a Git provider. The deployment will upload the local
`quality/v5-harmonization` checkout, including application work that has not
reached remote `main`.

## Deployment flow

1. Create the `figmavars` project in the existing Vercel account.
2. Apply the monorepo project settings before the first build.
3. Link the local checkout to the project without changing tracked application
   files.
4. Deploy the checkout to Vercel's preview environment.
5. Inspect the deployment state and build logs through the Vercel connector.
6. Request the home page, documentation, playground, and search route from the
   deployed URL.

The documentation application requires no deployment secrets for this preview.

## Failure handling

A failed build will remain a preview deployment. The implementation will
inspect its logs before choosing the next step and will correct monorepo
detection failures through Vercel project settings. Application source changes
require a specific build or runtime failure and focused local verification
before another deployment.

The setup must not promote a failed or unverified deployment to production.

## Non-goals

- No production deployment or production alias.
- No custom domain or DNS changes.
- No GitHub integration or automatic deployments.
- No Vercel team migration.
- No analytics, environment secrets, or paid add-ons.
- No npm publication, Git tag movement, or release workflow execution.

## Acceptance criteria

- Vercel lists one `figmavars` project under the `marklearst` scope.
- The preview deployment reaches the `READY` state.
- `/`, `/docs`, and `/playground` return HTTP 200 responses.
- `/api/search?query=figma` returns HTTP 200 with a valid response body.
- Build and runtime inspection show no deployment-blocking error.
- Vercel does not attach `figmavars.com` or create a production deployment.
- The repository retains no unintended tracked changes after setup.
