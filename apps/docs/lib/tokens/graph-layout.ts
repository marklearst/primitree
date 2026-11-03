/* Lays out the token graph in three bands. Pure data in, positions out, so the
   server renders it once and the client never measures anything.

   Each theme is a forest, since every token has one target per theme, so the
   ordering leaves almost no crossings. No reference changes type either, so each
   DTCG type owns a vertical slab across all three bands, which keeps every ribbon
   short. Nodes hold their place when a theme reroutes an alias. */

export type GraphLayer = 'component' | 'semantic' | 'primitives'

export const LAYER_ORDER: readonly GraphLayer[] = [
  'component',
  'semantic',
  'primitives',
]

/** Left to right, so the color ribbons sit under the dial. */
export const TYPE_ORDER = [
  'number',
  'fontWeight',
  'fontFamily',
  'dimension',
  'color',
  'duration',
  'cubicBezier',
] as const

export interface LayoutNode {
  readonly path: string
  readonly layer: GraphLayer
  readonly type: string
}

export interface LayoutEdge {
  /** The token that holds the alias. */
  readonly from: string
  /** The token the alias points at. */
  readonly to: string
}

/** The phone drawing's viewBox. It lives here because the server computes the
 * positions and the client draws them. */
export const NARROW_WIDTH = 358
export const NARROW_HEIGHT = 308

const MAX_SWEEPS = 24
const QUIET_SWEEPS = 8
const MAX_TRANSPOSE_PASSES = 16

type Bands = string[][]

function adjacency(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[]) {
  const up = new Map<string, string[]>(nodes.map(node => [node.path, []]))
  const down = new Map<string, string[]>(nodes.map(node => [node.path, []]))
  for (const edge of edges) {
    down.get(edge.from)?.push(edge.to)
    up.get(edge.to)?.push(edge.from)
  }
  return { up, down }
}

/** Crossings between adjacent bands, for a given order. */
export function countCrossings(
  bands: readonly (readonly string[])[],
  edges: readonly LayoutEdge[]
): number {
  const index = new Map<string, number>()
  for (const band of bands) {
    band.forEach((path, slot) => {
      index.set(path, slot)
    })
  }
  const inGap = (upper: readonly string[]) => {
    const members = new Set(upper)
    return edges
      .filter(edge => members.has(edge.from))
      .map(
        edge => [index.get(edge.from) ?? 0, index.get(edge.to) ?? 0] as const
      )
  }
  let crossings = 0
  for (const upper of bands.slice(0, -1)) {
    const placed = inGap(upper)
    for (let first = 0; first < placed.length; first += 1) {
      for (let second = first + 1; second < placed.length; second += 1) {
        const [a = 0, b = 0] = placed[first] ?? []
        const [c = 0, d = 0] = placed[second] ?? []
        if ((a - c) * (b - d) < 0) {
          crossings += 1
        }
      }
    }
  }
  return crossings
}

/** A depth-first seed keeps each alias tree contiguous before the sweeps start. */
function seedBands(
  nodes: readonly LayoutNode[],
  up: ReadonlyMap<string, readonly string[]>,
  down: ReadonlyMap<string, readonly string[]>
): Bands {
  const layerOf = new Map(nodes.map(node => [node.path, node.layer]))
  const bands: Bands = LAYER_ORDER.map(() => [])
  const seen = new Set<string>()
  const visit = (path: string) => {
    if (seen.has(path)) {
      return
    }
    seen.add(path)
    bands[LAYER_ORDER.indexOf(layerOf.get(path) ?? 'primitives')]?.push(path)
    for (const next of [...(up.get(path) ?? []), ...(down.get(path) ?? [])]) {
      visit(next)
    }
  }
  for (const node of nodes) {
    if (node.layer === 'primitives') {
      visit(node.path)
    }
  }
  for (const node of nodes) {
    visit(node.path)
  }
  return bands
}

const crossingsBetween = (
  first: readonly number[],
  second: readonly number[]
) => {
  let count = 0
  for (const a of first) {
    for (const b of second) {
      if (a > b) {
        count += 1
      }
    }
  }
  return count
}

