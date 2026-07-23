# Changesets

Create a release note with `pnpm changeset`. The five public `@figmavars/*`
packages use a fixed version group, so one approved change updates the whole
public release train. Apply pending release notes with `pnpm version-packages`.

Private workspaces are excluded from Changesets versioning and publishing.
