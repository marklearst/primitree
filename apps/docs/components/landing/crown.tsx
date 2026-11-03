'use client'

import { type CSSProperties, type PointerEvent, useEffect, useRef } from 'react'
import { bind, reads } from '@/lib/tokens/bind'
import {
  BRAND_HUE,
  clearBreaks,
  jumpHue,
  liveHue,
  moveHue,
  usePageState,
} from '@/lib/tokens/page-store'
import { ratioText } from '@/lib/tokens/solver'
import { useRuleBreak } from './rule-switch'

const CENTER = 100
const RADIUS = 80
const RING_WIDTH = 18
/** A press this close to the knob grabs it instead of jumping the hue. */
const KNOB_GRAB = 22
/** Inside this radius one pixel of travel turns too many degrees to control. */
const DEAD_ZONE = 20

/** Cuts the hub out of the pointer grip. A clip moves hit testing, where a mask
 * would not, so a touch on the hub scrolls the page. */
const GRIP_CLIP = (() => {
  const hub = Array.from({ length: 36 }, (_, index) => {
    const angle = (index / 36) * 2 * Math.PI
    const x = 50 + 28 * Math.cos(angle)
    const y = 50 + 28 * Math.sin(angle)
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`
  })
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${hub[0]}, ${hub.join(', ')})`
})()

const polar = (degrees: number, radius: number) => {
  const angle = ((degrees - 90) * Math.PI) / 180
  return [
    CENTER + radius * Math.cos(angle),
    CENTER + radius * Math.sin(angle),
  ] as const
}

const arc = (from: number, to: number, radius: number) => {
  const [x1, y1] = polar(from, radius)
  const [x2, y2] = polar(to, radius)
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

const presets = [
  { name: 'Greenshield', hue: BRAND_HUE },
  { name: 'Ultramarine', hue: 265 },
  { name: 'Citrus', hue: 110 },
  { name: 'Signal red', hue: 27 },
] as const

/** Floors the ratio, because rounding could print 4.496 as a pass. */
const verdict = (ratio: number) =>
  `${ratioText(ratio)}:1 ${ratio >= 4.5 ? 'AA' : 'fails AA'}`

const wrapDegrees = (degrees: number) => ((degrees + 540) % 360) - 180

/** The hue the knob points at before any script runs, for the CSS that turns it. */
const shippedHue = { '--dial-hue-shipped': String(BRAND_HUE) } as CSSProperties

/** The hue dial. Its ring is the solver's own output at each hue, passed in
 * from the server, so it paints with the page. A native range input carries the
 * keyboard and screen reader behavior; the ring is the pointer's surface. The
 * knob turns in CSS from the hue the pre-paint script replays, so a stored hue
 * shows on the first frame. */
export function Crown({
  ring,
  zones,
}: {
  ring: readonly string[]
  zones: readonly {
    readonly theme: 'light' | 'dark'
    readonly name: string
    readonly from: number
    readonly to: number
  }[]
}) {
  const hue = usePageState(state => state.hue)
  const readouts = usePageState(state => state.readouts)
  const darkReadouts = usePageState(state => state.darkReadouts)
  const mounted = usePageState(state => state.mounted)
  const literal = useRuleBreak('literal', false)
  const skip = useRuleBreak('skip', false)
  const dial = useRef<HTMLDivElement>(null)
  const drag = useRef<{
    centerX: number
    centerY: number
    angle: number
    hue: number
  } | null>(null)
  // Both themes print until the page mounts, so the first paint is right in either.
  const shown = (light: string, dark: string, failing: boolean) =>
    mounted ? (
      <dd data-fail={failing ? '' : undefined}>{light}</dd>
    ) : (
      <dd>
        <span className='for-light'>{light}</span>
        <span className='for-dark'>{dark}</span>
      </dd>
    )

  const scale = (box: DOMRect) => box.width / 200

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || dial.current === null) {
      return
    }
    const box = dial.current.getBoundingClientRect()
    const centerX = box.left + box.width / 2
    const centerY = box.top + box.height / 2
    const dx = event.clientX - centerX
    const dy = event.clientY - centerY
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI
    const [knobLeft, knobTop] = polar(liveHue(), RADIUS)
    const fromKnob = Math.hypot(
      event.clientX - (box.left + knobLeft * scale(box)),
      event.clientY - (box.top + knobTop * scale(box))
    )
    event.currentTarget.setPointerCapture(event.pointerId)
    const startHue = fromKnob <= KNOB_GRAB ? liveHue() : angle
    drag.current = { centerX, centerY, angle, hue: startHue }
    moveHue(startHue)
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (active === null || !event.isPrimary) {
      return
    }
    const dx = event.clientX - active.centerX
    const dy = event.clientY - active.centerY
    if (Math.hypot(dx, dy) < DEAD_ZONE) {
      return
    }
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI
    active.hue += wrapDegrees(angle - active.angle)
    active.angle = angle
    moveHue(active.hue)
  }

  const endDrag = () => {
    drag.current = null
  }

  // Leaving the page takes a hero break with it.
  useEffect(() => clearBreaks, [])

  return (
    <div className='crown'>
      <div
        ref={dial}
        className='crown-dial'
        style={shippedHue}
        {...reads(
          'component.crown.center',
          'component.crown.centerText',
          'component.crown.knob',
          'component.crown.knobBorder'
        )}>
        <input
          type='range'
          className='crown-input'
          min={0}
          max={359}
          step={1}
          value={hue}
          aria-label='Brand hue'
          aria-valuetext={`Hue ${hue}. ${readouts.labelTone} label, ${ratioText(readouts.label)} to 1.${
            readouts.collisions.length > 0
              ? ` Reads close to the ${readouts.collisions.join(' and ')} signal.`
              : ''
          }`}
          onChange={event => moveHue(Number(event.target.value))}
          onKeyDown={event => {
            if (event.shiftKey && event.key.startsWith('Arrow')) {
              event.preventDefault()
              const up = event.key === 'ArrowRight' || event.key === 'ArrowUp'
              moveHue(liveHue() + (up ? 15 : -15))
            }
          }}
        />
        <svg
          viewBox='0 0 200 200'
          aria-hidden='true'>
          <g>
            {ring.map((color, index) => (
              <path
                // biome-ignore lint/suspicious/noArrayIndexKey: the ring never reorders, and a segment's index is its hue
                key={index}
                d={arc(index * 5, index * 5 + 5.5, RADIUS)}
                stroke={color}
                strokeWidth={RING_WIDTH}
                fill='none'
              />
            ))}
          </g>
          <g>
            {zones.map(zone => (
              <path
                key={`${zone.theme}-${zone.name}-${zone.from}`}
                d={arc(zone.from, zone.to, 96)}
                className={`crown-zone crown-zone-${zone.name}`}
                data-theme={zone.theme}
                fill='none'
              />
            ))}
          </g>
          <circle
            className='crown-hub'
            cx={CENTER}
            cy={CENTER}
            r={50}
          />
          <text
            className='crown-value'
            x={CENTER}
            y={CENTER + 6}
            textAnchor='middle'>
            {hue}
          </text>
          <text
            className='crown-unit'
            x={CENTER}
            y={CENTER + 24}
            textAnchor='middle'>
            hue
          </text>
          <g className='crown-knob-arm'>
            <circle
              className='crown-knob'
              cx={CENTER}
              cy={CENTER - RADIUS}
              r={11}
            />
          </g>
        </svg>
        {/* The grip that takes the pointer. The hub stays outside it, so a touch
            that lands there can still scroll the page. */}
        <div
          className='crown-grip'
          aria-hidden='true'
          style={{ clipPath: GRIP_CLIP }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
        />
      </div>
      <div className='crown-controls'>
        <dl
          className='crown-readout'
          {...bind({ color: 'semantic.text.secondary' })}>
          <div>
            <dt>Button label</dt>
            {shown(
              verdict(readouts.label),
              verdict(darkReadouts.label),
              readouts.label < 4.5
            )}
          </div>
          <div>
            <dt>Link text</dt>
            {shown(
              verdict(readouts.link),
              verdict(darkReadouts.link),
              readouts.link < 4.5
            )}
          </div>
          <div>
            <dt>Label color</dt>
            {shown(readouts.labelTone, darkReadouts.labelTone, false)}
          </div>
          <div>
            <dt>Hue vs warn/fail</dt>
            <dd data-fail={readouts.collisions.length > 0 ? '' : undefined}>
              {readouts.collisions[0] === undefined
                ? 'Clear'
                : `Near ${readouts.collisions[0]}`}
            </dd>
          </div>
        </dl>
        <fieldset className='crown-row'>
          <legend className='sr-only'>Hue presets</legend>
          {presets.map(preset => (
            <button
              key={preset.name}
              type='button'
              className='crown-button'
              aria-pressed={hue === preset.hue}
              onClick={() => jumpHue(preset.hue)}>
              {preset.name}
            </button>
          ))}
        </fieldset>
        <div className='crown-row'>
          <button
            type='button'
            role='switch'
            className='crown-switch'
            aria-checked={literal.on}
            onClick={literal.toggle}>
            <span
              className='crown-track'
              aria-hidden='true'>
              <span className='crown-thumb' />
            </span>
            Hard-code the accent
          </button>
          <button
            type='button'
            role='switch'
            className='crown-switch'
            aria-checked={skip.on}
            onClick={skip.toggle}>
            <span
              className='crown-track'
              aria-hidden='true'>
              <span className='crown-thumb' />
            </span>
            Skip a layer
          </button>
        </div>
      </div>
    </div>
  )
}