/** Barycenter sweeps with adjacent swaps, keeping the best order seen. */
export function orderBands(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[]
): readonly (readonly string[])[] {
  const { up, down } = adjacency(nodes, edges)
  const typeOf = new Map(nodes.map(node => [node.path, node.type]))
  const typeRank = (path: string) =>
    TYPE_ORDER.indexOf(typeOf.get(path) as (typeof TYPE_ORDER)[number])
  const bySlab = (band: readonly string[]) =>
    [...band].sort((a, b) => typeRank(a) - typeRank(b))

  const order: Bands = seedBands(nodes, up, down).map(bySlab)

  const slots = (band: readonly string[]) =>
    new Map(band.map((path, slot) => [path, slot]))

  const reorder = (
    layer: number,
    against: number,
    neighbors: ReadonlyMap<string, readonly string[]>,
    reverseTies: boolean
  ) => {
    const fixed = slots(order[against] ?? [])
    const band = order[layer] ?? []
    const keyed = band.map((path, slot) => {
      const near = (neighbors.get(path) ?? [])
        .map(other => fixed.get(other))
        .filter(value => value !== undefined)
      return {
        path,
        slot,
        key:
          near.length === 0
            ? null
            : near.reduce((sum, value) => sum + value, 0) / near.length,
      }
    })
    const movable = keyed
      .filter(item => item.key !== null)
      .sort(
        (a, b) =>
          (a.key ?? 0) - (b.key ?? 0) ||
          (reverseTies ? b.slot - a.slot : a.slot - b.slot)
      )
    let next = 0
    order[layer] = bySlab(
      keyed.map(item =>
        item.key === null ? item.path : (movable[next++]?.path ?? item.path)
      )
    )
  }

  const transpose = () => {
    for (let pass = 0; pass < MAX_TRANSPOSE_PASSES; pass += 1) {
      let improved = false
      order.forEach((band, layer) => {
        const above = layer > 0 ? slots(order[layer - 1] ?? []) : null
        const below =
          layer < order.length - 1 ? slots(order[layer + 1] ?? []) : null
        const ranks = (
          path: string,
          links: ReadonlyMap<string, readonly string[]>,
          map: ReadonlyMap<string, number> | null
        ) =>
          map === null
            ? []
            : (links.get(path) ?? [])
                .map(other => map.get(other))
                .filter(value => value !== undefined)
        for (let slot = 0; slot + 1 < band.length; slot += 1) {
          const u = band[slot]
          const v = band[slot + 1]
          if (u === undefined || v === undefined) {
            continue
          }
          if (typeOf.get(u) !== typeOf.get(v)) {
            continue
          }
          const stay =
            crossingsBetween(ranks(u, up, above), ranks(v, up, above)) +
            crossingsBetween(ranks(u, down, below), ranks(v, down, below))
          const swap =
            crossingsBetween(ranks(v, up, above), ranks(u, up, above)) +
            crossingsBetween(ranks(v, down, below), ranks(u, down, below))
          if (swap < stay) {
            band[slot] = v
            band[slot + 1] = u
            improved = true
          }
        }
      })
      if (!improved) {
        return
      }
    }
  }

  const copy = () => order.map(band => [...band])
  let best = copy()
  let fewest = countCrossings(order, edges)
  let quiet = 0
  for (let sweep = 0; sweep < MAX_SWEEPS && quiet < QUIET_SWEEPS; sweep += 1) {
    const reverseTies = sweep % 4 >= 2
    if (sweep % 2 === 0) {
      reorder(1, 0, up, reverseTies)
      reorder(2, 1, up, reverseTies)
    } else {
      reorder(1, 2, down, reverseTies)
      reorder(0, 1, down, reverseTies)
    }
    transpose()
    const crossings = countCrossings(order, edges)
    if (crossings < fewest) {
      fewest = crossings
      best = copy()
      quiet = 0
    } else {
      if (crossings === fewest) {
        best = copy()
      }
      quiet += 1
    }
  }
  return best
}

export interface GraphFrame {
  readonly width: number
  readonly margin: number
  /** Extra room before the first slab, for the band captions. */
  readonly marginStart?: number
  readonly slabGap: number
  readonly bandY: Readonly<Record<GraphLayer, number>>
}

