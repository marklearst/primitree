# FigmaVars documentation

The Fumadocs/Next.js documentation application for the FigmaVars monorepo.

From the repository root:

```sh
pnpm --filter figmavars-docs dev
pnpm --filter figmavars-docs typecheck
pnpm --filter figmavars-docs build
```

CLI reference pages live in `content/docs/cli` and are checked against the
exported CLI help by the `@figmavars/cli` test suite.
