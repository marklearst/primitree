'use client'

import type { CSSProperties } from 'react'
import {
  type GraphToken,
  NARROW_RIBBON,
  ribbonEdges,
  ribbonShape,
} from '@/lib/tokens/graph-edges'
import { NARROW_HEIGHT, NARROW_WIDTH } from '@/lib/tokens/graph-layout'
import { cssVarOf } from '@/lib/tokens/site-graph-names'

/* The graph on a phone: every token and every ribbon, drawn when a phone asks for
   it, so wide screens never carry a second copy. Too fine to aim at one dot, so a
   drag along a band scrubs through the tokens. */

export function NarrowGraph({
  tokens,
  positions,
}: {
  tokens: readonly GraphToken[]
  positions: readonly (readonly [number, number])[]
}) {
  const placed = new Map(
    tokens.map((token, index) => {
      const [x, y] = positions[index]
      return [token.p, { x: x * NARROW_WIDTH, y: y * NARROW_HEIGHT }]
    })
  )
  const positionOf = (path: string) => placed.get(path)
  const edges = ribbonEdges(tokens, positionOf, NARROW_RIBBON)
  const breakEdge = ribbonShape(
    tokens,
    positionOf,
    NARROW_RIBBON,
    'component.link.text',
    'primitives.color.brand.45'
  )

  return (
    <svg
      id='token-graph-narrow'
      className='graph-svg graph-svg-narrow'
      viewBox={`0 0 ${NARROW_WIDTH} ${NARROW_HEIGHT}`}
      aria-hidden='true'>
      {edges.map(edge => (
        <path
          key={`${edge.from}>${edge.to}`}
          className='graph-edge'
          data-from={edge.from}
          data-to={edge.to}
          data-layer={edge.layer}
          data-only={edge.only ?? undefined}
          pathLength={100}
          d={edge.d}
          style={
            {
              '--rest': edge.rest,
              ...(edge.color
                ? { '--edge-color': `var(${cssVarOf(edge.to)})` }
                : {}),
            } as CSSProperties
          }
        />
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
      {tokens.map(token => {
        const position = placed.get(token.p)
        return position === undefined ? null : (
          <g
            key={token.p}
            className='graph-node'
            data-path={token.p}
            data-layer={token.p.split('.')[0]}
            transform={`translate(${position.x.toFixed(1)} ${position.y.toFixed(1)})`}>
            {token.c ? (
              <circle
                className='node-swatch'
                r={2}
                style={{ fill: `var(${cssVarOf(token.p)})` }}
              />
            ) : (
              <rect
                className='node-bar'
                x={-1}
                y={-1}
                width={2}
                height={2}
              />
            )}
          </g>
        )
      })}
      <g
        className='graph-stray'
        transform='translate(351 5)'>
        <circle
          className='graph-stray-ring'
          r={6}
        />
        <circle
          className='node-swatch'
          r={3}
          style={{
            fill: `var(${cssVarOf('component.button.primary.background')})`,
          }}
        />
      </g>
    </svg>
  )
}
