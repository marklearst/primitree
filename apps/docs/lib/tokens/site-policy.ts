import siteConfig from '../../tokens/primitree.config.ts'

/* The rules from primitree.config.ts, the one file the CLI, the site build, and
   this page all read. */

interface SiteOwnership {
  readonly default?: readonly string[]
  readonly paths: Readonly<Record<string, readonly string[]>>
}

const { architecture, ownership } = siteConfig.sources['light-full']

export const siteLayers = architecture.layers.map(layer => ({
  references: [],
  ...layer,
}))

export const siteOwnership: SiteOwnership = ownership

/** The config with `ownership.default` removed, as the PT1005 switch edits it. */
export const siteOwnershipWithoutDefault: SiteOwnership = {
  paths: siteOwnership.paths,
}

/** The lookup `primitree inspect` runs: the token's top-level group, or the default. */
export function ownersOf(
  path: string,
  ownership: SiteOwnership = siteOwnership
): readonly string[] {
  const [root = ''] = path.split('.')
  return ownership.paths[root] ?? ownership.default ?? []
}
