import type { CSSProperties, ReactNode } from 'react'
import { reads } from '@/lib/tokens/bind'
import { ribbonEdges, ribbonShape } from '@/lib/tokens/graph-edges'
import {
  barSize,
  type GraphFrame,
  type GraphLayer,
  LAYER_ORDER,
  NARROW_HEIGHT,
  NARROW_WIDTH,
  RIBBON,
  type Ribbon,
} from '@/lib/tokens/graph-layout'
import { IDLE_CHAIN } from '@/lib/tokens/graph-copy'
import {
  graphTokens,
  layerCounts,
  placedIn,
  placeGraph,
  type SiteToken,
  siteTokens,
  tokenVar,
} from '@/lib/tokens/site-graph'
import { GraphEngine } from './graph-engine'

/* The site's own tokens as a graph. The server draws all of it, every color is
   the token's own custom property, and the dial recolors it through the var()
   chain with no script touching a node. */

interface Variant extends Ribbon {
  readonly frame: GraphFrame
  readonly height: number
}

const WIDE: Variant = {
  frame: {
    width: 1360,
    margin: 38,
    marginStart: 196,
    slabGap: 40,
    bandY: { component: 30, semantic: 150, primitives: 270 },
  },
  height: 304,
  ...RIBBON,
}

const NARROW_FRAME: GraphFrame = {
  width: NARROW_WIDTH,
  margin: 4,
  slabGap: 5,
  bandY: { component: 14, semantic: 154, primitives: 294 },
}

const LAYER_CAPTIONS: Readonly<
  Record<GraphLayer, { readonly name: string; readonly rule: string }>
> = {
  component: { name: 'Component tokens', rule: 'reference semantic tokens' },
  semantic: { name: 'Semantic tokens', rule: 'reference primitives' },
  primitives: { name: 'Primitives', rule: 'hold raw values' },
}

/** The narrowest slab cannot hold its type's full name. */
const SLAB_LABELS: Readonly<Record<string, string>> = { cubicBezier: 'bezier' }

const bezierPath = (value: string) => {
  const points =
    value
      .slice(value.indexOf('('))
      .match(/-?[\d.]+/gu)
      ?.map(Number) ?? []
  const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = points
  const at = (x: number, y: number) => `${x * 10 - 5} ${5 - y * 10}`
  return `M-5 5C${at(x1, y1)} ${at(x2, y2)} 5 -5`
}

/** Each type draws its own measurement: a color fills with its value, a length
 * sets the bar, a family sets itself. */
function Glyph({ token }: { token: SiteToken }): ReactNode {
  const value = token.value.light
  switch (token.type) {
    case 'color':
      return (
        <circle
          className='node-swatch'
          r={token.layer === 'semantic' ? 4.5 : 5}
          style={{ fill: tokenVar(token.path) }}
        />
      )
    case 'duration':
    case 'dimension': {
      const bar = barSize(token.type, value)
      return (
        <rect
          className='node-bar'
          x={-bar.width / 2}
          y={-bar.height / 2}
          width={bar.width}
          height={bar.height}
          rx={bar.rx}
        />
      )
    }
    case 'fontFamily':
      return (
        <text
          className='node-glyph'
          textAnchor='middle'
          y={3.5}
          style={{ fontFamily: tokenVar(token.path) }}>
          A
        </text>
      )
    case 'fontWeight':
      return (
        <text
          className='node-glyph'
          textAnchor='middle'
          y={3.5}
          style={{ fontWeight: tokenVar(token.path) }}>
          a
        </text>
      )
    case 'cubicBezier':
      return (
        <path
          className='node-curve'
          d={bezierPath(value)}
        />
      )
    default:
      return (
        <rect
          className='node-axis'
          x={-3}
          y={-3}
          width={6}
          height={6}
        />
      )
  }
}

