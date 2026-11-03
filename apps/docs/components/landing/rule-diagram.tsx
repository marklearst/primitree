import { ribbonPath } from '@/lib/tokens/graph-layout'
import { tokenVar } from '@/lib/tokens/site-graph'
import type { BreakId } from '@/lib/tokens/page-store'
import type { TokenPath } from '@/tokens/generated/token-path'

/* One rule, drawn in the hero graph's grammar: three bands, ribbons that take
   the value of what they read. The broken state sits beside the passing one, and
   the root's data-breaks attribute decides which shows, so the drawing changes on
   the same switch that edits the real tokens. */

const X = 18
const BANDS = { component: 18, semantic: 68, primitives: 118 } as const

interface DiagramCopy {
  readonly component: string
  readonly semantic: string
  readonly primitive: string
  readonly color: TokenPath
  readonly note: string
}

const copy: Readonly<Record<BreakId, DiagramCopy>> = {
  literal: {
    component: 'button.primary.background',
    semantic: 'accent.solid',
    primitive: 'brand.45',
    color: 'component.button.primary.background',
    note: 'holds a raw color',
  },
  skip: {
    component: 'link.text',
    semantic: 'accent.text',
    primitive: 'brand.45',
    color: 'component.link.text',
    note: 'skips the semantic layer',
  },
  stray: {
    component: 'link.text',
    semantic: 'accent.text',
    primitive: 'brand.45',
    color: 'component.link.text',
    note: 'brand.accent, in no layer',
  },
  owner: {
    component: 'button.radius',
    semantic: 'radius.control',
    primitive: 'radius.6',
    color: 'semantic.text.primary',
    note: 'no owner',
  },
}

function Ribbon({ y1, y2 }: { y1: number; y2: number }) {
  return <path d={ribbonPath({ x: X, y: y2 }, { x: X, y: y1 }, 6, 2.2)} />
}

function Dot({ y, fill }: { y: number; fill: string }) {
  return (
    <circle
      className='rule-dot'
      cx={X}
      cy={y}
      r={5.5}
      style={{ fill }}
    />
  )
}

export function RuleDiagram({ id }: { id: BreakId }) {
  const { component, semantic, primitive, color, note } = copy[id]
  const fill = tokenVar(color)
  const { component: top, semantic: middle, primitives: bottom } = BANDS

  return (
    <svg
      className='rule-diagram'
      data-rule={id}
      viewBox='0 0 280 136'
      role='img'
      aria-label={`${component} reads ${semantic}, which reads ${primitive}. Broken: ${note}.`}>
      <g
        className='rule-ribbons'
        style={{ fill }}>
        <g className='when-off'>
          <Ribbon
            y1={top}
            y2={middle}
          />
          <Ribbon
            y1={middle}
            y2={bottom}
          />
        </g>
        <g className='when-on'>
          {id === 'literal' ? (
            <>
              <Ribbon
                y1={top}
                y2={middle}
              />
              <path
                className='rule-ribbon-broken'
                d={`M${X} ${middle}V${bottom}`}
              />
            </>
          ) : null}
          {id === 'skip' ? (
            <>
              <path
                className='rule-ribbon-broken'
                d={`M${X} ${top}C${X - 26} ${top + 34} ${X - 26} ${bottom - 34} ${X} ${bottom}`}
              />
              <path
                className='rule-quiet'
                d={`M${X} ${middle}V${bottom}`}
              />
            </>
          ) : null}
          {id === 'stray' || id === 'owner' ? (
            <>
              <Ribbon
                y1={top}
                y2={middle}
              />
              <Ribbon
                y1={middle}
                y2={bottom}
              />
            </>
          ) : null}
        </g>
      </g>
      <Dot
        y={top}
        fill={fill}
      />
      <Dot
        y={middle}
        fill={fill}
      />
      <Dot
        y={bottom}
        fill={fill}
      />
      {id === 'literal' || id === 'owner' ? (
        <circle
          className='rule-ring when-on'
          cx={X}
          cy={id === 'literal' ? middle : top}
          r={10}
        />
      ) : null}
      {id === 'skip' ? (
        <circle
          className='rule-ring when-on'
          cx={X}
          cy={top}
          r={10}
        />
      ) : null}
      {id === 'stray' ? (
        <>
          <circle
            className='rule-dot rule-quiet'
            cx={X + 214}
            cy={middle}
            r={5.5}
            style={{ fill }}
          />
          <g className='when-on'>
            <circle
              className='rule-ring'
              cx={X + 214}
              cy={middle}
              r={10}
            />
            <circle
              className='rule-dot'
              cx={X + 214}
              cy={middle}
              r={5.5}
              style={{ fill }}
            />
          </g>
        </>
      ) : null}
      <text
        className='rule-label'
        x={X + 16}
        y={top + 4}>
        {component}
      </text>
      <text
        className='rule-label'
        x={X + 16}
        y={middle + 4}>
        {semantic}
      </text>
      <text
        className='rule-label'
        x={X + 16}
        y={bottom + 4}>
        {primitive}
      </text>
      {id === 'stray' ? (
        <text
          className='rule-label when-off'
          x={262}
          y={middle + 24}
          textAnchor='end'>
          brand.accent
        </text>
      ) : null}
      <text
        className='rule-note when-on'
        x={id === 'stray' ? 262 : X + 16}
        y={
          id === 'stray'
            ? middle + 24
            : id === 'literal'
              ? middle + 20
              : top + 20
        }
        textAnchor={id === 'stray' ? 'end' : 'start'}>
        {note}
      </text>
    </svg>
  )
}
