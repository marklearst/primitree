import { ImageResponse } from 'next/og'
import { MARK_PATH } from '@/components/brand-logo'
import { homeSocialImage } from '@/lib/discovery'
import { ribbonEdges } from '@/lib/tokens/graph-edges'
import { barSize, type GraphFrame, RIBBON } from '@/lib/tokens/graph-layout'
import { siteTuning } from '@/lib/tokens/signal-zones'
import {
  graphTokens,
  placedIn,
  placeGraph,
  siteTokens,
} from '@/lib/tokens/site-graph'
import {
  type ColorFamily,
  hexOf,
  type SolvedColor,
  solvePrimitives,
} from '@/lib/tokens/solver'
import type { TokenPath } from '@/tokens/generated/token-path'
import themeConfig from '@/tokens/theme.config.json' with { type: 'json' }

export const alt = homeSocialImage.alt
export const size = homeSocialImage.size
export const contentType = homeSocialImage.contentType

/* The card draws what the homepage draws, at the shipped hue: the mark and the
   token graph, in the solver's own values. It carries no text, because the
   platform prints the title and description beside it in its own face. */

const FRAME: GraphFrame = {
  width: size.width,
  margin: 72,
  slabGap: 36,
  bandY: { component: 296, semantic: 426, primitives: 556 },
}
const MARK = { x: 72, y: 64, scale: 1.6 }
/* A ribbon toward the ends of a ramp clamps its lightness, as the hero does. */
const EDGE_LIGHT = 0.22
const EDGE_DARK = 0.68

export default function Image() {
  const solved = solvePrimitives(themeConfig.hue, siteTuning)
  const byPath = new Map(siteTokens.map(token => [token.path, token]))
  /** The color primitive a token resolves to in the light theme. */
  const colorOf = (path: TokenPath): SolvedColor | null => {
    let token = byPath.get(path)
    while (token !== undefined && token.target.light !== null) {
      token = byPath.get(token.target.light)
    }
    if (token === undefined || token.type !== 'color') {
      return null
    }
    const [, , family = '', step = ''] = token.path.split('.')
    return solved[family as ColorFamily]?.[step] ?? null
  }
  const paint = (path: TokenPath): string => {
    const color = colorOf(path)
    if (color === null) {
      throw new Error(`${path} resolves to no color.`)
    }
    return color.hex
  }
  const clamped = (color: SolvedColor) =>
    hexOf(Math.min(EDGE_DARK, Math.max(EDGE_LIGHT, color.L)), color.C, color.h)

  const { positions } = placeGraph(FRAME)
  const edgeInk = colorOf('component.graph.edge')
  const edges = ribbonEdges(
    graphTokens,
    path => positions.get(path),
    RIBBON
  ).filter(edge => edge.only !== 'dark')
  const nodeBorder = paint('component.graph.nodeBorder')
  const lit = paint('component.graph.lit')

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        background: paint('semantic.surface.page'),
      }}>
      {/* biome-ignore lint/a11y/noSvgWithoutTitle: Satori rasterizes this svg to a PNG; the description ships as og:image:alt */}
      <svg
        width={size.width}
        height={size.height}
        viewBox={`0 0 ${size.width} ${size.height}`}>
        <path
          d={MARK_PATH}
          fill={paint('primitives.color.brand.45')}
          transform={`translate(${MARK.x} ${MARK.y}) scale(${MARK.scale})`}
        />
        {edges.map(edge => {
          const color = edge.color ? colorOf(edge.to) : edgeInk
          return (
            <path
              key={`${edge.from}>${edge.to}`}
              d={edge.d}
              fill={
                color === null ? paint('component.graph.edge') : clamped(color)
              }
              fillOpacity={edge.rest}
            />
          )
        })}
        {siteTokens.map(token => {
          const { x, y } = placedIn(positions, token.path)
          const value = token.value.light
          if (token.type === 'color') {
            return (
              <circle
                key={token.path}
                cx={x.toFixed(1)}
                cy={y}
                r={token.layer === 'semantic' ? 4.5 : 5}
                fill={paint(token.path)}
                stroke={nodeBorder}
                strokeWidth={1}
              />
            )
          }
          if (token.type === 'duration' || token.type === 'dimension') {
            const bar = barSize(token.type, value)
            return (
              <rect
                key={token.path}
                x={(x - bar.width / 2).toFixed(1)}
                y={y - bar.height / 2}
                width={bar.width.toFixed(1)}
                height={bar.height}
                rx={bar.rx}
                fill={lit}
              />
            )
          }
          return (
            <rect
              key={token.path}
              x={(x - 3).toFixed(1)}
              y={y - 3}
              width={6}
              height={6}
              fill='none'
              stroke={lit}
              strokeWidth={1.2}
            />
          )
        })}
      </svg>
    </div>,
    size
  )
}