function GraphSvg({ variant }: { variant: Variant }) {
  const { positions } = placeGraph(variant.frame)
  const { frame, height } = variant
  const placed = (path: string) => placedIn(positions, path)
  const positionOf = (path: string) => positions.get(path)
  const edges = ribbonEdges(graphTokens, positionOf, variant)
  const breakEdge = ribbonShape(
    graphTokens,
    positionOf,
    variant,
    'component.link.text',
    'primitives.color.brand.45'
  )

  return (
    // biome-ignore lint/a11y/useSemanticElements: an SVG cannot be a fieldset, and the group role names the drawing that holds the roving tab stop
    <svg
      id='token-graph-wide'
      className='graph-svg graph-svg-wide'
      viewBox={`0 0 ${frame.width} ${height}`}
      role='group'
      aria-label={`Token graph of this page: ${siteTokens.length} tokens in three layers. Use the arrow keys to move between tokens.`}>
      {siteTokens
        .filter(token => token.layer === 'component')
        .map(token => (
          <path
            key={token.path}
            className='graph-stub'
            data-from={token.path}
            pathLength={100}
            d={`M${placed(token.path).x.toFixed(1)} ${frame.bandY.component}V0`}
            style={
              token.type === 'color'
                ? { stroke: tokenVar(token.path) }
                : undefined
            }
          />
        ))}
      {(['semantic', 'component'] as const).map(layer => (
        <g
          key={layer}
          className='graph-ribbons'
          data-layer={layer}>
          {edges
            .filter(edge => edge.layer === layer)
            .map(edge => (
              <path
                key={`${edge.from}>${edge.to}`}
                className='graph-edge'
                data-from={edge.from}
                data-to={edge.to}
                data-layer={layer}
                data-only={edge.only ?? undefined}
                pathLength={100}
                d={edge.d}
                style={
                  {
                    '--rest': edge.rest,
                    ...(edge.color
                      ? { '--edge-color': tokenVar(edge.to) }
                      : {}),
                  } as CSSProperties
                }
              />
            ))}
        </g>
      ))}
      {breakEdge === null ? null : (
        <path
          className='graph-edge graph-break'
          data-break='skip'
          data-from='component.link.text'
          data-to='primitives.color.brand.45'
          pathLength={100}
          d={breakEdge.d}
        />
      )}
      {siteTokens.map(token => {
        const { x, y } = placed(token.path)
        return (
          // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: each node is a labeled image in a roving tab stop, which SVG has no native element for
          <g
            key={token.path}
            className='graph-node'
            data-path={token.path}
            data-layer={token.layer}
            tabIndex={-1}
            role='img'
            aria-label={`${token.path}, ${
              token.target.light === null
                ? 'a raw value'
                : `references ${token.target.light}`
            }`}
            transform={`translate(${x.toFixed(1)} ${y})`}>
            <Glyph token={token} />
          </g>
        )
      })}
      <g
        className='graph-stray'
        transform={`translate(${frame.width - frame.margin} ${Math.max(10, frame.bandY.component - 16)})`}>
        <circle
          className='graph-stray-ring'
          r={9}
        />
        <circle
          className='node-swatch'
          r={5}
          style={{ fill: tokenVar('component.button.primary.background') }}
        />
      </g>
    </svg>
  )
}

export function TokenGraph() {
  const counts = layerCounts()
  const wide = placeGraph(WIDE.frame)
  const narrow = placeGraph(NARROW_FRAME)
  const round = (value: number) => Math.round(value * 10000) / 10000
  const place = (
    graph: typeof wide,
    width: number,
    height: number
  ): readonly (readonly [number, number])[] =>
    siteTokens.map(token => {
      const position = placedIn(graph.positions, token.path)
      return [round(position.x / width), round(position.y / height)] as const
    })

  return (
    <figure
      className='graph'
      {...reads(
        'component.graph.edge',
        'component.graph.lit',
        'component.graph.nodeBorder',
        'component.graph.label'
      )}>
      <div className='graph-canvas'>
        <GraphSvg variant={WIDE} />
        <GraphEngine
          tokens={graphTokens}
          wide={place(wide, WIDE.frame.width, WIDE.height)}
          narrow={place(narrow, NARROW_WIDTH, NARROW_HEIGHT)}
        />
        {LAYER_ORDER.map(layer => (
          <p
            key={layer}
            className='graph-band'
            data-layer={layer}
            style={
              {
                '--band-wide': `${(WIDE.frame.bandY[layer] / WIDE.height) * 100}%`,
                '--band-narrow': `${(NARROW_FRAME.bandY[layer] / NARROW_HEIGHT) * 100}%`,
              } as CSSProperties
            }>
            <span className='graph-band-name'>
              {LAYER_CAPTIONS[layer].name}{' '}
              <span className='graph-band-count'>{counts[layer]}</span>
            </span>
            <span className='graph-band-rule'>
              {LAYER_CAPTIONS[layer].rule}
            </span>
          </p>
        ))}
        <p
          className='graph-tooltip'
          id='graph-tooltip'
          hidden
        />
      </div>
      <ol
        className='graph-types'
        aria-label='Token types, left to right'>
        {wide.slabs.map(slab => (
          <li
            key={slab.type}
            style={{
              left: `${(slab.from / WIDE.frame.width) * 100}%`,
              width: `${((slab.to - slab.from) / WIDE.frame.width) * 100}%`,
            }}>
            {SLAB_LABELS[slab.type] ?? slab.type}
          </li>
        ))}
      </ol>
      <figcaption className='graph-note'>
        <code
          className='graph-note-chain'
          id='graph-chain'
          data-idle=''>
          {IDLE_CHAIN}
        </code>
      </figcaption>
    </figure>
  )
}
