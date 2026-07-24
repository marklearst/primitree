# FigmaVars docs

`apps/docs` contains the Fumadocs and Next.js site published at
[`figmavars.com`](https://figmavars.com).

The monorepo requires Node.js 24 or newer and pnpm 11 or newer.

From the repository root:

```sh
pnpm --filter figmavars-docs dev
pnpm --filter figmavars-docs typecheck
pnpm --filter figmavars-docs build
```

CLI reference pages live in `content/docs/cli`. The `@figmavars/cli` test suite
checks them against the CLI help.
