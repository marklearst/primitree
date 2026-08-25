'use client'

import type {
  DemoLayerId,
  GraphEdge,
  GraphNode,
  ProposalOutcome,
} from '@/lib/landing/governance-demo'

const VIEW_WIDTH = 1160
const VIEW_HEIGHT = 560
const NODE_WIDTH = 240
const NODE_HEIGHT = 42
const HIT_HEIGHT = 50
const GOVERNED_SLOT = 'semantic.color.bg.brand'

const COLUMNS: readonly {
  id: DemoLayerId
  x: number
  title: string
  rows: readonly number[]
}[] = [
  {
    id: 'primitives',
    x: 52,
    title: 'ROOTS · PRIMITIVES',
    rows: [88, 164, 240, 316, 392, 468],
  },
  {
    id: 'semantic',
    x: 460,
    title: 'TRUNK · SEMANTIC',
    rows: [108, 216, 324, 432],
  },
  {
    id: 'component',
    x: 868,
    title: 'CANOPY · COMPONENT',
    rows: [88, 182, 276, 370, 464],
  },
]

/** Hand-tuned turn positions for each reference wire, from the design file. */
const EDGE_MIDS = new Map([
  ['primitives.color.blue.500>semantic.color.bg.brand', 340],
  ['primitives.color.green.500>semantic.color.bg.brand', 340],
  ['primitives.color.gray.900>semantic.color.fg.default', 320],
  ['primitives.radius.md>semantic.radius.control', 360],
  ['primitives.space.4>semantic.space.inset', 300],
  ['semantic.color.bg.brand>component.button.bg', 760],
  ['semantic.color.bg.brand>component.focus.ring', 780],
  ['semantic.color.bg.brand>component.nav.active.bg', 800],
  ['semantic.radius.control>component.button.radius', 745],
  ['semantic.space.inset>component.card.inset', 820],
])

/** Hand-tuned bypass lanes for the layer-skipping violation wires, routing
 * around the semantic column the way the design file draws them. */
const VIOLATION_LANES = new Map([
  [
    'primitives.color.blue.500>component.button.bg',
    'M292 119 L373 119 Q380 119 380 126 L380 173 Q380 180 387 180 L835 180 Q842 180 842 173 L842 126 Q842 119 849 119 L868 119',
  ],
  [
    'primitives.color.green.500>component.focus.ring',
    'M292 175 L373 175 Q380 175 380 182 L380 186 Q380 193 387 193 L868 193',
  ],
  ['primitives.space.4>component.card.inset', 'M292 499 L868 495'],
])

const VIOLATION_TAG = { x: 556, y: 169, width: 110, height: 22 }

interface PlacedNode {
  readonly node: GraphNode
  readonly x: number
  readonly y: number
}

function placeNodes(nodes: readonly GraphNode[]): Map<string, PlacedNode> {
  const placed = new Map<string, PlacedNode>()
  for (const column of COLUMNS) {
    const members = nodes.filter(node => node.layer === column.id)
    members.forEach((node, rowIndex) => {
      const y = column.rows[rowIndex]
      if (y === undefined) {
        throw new Error(`Token graph has no row for ${node.path}.`)
      }
      placed.set(node.slot, { node, x: column.x, y })
    })
  }
  return placed
}

/** Orthogonal elbow with 7px-rounded corners, matching the design file. */
function orth(from: PlacedNode, to: PlacedNode, mid: number): string {
  const r = 7
  const startX = from.x + NODE_WIDTH
  const startY = from.y + NODE_HEIGHT / 2
  const endX = to.x
  const endY = to.y + NODE_HEIGHT / 2
  if (Math.abs(startY - endY) < 1) {
    return `M${startX} ${startY} L${endX} ${endY}`
  }
  const dy = endY > startY ? 1 : -1
  return (
    `M${startX} ${startY} L${mid - r} ${startY} ` +
    `Q${mid} ${startY} ${mid} ${startY + r * dy} L${mid} ${endY - r * dy} ` +
    `Q${mid} ${endY} ${mid + r} ${endY} L${endX} ${endY}`
  )
}

function edgePath(edge: GraphEdge, placed: Map<string, PlacedNode>): string {
  const key = `${edge.from}>${edge.to}`
  const lane = VIOLATION_LANES.get(key)
  if (edge.violation && lane !== undefined) {
    return lane
  }
  const from = placed.get(edge.from)
  const to = placed.get(edge.to)
  if (from === undefined || to === undefined) {
    throw new Error('Token graph expected both edge ends to have slots.')
  }
  const mid = EDGE_MIDS.get(key) ?? from.x + NODE_WIDTH + 84
  return orth(from, to, mid)
}

function chainOf(
  slot: string,
  edges: readonly GraphEdge[]
): ReadonlySet<string> {
  const chain = new Set([slot])
  let grew = true
  while (grew) {
    grew = false
    for (const edge of edges) {
      if (chain.has(edge.from) && !chain.has(edge.to)) {
        chain.add(edge.to)
        grew = true
      }
      if (chain.has(edge.to) && !chain.has(edge.from)) {
        chain.add(edge.from)
        grew = true
      }
    }
  }
  return chain
}

function isAchromatic(hex: string): boolean {
  const channels = hex
    .slice(1)
    .match(/.{2}/gu)
    ?.map(channel => Number.parseInt(channel, 16))
  if (channels === undefined || channels.length !== 3) {
    return false
  }
  return Math.max(...channels) - Math.min(...channels) < 30
}

