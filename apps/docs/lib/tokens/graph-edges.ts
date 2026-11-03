import { type Placed, type Ribbon, ribbonPath } from './graph-layout.ts'

/* The ribbons of the token graph, as the hero and a phone both draw them: one
   per reference, from the target up to its reader, rooted by how many
   component tokens the target reaches. This module reads no graph data, so
   importing it pulls no graph.json into the client. */

/** A token as the drawings carry it. */
export interface GraphToken<Path extends string = string> {
  /** Token path. */
  readonly p: Path
  /** Alias target in the light theme. */
  readonly l: Path | null
  /** Alias target in the dark theme. */
  readonly d: Path | null
  /** True for a color. */
  readonly c: boolean
}

/** The phone's ribbons: finer roots and a shorter fade for a 358px frame. */
export const NARROW_RIBBON: Ribbon = {
  rootBase: 1.3,
  rootGain: 0.6,
  tipRatio: 0.45,
  opacity: 0.78,
  opacityFloor: 0.25,
  fade: 170,
}

export interface RibbonEdge<Path extends string = string> {
  readonly from: Path
  readonly to: Path
  /** Which theme draws this reference, or null when both do. */
  readonly only: 'light' | 'dark' | null
  /** The reader's layer, the first segment of its path. */
  readonly layer: string
  /** True when the reader is a color, so the ribbon takes the target's value. */
  readonly color: boolean
  readonly run: number
  readonly d: string
  /** The rest opacity, faded by the run. */
  readonly rest: string
}

/** How many component tokens read a token in either theme. */
const reachOf = (tokens: readonly GraphToken[], path: string) =>
  tokens.filter(
    token =>
      token.p.startsWith('component.') && (token.l === path || token.d === path)
  ).length

/** One ribbon from a target up to its reader, or null when the layout has no
 * position for one of them. */
export function ribbonShape(
  tokens: readonly GraphToken[],
  positionOf: (path: string) => Placed | undefined,
  style: Ribbon,
  from: string,
  to: string
): { readonly d: string; readonly run: number } | null {
  const upper = positionOf(from)
  const lower = positionOf(to)
  if (upper === undefined || lower === undefined) {
    return null
  }
  const reach = to.startsWith('primitives.')
    ? Math.max(1, reachOf(tokens, from))
    : 1
  const root = style.rootBase + style.rootGain * Math.sqrt(reach)
  return {
    d: ribbonPath(lower, upper, root, root * style.tipRatio),
    run: Math.abs(upper.x - lower.x),
  }
}

/** Every reference as a ribbon, long runs first so short ones stay readable on
 * top. */
export function ribbonEdges<Path extends string>(
  tokens: readonly GraphToken<Path>[],
  positionOf: (path: string) => Placed | undefined,
  style: Ribbon
): readonly RibbonEdge<Path>[] {
  return tokens
    .flatMap(token => {
      const targets: readonly (readonly [
        Path | null,
        'light' | 'dark' | null,
      ])[] =
        token.l === token.d
          ? [[token.l, null]]
          : [
              [token.l, 'light'],
              [token.d, 'dark'],
            ]
      return targets.flatMap(([to, only]) => {
        const shape =
          to === null
            ? null
            : ribbonShape(tokens, positionOf, style, token.p, to)
        if (to === null || shape === null) {
          return []
        }
        return [
          {
            from: token.p,
            to,
            only,
            layer: token.p.split('.')[0],
            color: token.c,
            run: shape.run,
            d: shape.d,
            rest: (
              style.opacity *
              Math.max(style.opacityFloor, 1 - shape.run / style.fade)
            ).toFixed(3),
          },
        ]
      })
    })
    .sort((a, b) => b.run - a.run)
}
