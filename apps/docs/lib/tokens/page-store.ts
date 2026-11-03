'use client'

import { useSyncExternalStore } from 'react'
import {
  contrast,
  cssColor,
  type SignalName,
  signalCollisions,
  ratioClause,
  ratioText,
  type SolvedColor,
  type SolvedPrimitives,
  type SolverTuning,
  solvePrimitives,
  underInk,
} from './solver'
import themeConfig from '../../tokens/theme.config.json' with { type: 'json' }
import { siteTuning } from './signal-zones'
import { cssVarOf } from './site-graph-names'
import { HUE_KEY, STORAGE_KEY } from './theme-script'

/* The page's live theme state. Everything visual follows from the custom
   properties set here on <html>: the var() chain that emitCss wrote does the
   rest. A turn of the dial writes the primitives, and the three semantic aliases
   the ink arc reroutes. */

export const BRAND_HUE = themeConfig.hue

let tuning: SolverTuning = siteTuning

let solvedFor: {
  readonly hue: number
  readonly tuning: SolverTuning
  readonly value: SolvedPrimitives
} | null = null

/* One hue solves once per frame: the overrides, the readouts, the solid and
   the stored theme all read the same primitives. retune swaps the tuning
   object, so identity invalidates the entry. */
function solve(hue: number): SolvedPrimitives {
  if (
    solvedFor !== null &&
    solvedFor.hue === hue &&
    solvedFor.tuning === tuning
  ) {
    return solvedFor.value
  }
  const value = solvePrimitives(hue, tuning)
  solvedFor = { hue, tuning, value }
  return value
}

/** Changes the solver's taste knobs, for the theme lab. */
export function retune(next: SolverTuning) {
  tuning = next
  commitHue(state.hue, false)
}

export type BreakId = 'literal' | 'skip' | 'stray' | 'owner'

export interface Finding {
  readonly ruleId: string
  readonly path: string
  readonly message: string
  readonly owners: readonly string[]
}

type IslandTone = 'plain' | 'accent' | 'warn' | 'fail'

interface IslandMessage {
  readonly text: string
  readonly tone: IslandTone
}

interface Readouts {
  readonly label: number
  readonly link: number
  readonly labelTone: 'White' | 'Dark'
  readonly collisions: readonly SignalName[]
}

interface PageState {
  readonly hue: number
  readonly breaks: ReadonlySet<BreakId>
  readonly findings: readonly Finding[]
  readonly checking: boolean
  readonly island: IslandMessage
  readonly readouts: Readouts
  /** The color the brand solid paints right now. */
  readonly solidHex: string
  /** Painted until the page mounts, so a dark first paint shows dark numbers. */
  readonly darkReadouts: Readouts
  readonly mounted: boolean
}

/* At rest the Island states the result of the last check: the one recorded at
   build until a switch runs one in this tab. */
const restMessage = (findings: readonly Finding[]): IslandMessage =>
  findings.length === 0
    ? { text: '0 findings, exit 0', tone: 'plain' }
    : { text: 'primitree check, exit 1', tone: 'fail' }

function currentTheme(): 'light' | 'dark' {
  return typeof document !== 'undefined' &&
    document.documentElement.dataset.theme === 'dark'
    ? 'dark'
    : 'light'
}

/** The color a hard-coded accent stayed on, so the readouts state what it costs
 * and the override paints it. */
let frozen: SolvedColor | null = null

function measure(
  hue: number,
  breaks: ReadonlySet<BreakId>,
  theme: 'light' | 'dark' = currentTheme()
): Readouts {
  const solved = solve(hue)
  const ink = underInk(hue)
  const { brand, neutral } = solved
  const solidStep = solidStepFor(ink, theme)
  const labelStep = ink ? '8' : theme === 'dark' ? '4' : '100'
  const pageStep = theme === 'dark' ? '4' : '100'
  const linkStep = breaks.has('skip') || theme === 'light' ? '45' : '72'
  const solid =
    breaks.has('literal') && frozen !== null ? frozen : stepOf(brand, solidStep)
  return {
    label: contrast(solid.hex, stepOf(neutral, labelStep).hex),
    link: contrast(stepOf(brand, linkStep).hex, stepOf(neutral, pageStep).hex),
    labelTone: ink || theme === 'dark' ? 'Dark' : 'White',
    collisions: signalCollisions(solved, theme),
  }
}

const solidStepFor = (ink: boolean, theme: 'light' | 'dark') =>
  ink ? '85' : theme === 'dark' ? '72' : '45'

function stepOf(
  family: Readonly<Record<string, SolvedColor>>,
  step: string
): SolvedColor {
  const color = family[step]
  if (color === undefined) {
    throw new Error(`The solver wrote no step ${step}.`)
  }
  return color
}