export interface Placed {
  readonly x: number
  readonly y: number
}

export interface Slab {
  readonly type: string
  readonly from: number
  readonly to: number
}

/** Spreads each band at even spacing inside each type's slab. */
export function placeBands(
  nodes: readonly LayoutNode[],
  bands: readonly (readonly string[])[],
  frame: GraphFrame
): {
  readonly positions: ReadonlyMap<string, Placed>
  readonly slabs: readonly Slab[]
} {
  const typeOf = new Map(nodes.map(node => [node.path, node.type]))
  const members = (band: readonly string[], type: string) =>
    band.filter(path => typeOf.get(path) === type)
  const units = TYPE_ORDER.map(type =>
    Math.max(...bands.map(band => members(band, type).length))
  )
  const total = units.reduce((sum, value) => sum + value, 0)
  const start = frame.marginStart ?? frame.margin
  const pitch =
    (frame.width -
      start -
      frame.margin -
      frame.slabGap * (TYPE_ORDER.length - 1)) /
    total

  const slabs: Slab[] = []
  let cursor = start
  TYPE_ORDER.forEach((type, index) => {
    const width = (units[index] ?? 0) * pitch
    slabs.push({ type, from: cursor, to: cursor + width })
    cursor += width + frame.slabGap
  })

  const positions = new Map<string, Placed>()
  bands.forEach((band, layerIndex) => {
    const layer = LAYER_ORDER[layerIndex]
    const y = layer === undefined ? 0 : frame.bandY[layer]
    for (const slab of slabs) {
      const inSlab = members(band, slab.type)
      inSlab.forEach((path, slot) => {
        const x =
          inSlab.length === 1
            ? (slab.from + slab.to) / 2
            : slab.from +
              pitch / 2 +
              (slot / (inSlab.length - 1)) * (slab.to - slab.from - pitch)
        positions.set(path, { x, y })
      })
    }
  })
  return { positions, slabs }
}

export interface Ribbon {
  readonly rootBase: number
  readonly rootGain: number
  readonly tipRatio: number
  readonly opacity: number
  readonly opacityFloor: number
  readonly fade: number
}

/** The ribbon weights the hero graph and the social card share: a root that
 * grows with reach, a thin tip, and a rest opacity that fades with the run. */
export const RIBBON: Ribbon = {
  rootBase: 2.6,
  rootGain: 1.4,
  tipRatio: 0.32,
  opacity: 0.72,
  opacityFloor: 0.2,
  fade: 460,
}

const px = (value: string) => {
  const amount = Number.parseFloat(value)
  return value.endsWith('rem') ? amount * 16 : amount
}

/** A duration or dimension draws as a bar sized by its value, so the hero and
 * the social card agree on every bar. */
export function barSize(
  type: 'duration' | 'dimension',
  value: string
): { readonly width: number; readonly height: number; readonly rx: number } {
  if (type === 'duration') {
    return { width: Math.max(3, px(value) / 36), height: 4, rx: 2 }
  }
  return {
    width: Math.max(2, Math.min(11, Math.sqrt(px(value)) * 1.25)),
    height: 3,
    rx: 0,
  }
}

const CURVE = 0.62

const f = (value: number) => value.toFixed(1)

/** A closed ribbon from a wide root at the target to a thin tip at the reader, so
 * value reads as flowing upward with no arrowheads. */
export function ribbonPath(
  lower: Placed,
  upper: Placed,
  root: number,
  tip: number
): string {
  const rise = upper.y - lower.y
  const lowerControl = lower.y + rise * CURVE
  const upperControl = upper.y - rise * CURVE
  const a = lower.x - root / 2
  const b = lower.x + root / 2
  const c = upper.x - tip / 2
  const d = upper.x + tip / 2
  return `M${f(a)} ${f(lower.y)}C${f(a)} ${f(lowerControl)} ${f(c)} ${f(upperControl)} ${f(c)} ${f(upper.y)}L${f(d)} ${f(upper.y)}C${f(d)} ${f(upperControl)} ${f(b)} ${f(lowerControl)} ${f(b)} ${f(lower.y)}Z`
}