function nodeSummary(node: GraphNode): string {
  const consumerCount =
    node.consumers === 1 ? '1 consumer' : `${node.consumers} consumers`
  return `${node.path} · ${node.kind} ${node.display} · owner ${node.owner} · ${consumerCount}`
}

export function TokenGraph({
  outcome,
  checking,
  traceSlot,
  selectedSlot,
  onTraceSlot,
  onSelectSlot,
}: {
  outcome: ProposalOutcome
  checking: boolean
  traceSlot: string | null
  selectedSlot: string | null
  onTraceSlot: (slot: string | null) => void
  onSelectSlot: (slot: string | null) => void
}) {
  const placed = placeNodes(outcome.nodes)
  const trace = traceSlot === null ? null : chainOf(traceSlot, outcome.edges)
  const governed = chainOf(GOVERNED_SLOT, outcome.edges)
  const hasViolations = outcome.edges.some(edge => edge.violation)
  const violationCount = outcome.edges.filter(edge => edge.violation).length
  const violationSlots = new Set(
    outcome.edges
      .filter(edge => edge.violation)
      .flatMap(edge => [edge.from, edge.to])
  )
  const traceTouchesViolation =
    trace !== null && [...violationSlots].some(slot => trace.has(slot))

  return (
    // biome-ignore lint/a11y/useSemanticElements: an SVG cannot become a fieldset; role=group names the graph for assistive technology.
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      className='graph-svg'
      role='group'
      aria-label={`Token graph for the ${outcome.label} proposal`}>
      {COLUMNS.map(column => (
        <g key={column.id}>
          <text
            x={column.x}
            y={52}
            className='graph-column-title'>
            {column.title}
          </text>
          <line
            x1={column.x}
            y1={64}
            x2={column.x + NODE_WIDTH}
            y2={64}
            className='graph-column-rule'
          />
        </g>
      ))}
      <g key={`edges-${outcome.id}`}>
        {outcome.edges.map(edge => {
          const inTrace =
            trace !== null && trace.has(edge.from) && trace.has(edge.to)
          const inGoverned = governed.has(edge.from) && governed.has(edge.to)
          const tone = edge.violation
            ? 'violation'
            : inTrace
              ? 'active'
              : trace === null && inGoverned
                ? hasViolations
                  ? 'suppressed'
                  : 'governed'
                : 'base'
          const dim = trace !== null && !inTrace
          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={edgePath(edge, placed)}
              className='graph-edge'
              data-tone={tone}
              data-active={(edge.violation && inTrace) || undefined}
              data-static={(hasViolations && tone === 'active') || undefined}
              data-dim={dim || undefined}
            />
          )
        })}
      </g>
      {hasViolations && !checking ? (
        <g
          className='graph-violation-tag'
          data-dim={
            trace !== null && !traceTouchesViolation ? true : undefined
          }>
          <rect
            x={VIOLATION_TAG.x}
            y={VIOLATION_TAG.y}
            width={VIOLATION_TAG.width}
            height={VIOLATION_TAG.height}
            rx={6}
          />
          <text
            x={VIOLATION_TAG.x + VIOLATION_TAG.width / 2}
            y={VIOLATION_TAG.y + 15}
            textAnchor='middle'>
            {violationCount} × layer-skip
          </text>
        </g>
      ) : null}
      {[...placed.values()].map(({ node, x, y }) => {
        const inTrace = trace?.has(node.slot) ?? false
        const flag =
          node.finding !== null || violationSlots.has(node.slot)
            ? 'violation'
            : (node.change ?? undefined)
        const emphasis = inTrace
          ? 'chain'
          : node.slot === GOVERNED_SLOT && !hasViolations
            ? 'governed'
            : undefined
        const selected = selectedSlot === node.slot
        const textX = node.swatch === null ? x + 14 : x + 32
        return (
          // biome-ignore lint/a11y/useSemanticElements: HTML buttons cannot exist inside SVG; the node group carries role=button with full keyboard handling.
          <g
            key={node.slot}
            className='graph-node'
            role='button'
            tabIndex={0}
            aria-pressed={selected}
            aria-label={nodeSummary(node)}
            data-flag={flag}
            data-emphasis={emphasis}
            data-selected={selected || undefined}
            data-dim={(trace !== null && !inTrace) || undefined}
            onClick={() => onSelectSlot(selected ? null : node.slot)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelectSlot(selected ? null : node.slot)
              } else if (event.key === 'Escape') {
                onSelectSlot(null)
              }
            }}
            onMouseEnter={() => onTraceSlot(node.slot)}
            onMouseLeave={() => onTraceSlot(null)}
            onFocus={() => onTraceSlot(node.slot)}
            onBlur={() => onTraceSlot(null)}>
            <rect
              x={x}
              y={y - (HIT_HEIGHT - NODE_HEIGHT) / 2}
              width={NODE_WIDTH}
              height={HIT_HEIGHT}
              className='graph-node-hit'
            />
            <rect
              x={x}
              y={y}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              rx={8}
              className='graph-node-box'
            />
            {node.swatch === null ? null : (
              <rect
                x={x + 14}
                y={y + 9}
                width={10}
                height={10}
                rx={3}
                className='graph-node-swatch'
                data-outline={isAchromatic(node.swatch) || undefined}
                style={{ fill: node.swatch }}
              />
            )}
            <text
              x={textX}
              y={y + 19}
              className='graph-node-label'>
              {node.label}
            </text>
            <text
              x={textX}
              y={y + 34}
              className='graph-node-value'
              data-tone={node.finding === null ? undefined : 'violation'}>
              {node.display}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