function currentSolidHex(hue: number, theme: 'light' | 'dark'): string {
  return (
    frozen?.hex ??
    stepOf(solve(hue).brand, solidStepFor(underInk(hue), theme)).hex
  )
}

/** What the server rendered, in the light theme the token file defaults to. */
const initialState: PageState = {
  hue: BRAND_HUE,
  breaks: new Set(),
  findings: [],
  checking: false,
  island: restMessage([]),
  readouts: measure(BRAND_HUE, new Set(), 'light'),
  solidHex: currentSolidHex(BRAND_HUE, 'light'),
  darkReadouts: measure(BRAND_HUE, new Set(), 'dark'),
  mounted: false,
}

let state = initialState

const waveHandlers = new Set<() => void>()
const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) {
    listener()
  }
}

export const pageStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

/** Reads one slice of the store, so a turn of the dial re-renders what shows
 * the hue and nothing else. */
export function usePageState<Slice>(
  select: (state: PageState) => Slice
): Slice {
  return useSyncExternalStore(
    pageStore.subscribe,
    () => select(state),
    () => select(initialState)
  )
}

function update(next: Partial<PageState>) {
  const merged = { ...state, ...next }
  state = {
    ...merged,
    solidHex: currentSolidHex(merged.hue, currentTheme()),
  }
  notify()
}

/* ---------- writing the theme ---------- */

/** The custom properties a hue writes: the solved primitives, plus the three
 * semantic aliases the ink arc reroutes. */
function overridesFor(
  hue: number,
  ink: boolean,
  breaks: ReadonlySet<BreakId>,
  frozen: SolvedColor | null
): ReadonlyMap<string, string> {
  const solved = solve(hue)
  const overrides = new Map<string, string>()
  for (const family of ['neutral', 'brand'] as const) {
    for (const [step, color] of Object.entries(solved[family])) {
      overrides.set(`--primitives-color-${family}-${step}`, cssColor(color))
    }
  }
  if (ink) {
    overrides.set(
      cssVarOf('semantic.accent.solid'),
      'var(--primitives-color-brand-85)'
    )
    overrides.set(
      cssVarOf('semantic.accent.solidHover'),
      'var(--primitives-color-brand-72)'
    )
    overrides.set(
      cssVarOf('semantic.text.onAccent'),
      'var(--primitives-color-neutral-8)'
    )
  }
  if (breaks.has('literal') && frozen !== null) {
    overrides.set(cssVarOf('semantic.accent.solid'), cssColor(frozen))
  }
  if (breaks.has('skip')) {
    overrides.set(
      cssVarOf('component.link.text'),
      'var(--primitives-color-brand-45)'
    )
  }
  return overrides
}

let written: ReadonlyMap<string, string> = new Map()

/** The semantic names the replay script writes, so a mount strips those and
 * leaves other inline properties alone. */
const owned = new Set([
  cssVarOf('semantic.accent.solid'),
  cssVarOf('semantic.accent.solidHover'),
  cssVarOf('semantic.text.onAccent'),
])

function writeOverrides(overrides: ReadonlyMap<string, string>) {
  const { style } = document.documentElement
  for (const name of written.keys()) {
    if (!overrides.has(name)) {
      style.removeProperty(name)
    }
  }
  for (const [name, value] of overrides) {
    style.setProperty(name, value)
  }
  written = overrides
}

/** Keeps a chosen hue across the session, including the docs pages. The
 * pre-paint script in the layout replays this list, so no page flashes green. */
function persist() {
  try {
    if (state.hue === BRAND_HUE) {
      sessionStorage.removeItem(STORAGE_KEY)
      sessionStorage.removeItem(HUE_KEY)
    } else {
      // The hue alone: a broken rule is a demo, and never outlives this page.
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...overridesFor(state.hue, inkRoute, new Set(), null)])
      )
      sessionStorage.setItem(HUE_KEY, String(state.hue))
    }
  } catch {
    // Private windows may refuse storage; the theme still applies to this page.
  }
}

/** Runs once on the client: restates the readouts for the real theme, and picks
 * up a hue the pre-paint script already replayed. It accepts the shape persist()
 * writes and nothing else, and stale inline properties from an edited store or
 * an older build come off the root. */
