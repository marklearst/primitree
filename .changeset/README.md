# Changesets

Create a release note with `pnpm changeset`. The five scoped packages and the
unscoped `primitree` launcher use a fixed version group, so an approved
changeset updates all six to the same version. Apply pending notes with `pnpm
version-packages`.

Maintainers do not version or publish private workspaces through Changesets.
