# Primitree docs

`apps/docs` contains the Fumadocs and Next.js site published at
[`primitree.com`](https://primitree.com).

The monorepo requires Node.js 24 or newer and pnpm 11 or newer.

From the repository root:

```sh
pnpm --filter primitree-docs dev
pnpm --filter primitree-docs typecheck
pnpm --filter primitree-docs build
```

CLI reference pages live in `content/docs/cli`. The `@primitree/cli` test suite
checks them against the CLI help.