export function mountPage() {
  let hue = BRAND_HUE
  try {
    const stored = sessionStorage.getItem(HUE_KEY)
    if (stored !== null && /^\d+$/u.test(stored) && Number(stored) < 360) {
      hue = Number(stored)
    }
  } catch {
    // Storage may be blocked; the page keeps the brand hue.
  }
  inkRoute = underInk(hue)
  // At the brand hue the stylesheet supplies every value, so the root carries
  // none. A press that lands ahead of this effect keeps its break.
  const overrides =
    hue === BRAND_HUE && state.breaks.size === 0
      ? new Map<string, string>()
      : overridesFor(hue, inkRoute, state.breaks, frozen)
  const { style } = document.documentElement
  for (const name of [...style]) {
    if (
      (name.startsWith('--primitives-color-') || owned.has(name)) &&
      !overrides.has(name)
    ) {
      style.removeProperty(name)
    }
  }
  writeOverrides(overrides)
  if (hue === BRAND_HUE) {
    style.removeProperty('--page-hue')
  } else {
    style.setProperty('--page-hue', String(hue))
  }
  delete document.documentElement.dataset.hue
  document.documentElement.dataset.mounted = ''
  update({
    hue,
    mounted: true,
    readouts: measure(hue, state.breaks),
  })
}

/** What the dial and the rule switches have changed about a token right now: a
 * rerouted alias, or a raw value in place of one. The graph follows this, so its
 * chain and value state what the page paints. */
export function tokenOverride(
  path: string
): { readonly target: string | null; readonly hex: string | null } | null {
  if (path === 'semantic.accent.solid' && state.breaks.has('literal')) {
    return { target: null, hex: frozen === null ? null : frozen.hex }
  }
  if (path === 'component.link.text' && state.breaks.has('skip')) {
    return { target: 'primitives.color.brand.45', hex: null }
  }
  if (inkRoute) {
    const rerouted: Readonly<Record<string, string>> = {
      'semantic.accent.solid': 'primitives.color.brand.85',
      'semantic.accent.solidHover': 'primitives.color.brand.72',
      'semantic.text.onAccent': 'primitives.color.neutral.8',
    }
    const target = rerouted[path]
    return target === undefined ? null : { target, hex: null }
  }
  return null
}

/** A color primitive's value at the current hue, as hex. */
export function solvedHex(path: string): string | null {
  const [, , family, step] = path.split('.')
  const solved = solve(state.hue)
  const color =
    family === undefined || step === undefined
      ? undefined
      : solved[family as keyof typeof solved]?.[step]
  return color?.hex ?? null
}

/* ---------- the dial ---------- */

let pendingHue: number | null = null
let frame = 0
let inkRoute = false
let settleTimer: ReturnType<typeof setTimeout> | null = null
/** How long the dial rests before the wave runs and the status region speaks. */
export const SETTLE_MS = 400
const SLOW_FRAME_MS = 20
const SLOW_FRAME_LIMIT = 3

const normalizeHue = (hue: number) => ((Math.round(hue) % 360) + 360) % 360

export const liveHue = () => pendingHue ?? state.hue

/** Brackets a retheme write, so the hero button takes the wave's timing while
 * its hover keeps its own: the marker commits with one style flush and comes
 * off in the same tick, and a transition keeps the timing it started with. A
 * moving dial cuts every color, the button included, so it writes bare. */
function settling(write: () => void) {
  const root = document.documentElement
  if ('dragging' in root.dataset) {
    write()
    return
  }
  root.dataset.settling = ''
  write()
  root.getBoundingClientRect()
  delete root.dataset.settling
}

/** While a dial moves, every color cuts straight to its new value: a transition
 * delay longer than a frame would hold the page still for the whole drag. The
 * wave runs once, after the dial rests. */
function holdTransitions(kind: '' | 'jump' = '') {
  document.documentElement.dataset.dragging = kind
  if (settleTimer !== null) {
    clearTimeout(settleTimer)
  }
  settleTimer = setTimeout(settle, SETTLE_MS)
}

function settle() {
  settleTimer = null
  delete document.documentElement.dataset.dragging
  commitHue(state.hue, false)
  for (const handler of waveHandlers) {
    handler()
  }
}

/** Sets the hue from a moving control: a drag or a held key. */
export function moveHue(hue: number) {
  holdTransitions()
  pendingHue = normalizeHue(hue)
  if (frame !== 0) {
    return
  }
  frame = requestAnimationFrame(() => {
    frame = 0
    const next = pendingHue
    pendingHue = null
    if (next !== null) {
      commitHue(next, true)
    }
  })
}

/** Jumps to a hue, so the page recolors along the wave. A solid and its label
 * cut together when the jump crosses the ink arc: fading them across each other
 * would pass through unreadable. */
export function jumpHue(hue: number) {
  const next = normalizeHue(hue)
  if (underInk(next) !== underInk(state.hue)) {
    holdTransitions('jump')
    commitHue(next, false)
    return
  }
  commitHue(next, false)
  for (const handler of waveHandlers) {
    handler()
  }
}

/* A slow device writes tokens every second frame and keeps the knob on every
   frame, so the dial stays under the finger. */
let lastCommit = 0
let slowFrames = 0
let skipped = false

