# primitree

`primitree` provides the unscoped command for
[`@primitree/cli`](https://www.npmjs.com/package/@primitree/cli).

```sh
npx primitree@next --help
npx primitree@next check
```

The `next` tag carries the 1.0 prerelease. The prerelease does not occupy npm's
`latest` tag. The stable release will support `npx primitree` without a tag.

Install `@primitree/cli@next` when a project imports
`@primitree/cli/config`. The launcher contains no second CLI implementation; it
forwards the command to that package. Programmatic token APIs remain in
`@primitree/core` and `@primitree/dtcg`.

Primitree requires Node.js 24 or newer.

See the [changelog](CHANGELOG.md) for release notes.
