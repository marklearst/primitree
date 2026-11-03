import graphData from '@/tokens/generated/graph.json' with { type: 'json' }
import type { TokenPath } from '@/tokens/generated/token-path'
import {
  type GraphFrame,
  type GraphLayer,
  LAYER_ORDER,
  orderBands,
  type Placed,
  placeBands,
} from './graph-layout'
import { cssVarOf } from './site-graph-names'

/* The site's own token graph, as scripts/build-site-tokens.mjs read it through
   @primitree/core. Layout runs on the server, so the graph paints with the
   page. */

type ThemeName = 'light' | 'dark'

export interface SiteToken {
  readonly path: TokenPath
  readonly layer: GraphLayer
  readonly type: string
  readonly target: Readonly<Record<ThemeName, TokenPath | null>>
  readonly value: Readonly<Record<ThemeName, string>>
  readonly description?: string
}

export const siteTokens = graphData.tokens as readonly SiteToken[]

/** The tokens as the drawings and the engine carry them. */
export const graphTokens = siteTokens.map(token => ({
  p: token.path,
  l: token.target.light,
  d: token.target.dark,
  c: token.type === 'color',
  ...(token.description === undefined ? {} : { n: token.description }),
}))

export const tokenVar = (path: TokenPath) => `var(${cssVarOf(path)})`

const references = () =>
  siteTokens.flatMap(token =>
    [...new Set([token.target.light, token.target.dark])]
      .filter(target => target !== null)
      .map(to => ({ from: token.path, to }))
  )

export const placeGraph = (frame: GraphFrame) =>
  placeBands(siteTokens, orderBands(siteTokens, references()), frame)

/** The position the layout gave a token. A miss fails the build. */
export const placedIn = (
  positions: ReadonlyMap<string, Placed>,
  path: string
): Placed => {
  const position = positions.get(path)
  if (position === undefined) {
    throw new Error(`The graph layout lost ${path}.`)
  }
  return position
}

export const layerCounts = (): Readonly<Record<GraphLayer, number>> =>
  Object.fromEntries(
    LAYER_ORDER.map(layer => [
      layer,
      siteTokens.filter(token => token.layer === layer).length,
    ])
  ) as Record<GraphLayer, number>