function shouldWrite(moving: boolean): boolean {
  const now = performance.now()
  slowFrames = moving && now - lastCommit > SLOW_FRAME_MS ? slowFrames + 1 : 0
  lastCommit = now
  if (!moving || slowFrames < SLOW_FRAME_LIMIT || skipped) {
    skipped = false
    return true
  }
  skipped = true
  return false
}

function commitHue(hue: number, moving: boolean) {
  const previousTone = state.readouts.labelTone
  inkRoute = underInk(hue, moving && inkRoute)
  if (shouldWrite(moving)) {
    settling(() => {
      writeOverrides(overridesFor(hue, inkRoute, state.breaks, frozen))
    })
  }
  // The knob turns from this, outside the gate, so it stays under the finger.
  document.documentElement.style.setProperty('--page-hue', String(hue))
  const readouts = measure(hue, state.breaks)
  update({ hue, readouts, island: hueMessage(hue, readouts, previousTone) })
  persist()
}

function hueMessage(
  hue: number,
  readouts: Readouts,
  previousTone: Readouts['labelTone']
): IslandMessage {
  if (state.breaks.has('literal')) {
    return { text: `Hue ${hue}, and the button stayed behind`, tone: 'fail' }
  }
  if (readouts.labelTone !== previousTone) {
    return {
      text: `Label switched to ${readouts.labelTone.toLowerCase()} to hold AA`,
      tone: 'accent',
    }
  }
  const [collision] = readouts.collisions
  if (collision !== undefined) {
    return {
      text: `Hue ${hue}, too close to ${collision}`,
      tone: collision === 'fail' ? 'fail' : 'warn',
    }
  }
  return {
    text: `Hue ${hue}, label ${ratioText(readouts.label)}:1 AA`,
    tone: 'accent',
  }
}

/** Runs when a hue lands, for the graph's causal wave. */
export function onHueCommit(handler: () => void) {
  waveHandlers.add(handler)
  return () => {
    waveHandlers.delete(handler)
  }
}

/** Restates the readouts after the theme flips. A hard-coded accent pays for
 * the flip in label contrast, and the Island states that cost when it moves.
 * Words the dial wrote carry the old theme's numbers, so they restate too. */
export function refreshReadouts() {
  const readouts = measure(state.hue, state.breaks)
  const flipped =
    state.breaks.has('literal') && readouts.label !== state.readouts.label
  update({
    readouts,
    island: flipped
      ? {
          text: `Label ${ratioClause(readouts.label)}: the button stayed behind`,
          tone: 'fail',
        }
      : /^(Hue |Label switched)/u.test(state.island.text)
        ? hueMessage(state.hue, readouts, readouts.labelTone)
        : state.island,
  })
}

export function resetIsland() {
  update({ island: restMessage(state.findings) })
}

export function sayOnIsland(text: string, tone: IslandTone) {
  update({ island: { text, tone } })
}

/* ---------- breaking a rule ---------- */

export function setBreak(id: BreakId, on: boolean) {
  const breaks = new Set(state.breaks)
  if (on) {
    breaks.add(id)
  } else {
    breaks.delete(id)
  }
  if (id === 'literal') {
    frozen = on
      ? stepOf(solve(state.hue).brand, solidStepFor(inkRoute, currentTheme()))
      : null
  }
  settling(() => {
    document.documentElement.dataset.breaks = [...breaks].join(' ')
    writeOverrides(overridesFor(state.hue, inkRoute, breaks, frozen))
  })
  update({
    breaks,
    checking: true,
    readouts: measure(state.hue, breaks),
  })
  void runCheck(breaks)
}

/** Takes every break with it, for a page that unmounts. */
export function clearBreaks() {
  for (const id of state.breaks) {
    setBreak(id, false)
  }
}

let checkRun = 0

/** Runs the real policy from @primitree/core in this tab, on the token document
 * this page ships, with the same edit the break describes. */
async function runCheck(breaks: ReadonlySet<BreakId>) {
  checkRun += 1
  const run = checkRun
  const loaded = await import('./page-check').catch(() => null)
  if (loaded === null) {
    if (run === checkRun) {
      update({
        checking: false,
        island: {
          text: 'The check did not load. Reload the page to run it.',
          tone: 'warn',
        },
      })
    }
    return
  }
  const findings = await loaded.checkWithBreaks(breaks, currentTheme())
  if (run !== checkRun) {
    return
  }
  const first = findings[0]
  update({
    findings,
    checking: false,
    island:
      first === undefined
        ? { text: 'Rule restored, exit 0', tone: 'plain' }
        : {
            text: `${first.ruleId} ${first.path}${
              findings.length > 1 ? `, and ${findings.length - 1} more` : ''
            }`,
            tone: 'fail',
          },
  })
}
