# Changesets

Create a release note with `pnpm changeset`. The five public `@figmavars/*`
packages use a fixed version group, so an approved changeset updates all five
to the same version. Apply pending release notes with
`pnpm version-packages`.

Maintainers do not version or publish private workspaces through Changesets.
