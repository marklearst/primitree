'use client'

import { useEffect, useSyncExternalStore } from 'react'
import {
  mountPage,
  onHueCommit,
  refreshReadouts,
  resetIsland,
  sayOnIsland,
  solvedHex,
  tokenOverride,
} from '@/lib/tokens/page-store'
import { IDLE_CHAIN, TOUCH_CHAIN } from '@/lib/tokens/graph-copy'
import type { GraphToken } from '@/lib/tokens/graph-edges'
import { cssVarOf } from '@/lib/tokens/site-graph-names'
import {
  ownersOf,
  siteOwnership,
  siteOwnershipWithoutDefault,
} from '@/lib/tokens/site-policy'
import { COMPILED_KEY } from '@/lib/tokens/theme-script'
import { NarrowGraph } from './narrow-graph'

const NARROW_QUERY = '(max-width: 719px)'

function subscribeNarrow(onChange: () => void) {
  const query = window.matchMedia(NARROW_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** A motion token's duration in milliseconds, as the stylesheet serves it. */
const durationOf = (name: string) => {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  const amount = Number.parseFloat(value)
  if (Number.isNaN(amount)) {
    return 0
  }
  return value.endsWith('ms') ? amount : amount * 1000
}

interface EngineToken extends GraphToken {
  /** The token's $description. */
  readonly n?: string
}

/** Connects the static graph to the page: pointing at a token outlines what it
 * reaches, pointing at an element lights what it reads, and a committed hue
 * sends the wave up the bands. It toggles classes on the server's SVG, so a drag
 * never touches React. A phone gets its own drawing from here. */
export function GraphEngine({
  tokens,
  wide,
  narrow,
}: {
  tokens: readonly EngineToken[]
  wide: readonly (readonly [number, number])[]
  narrow: readonly (readonly [number, number])[]
}) {
  const isNarrow = useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false
  )

  /* Its own effect: a phone flips isNarrow at hydration, and the graph's effect
     restarts on that without ending the compile. */
  useEffect(() => {
    const root = document.documentElement
    /* The compile: the first visit in a session watches the page assemble. */
    const timers: ReturnType<typeof setTimeout>[] = []
    const STAGES = ['show-primitives', 'show-semantic', 'show-component']
    const finishCompile = () => {
      for (const timer of timers) {
        clearTimeout(timer)
      }
      if (root.classList.contains('is-compiling')) {
        root.classList.remove('is-compiling', ...STAGES)
        resetIsland()
        try {
          sessionStorage.setItem(COMPILED_KEY, '1')
        } catch {
          // Storage may be blocked; the compile replays on the next page load.
        }
      }
    }
    const count = (layer: string) =>
      tokens.filter(token => token.p.startsWith(`${layer}.`)).length
    if (root.classList.contains('is-compiling')) {
      clearTimeout(Number(root.dataset.compileTimer))
      delete root.dataset.compileTimer
      const at = (delay: number, run: () => void) => {
        timers.push(setTimeout(run, delay))
      }
      // Each band steps on the reveal token, the same one its fade reads.
      const step = durationOf('--semantic-motion-duration-reveal')
      at(40, () => {
        root.classList.add('show-primitives')
        sayOnIsland(`Resolving primitives, ${count('primitives')} tokens`)
      })
      at(step, () => {
        root.classList.add('show-semantic')
        sayOnIsland(`Resolving semantic, ${count('semantic')} tokens`)
      })
      at(2 * step, () => {
        root.classList.add('show-component')
        sayOnIsland(`Resolving component, ${count('component')} tokens`)
      })
      at(3.2 * step, finishCompile)
    }
    const skipCompile = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        (event.key === 'Tab' || event.key === 'Shift')
      ) {
        return
      }
      finishCompile()
    }
    document.addEventListener('keydown', skipCompile, true)
    document.addEventListener('pointerdown', skipCompile, true)

    return () => {
      document.removeEventListener('keydown', skipCompile, true)
      document.removeEventListener('pointerdown', skipCompile, true)
      finishCompile()
    }
  }, [tokens])

  /* Once per page: the graph's effect below restarts on a 719px crossing. */
  useEffect(() => {
    mountPage()
  }, [])

  useEffect(() => {
    const positions = isNarrow ? narrow : wide
    const root = document.documentElement
    const svg = document.getElementById(
      `token-graph-${isNarrow ? 'narrow' : 'wide'}`
    )
    const chain = document.getElementById('graph-chain')
    const tooltip = document.getElementById('graph-tooltip')
    if (svg === null || chain === null || tooltip === null) {
      return
    }
    const idle = window.matchMedia('(hover: none)').matches
      ? TOUCH_CHAIN
      : IDLE_CHAIN
    if (chain.textContent !== idle) {
      chain.textContent = idle
    }
    chain.dataset.idle = ''
    const theme = (): 'light' | 'dark' =>
      root.dataset.theme === 'dark' ? 'dark' : 'light'

    const byPath = new Map(tokens.map(token => [token.p, token]))
    const nodes = new Map<string, Element>(
      [...svg.querySelectorAll('.graph-node')].map(node => [
        node.getAttribute('data-path') ?? '',
        node,
      ])
    )
    const edges = [...svg.querySelectorAll('.graph-edge')]
    const stubs = [...svg.querySelectorAll('.graph-stub')]
    // The theme section's ribbons light with the hero's, and nothing else
    // reads them: the wave and the theme swing stay on the hero's edges.
    const ribbonSvg = document.querySelector('.theme-ribbons')
    const ribbons = [...document.querySelectorAll('.theme-ribbon')]
    const positionOf = new Map(
      tokens.map((token, index) => [token.p, positions[index]])
    )
    const targetOf = (path: string) => {
      const override = tokenOverride(path)
      if (override !== null) {
        return override.target
      }
      const token = byPath.get(path)
      return token === undefined ? null : theme() === 'dark' ? token.d : token.l
    }
    const readersOf = new Map<string, string[]>()
    const buildReaders = () => {
      readersOf.clear()
      for (const token of tokens) {
        const target = targetOf(token.p)
        if (target !== null) {
          readersOf.set(target, [...(readersOf.get(target) ?? []), token.p])
        }
      }
    }
    buildReaders()

    const upstream = (path: string, into: Set<string>) => {
      into.add(path)
      const target = targetOf(path)
      if (target !== null) {
        upstream(target, into)
      }
    }
    const downstream = (path: string, into: Set<string>) => {
      into.add(path)
      for (const reader of readersOf.get(path) ?? []) {
        if (!into.has(reader)) {
          downstream(reader, into)
        }
      }
    }
    /** Whether a drawn reference joins two tokens in the set, in the theme on
     * screen. */
    const reads = (edge: Element, set: ReadonlySet<string>, active: string) => {
      const only = edge.getAttribute('data-only')
      return (
        (only === null || only === active) &&
        set.has(edge.getAttribute('data-from') ?? '') &&
        set.has(edge.getAttribute('data-to') ?? '')
      )
    }

    /* The stage: the graph dims to one lineage. The hero holds it for a
       pointer, a focus, or a rule that stays broken; the theme ribbons join a
       pointer or a focus and sit out a held rule. */
    const stage = (set: ReadonlySet<string>) => {
      const active = theme()
      svg.classList.add('is-focusing')
      for (const [path, node] of nodes) {
        node.classList.toggle('is-lit', set.has(path))
      }
      for (const edge of edges) {
        edge.classList.toggle('is-lit', reads(edge, set, active))
      }
      for (const stub of stubs) {
        stub.classList.toggle(
          'is-lit',
          set.has(stub.getAttribute('data-from') ?? '')
        )
      }
    }
    const unstage = () => {
      svg.classList.remove('is-focusing')
      for (const element of [...nodes.values(), ...edges, ...stubs]) {
        element.classList.remove('is-lit')
      }
    }
    const stageRibbons = (set: ReadonlySet<string>) => {
      const active = theme()
      ribbonSvg?.classList.add('is-focusing')
      for (const ribbon of ribbons) {
        ribbon.classList.toggle('is-lit', reads(ribbon, set, active))
      }
    }
    const unstageRibbons = () => {
      ribbonSvg?.classList.remove('is-focusing')
      for (const ribbon of ribbons) {
        ribbon.classList.remove('is-lit')
      }
    }

    /** The token a live break edited, when the edit leaves a chain to hold:
     * the hard-coded accent or the link that skips a layer. */
    const brokenToken = () => {
      const breaks = (root.dataset.breaks ?? '').split(' ')
      return breaks.includes('literal')
        ? 'semantic.accent.solid'
        : breaks.includes('skip')
          ? 'component.link.text'
          : null
    }
    /* At rest the graph is idle, or it holds the broken token's chain for as
       long as the rule stays broken, so the finding takes over the hero. */
    const restStage = () => {
      const broken = brokenToken()
      if (broken === null) {
        unstage()
        return
      }
      buildReaders()
      const set = new Set<string>()
      upstream(broken, set)
      downstream(broken, set)
      stage(set)
    }
    restStage()

    const bound = () => [...document.querySelectorAll('[data-tokens]')]
    const pathsOn = (element: Element) =>
      (element.getAttribute('data-tokens') ?? '').split(' ').filter(Boolean)

    /** The value a token lands on: a hex for colors, or the CSS value. */
    const resolved = (path: string) => {
      let last = path
      let next = targetOf(path)
      while (next !== null) {
        last = next
        next = targetOf(next)
      }
      return (
        tokenOverride(last)?.hex ??
        solvedHex(last) ??
        getComputedStyle(root).getPropertyValue(cssVarOf(last)).trim()
      )
    }

    /* The fourth layer: a lit token's threads run up into the elements it reaches
       on the hero. */
    const hero = svg.closest('.hero')
    const threads = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'svg'
    )
    threads.setAttribute('class', 'page-threads')
    threads.setAttribute('aria-hidden', 'true')
    hero?.appendChild(threads)

    const drawThreads = (
      elements: readonly Element[],
      set: Set<string>,
      graphBox: DOMRect
    ) => {
      threads.replaceChildren()
      if (hero === null) {
        return
      }
      const heroBox = hero.getBoundingClientRect()
      for (const element of elements) {
        if (!hero.contains(element) || svg.contains(element)) {
          continue
        }
        const box = element.getBoundingClientRect()
        const source = pathsOn(element).find(path => set.has(path))
        const position =
          source === undefined ? undefined : positionOf.get(source)
        if (position === undefined) {
          continue
        }
        const x1 = graphBox.left + position[0] * graphBox.width - heroBox.left
        const y1 = graphBox.top + position[1] * graphBox.height - heroBox.top
        const left = box.left - heroBox.left
        const right = box.right - heroBox.left
        const top = box.top - heroBox.top
        const bottom = box.bottom - heroBox.top
        /* The thread rises from the node and meets the element's nearest edge:
           its underside when the node sits below it, its near side when the
           node sits beside it, so no thread crosses the words it points at. */
        const y2 = bottom < y1 ? bottom : top > y1 ? top : (top + bottom) / 2
        // The dial is round, so its thread meets the ring from below.
        const round = element.classList.contains('crown-dial')
        const beside = !round && (x1 < left || x1 > right)
        if (!beside && y2 === (top + bottom) / 2) {
          continue
        }
        const x2 = beside
          ? x1 < left
            ? left
            : right
          : round
            ? (left + right) / 2
            : Math.min(Math.max(x1, left + 6), right - 6)
        const d = beside
          ? `M${x1} ${y1}C${x1} ${y2} ${x1} ${y2} ${x2} ${y2}`
          : `M${x1} ${y1}C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`
        const thread = document.createElementNS(
          'http://www.w3.org/2000/svg',
          'path'
        )
        thread.setAttribute('class', 'page-thread')
        thread.setAttribute('pathLength', '1')
        thread.setAttribute('d', d)
        threads.appendChild(thread)
      }
    }

    const chainText = (path: string) => {
      const steps = [path]
      let next = targetOf(path)
      while (next !== null) {
        steps.push(next)
        next = targetOf(next)
      }
      return `${steps.join(' → ')} = ${resolved(path)}`
    }

    /** What a reviewer asks next: who owns this token, and how far it travels. */
    const governanceText = (path: string) => {
      const owners = ownersOf(
        path,
        root.dataset.breaks?.split(' ').includes('owner')
          ? siteOwnershipWithoutDefault
          : siteOwnership
      )
      const readers = new Set<string>()
      downstream(path, readers)
      const reach = readers.size - 1
      const reachText =
        reach === 0
          ? 'No token reads it.'
          : `Reaches ${reach} ${reach === 1 ? 'token' : 'tokens'}.`
      return `Owners: ${owners.length === 0 ? 'none' : owners.join(', ')}. ${reachText}`
    }

    let lit: Set<string> | null = null
    /** The last call to light, replayed when a hue lands, a rule or the theme
     * retargets an alias, or the hero resizes, so the chain, the ribbons, and
     * the threads state what the page paints now. */
    let lastLit: {
      readonly paths: readonly string[]
      readonly origin: string | null
    } | null = null
    let used: Element[] = []

    const clear = () => {
      if (lit === null) {
        return
      }
      lit = null
      lastLit = null
      unstageRibbons()
      restStage()
      for (const element of used) {
        element.classList.remove('is-reached')
      }
      used = []
      threads.replaceChildren()
      tooltip.hidden = true
      chain.textContent = idle
      chain.dataset.idle = ''
      resetIsland()
    }

    const light = (
      paths: readonly string[],
      origin: string | null,
      narrate = true
    ) => {
      lastLit = { paths, origin }
      buildReaders()
      delete chain.dataset.idle
      const set = new Set<string>()
      for (const path of paths) {
        upstream(path, set)
        if (origin !== null) {
          downstream(path, set)
        }
      }
      lit = set
      stage(set)
      const ribbonSet = new Set(set)
      for (const path of paths) {
        downstream(path, ribbonSet)
      }
      stageRibbons(ribbonSet)
      for (const element of used) {
        element.classList.remove('is-reached')
      }
      const readers = new Set<string>()
      if (origin !== null) {
        downstream(origin, readers)
      }
      used = bound().filter(element =>
        pathsOn(element).some(path => readers.has(path))
      )
      for (const element of used) {
        element.classList.add('is-reached')
      }
      // One layout read serves the threads and the tooltip.
      const graphBox = svg.getBoundingClientRect()
      drawThreads(used, set, graphBox)
      const shown = origin ?? paths[0]
      if (shown !== undefined) {
        const note = byPath.get(shown)?.n
        const noted = note === undefined ? '' : `. ${note}`
        chain.textContent = `${chainText(shown)}${noted}\n${governanceText(shown)}`
        if (narrate) {
          sayOnIsland(`${shown} = ${resolved(shown)}`)
        }
      }
      const position = origin === null ? undefined : positionOf.get(origin)
      if (position !== undefined && origin !== null) {
        tooltip.hidden = false
        tooltip.textContent = origin
        // A translate moves the tooltip without a layout shift; the canvas box
        // is the graph's box.
        tooltip.style.translate = `${position[0] * graphBox.width}px ${position[1] * graphBox.height}px`
        tooltip.dataset.side =
          position[0] > 0.8 ? 'end' : position[0] < 0.2 ? 'start' : 'middle'
      }
    }

    /* Pointer: the nearest token in the band under the pointer, so the gaps
       between dots still answer and a touch can scrub along a band. */
    const rows = ['component', 'semantic', 'primitives'].map(layer =>
      tokens
        .map(token => token.p)
        .filter(path => path.startsWith(`${layer}.`))
        .sort(
          (a, b) =>
            (positionOf.get(a)?.[0] ?? 0) - (positionOf.get(b)?.[0] ?? 0)
        )
    )
    const nearest = (event: PointerEvent) => {
      const box = svg.getBoundingClientRect()
      const fx = (event.clientX - box.left) / box.width
      const fy = (event.clientY - box.top) / box.height
      let best: string | null = null
      let bestDistance = Number.POSITIVE_INFINITY
      const aspect = box.height / box.width
      for (const row of rows) {
        for (const path of row) {
          const position = positionOf.get(path)
          if (position === undefined) {
            continue
          }
          const dx = position[0] - fx
          const dy = (position[1] - fy) * aspect
          const distance = dx * dx + dy * dy
          if (distance < bestDistance) {
            bestDistance = distance
            best = path
          }
        }
      }
      return bestDistance < 0.0011 ? best : null
    }

    let hovered: string | null = null
    const onGraphMove = (event: PointerEvent) => {
      const path = nearest(event)
      if (path === hovered) {
        return
      }
      hovered = path
      if (path === null) {
        clear()
      } else {
        light([path], path)
      }
    }
    /* A finger lifting fires pointerleave at once, so a touch keeps its token
       lit until the next touch lands outside the graph or a scroll takes over. */
    const onGraphLeave = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        return
      }
      hovered = null
      if (!svg.contains(document.activeElement)) {
        clear()
      }
    }
    const onGraphCancel = () => {
      hovered = null
      clear()
    }
    const onPageDown = (event: PointerEvent) => {
      if (
        event.pointerType !== 'touch' ||
        svg.contains(event.target as Element)
      ) {
        return
      }
      hovered = null
      clear()
    }
    svg.addEventListener('pointermove', onGraphMove)
    svg.addEventListener('pointerdown', onGraphMove)
    svg.addEventListener('pointerleave', onGraphLeave)
    svg.addEventListener('pointercancel', onGraphCancel)
    document.addEventListener('pointerdown', onPageDown)

    /* Pointing at the page lights what the element reads. */
    const onPageOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        return
      }
      const target = event.target as Element
      if (svg.contains(target)) {
        return
      }
      const element = target.closest('[data-tokens]')
      // The Crown is the hand on the dial, not a reader, so pointing at it
      // clears the reader's lineage.
      if (element === null || element.closest('.crown') !== null) {
        clear()
        return
      }
      light(pathsOn(element), null)
    }
    document.addEventListener('pointerover', onPageOver)

    /* Keyboard: a roving tab stop that moves along a band and between bands. */
    let current = rows[0]?.[0] ?? ''
    if (!isNarrow) {
      nodes.get(current)?.setAttribute('tabindex', '0')
    }
    const rove = (path: string) => {
      nodes.get(current)?.setAttribute('tabindex', '-1')
      current = path
      nodes.get(path)?.setAttribute('tabindex', '0')
    }
    const focusNode = (path: string) => {
      rove(path)
      ;(nodes.get(path) as SVGGElement | undefined)?.focus()
    }
    const onKey = (event: KeyboardEvent) => {
      const rowIndex = rows.findIndex(row => row.includes(current))
      const row = rows[rowIndex]
      if (row === undefined) {
        return
      }
      const index = row.indexOf(current)
      let next: string | undefined
      if (event.key === 'ArrowRight') {
        next = row[Math.min(index + 1, row.length - 1)]
      } else if (event.key === 'ArrowLeft') {
        next = row[Math.max(index - 1, 0)]
      } else if (event.key === 'Home') {
        next = row[0]
      } else if (event.key === 'End') {
        next = row.at(-1)
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const other =
          rows[
            event.key === 'ArrowUp'
              ? Math.max(rowIndex - 1, 0)
              : Math.min(rowIndex + 1, rows.length - 1)
          ] ?? row
        const x = positionOf.get(current)?.[0] ?? 0
        next = other.reduce((best, path) =>
          Math.abs((positionOf.get(path)?.[0] ?? 0) - x) <
          Math.abs((positionOf.get(best)?.[0] ?? 0) - x)
            ? path
            : best
        )
      }
      if (next !== undefined) {
        event.preventDefault()
        focusNode(next)
      }
    }
    // A click lands focus on a node too, and the one tab stop moves with it.
    const onFocusIn = (event: Event) => {
      const node = (event.target as Element).closest('.graph-node')
      const path = node?.getAttribute('data-path')
      if (path) {
        if (path !== current) {
          rove(path)
        }
        light([path], path)
      }
    }
    const onFocusOut = () => {
      requestAnimationFrame(() => {
        if (!svg.contains(document.activeElement)) {
          clear()
        }
      })
    }
    // Chrome makes an SVG element focusable when it holds a focus listener, which
    // would give the graph a second tab stop, so the wrapper listens instead.
    const focusRoot = svg.parentElement ?? svg
    svg.addEventListener('keydown', onKey)
    focusRoot.addEventListener('focusin', onFocusIn)
    focusRoot.addEventListener('focusout', onFocusOut)

    /* The wave: each committed hue runs a pulse up the brand's references. One
       layout flush between the two passes restarts every pulse at once, and a
       ribbon a rule hides takes no pulse it could never end. */
    const cool = (event: Event) => {
      ;(event.currentTarget as Element).classList.remove('is-hot')
    }
    const stopWave = onHueCommit(() => {
      if (lastLit !== null) {
        light(lastLit.paths, lastLit.origin, false)
      }
      if (root.dataset.motion === 'reduced' || 'dragging' in root.dataset) {
        return
      }
      const reached = new Set<string>()
      for (const token of tokens) {
        if (token.p.startsWith('primitives.color.brand.')) {
          downstream(token.p, reached)
        }
      }
      const active = theme()
      const hot = [
        ...edges.filter(edge => reads(edge, reached, active)),
        ...stubs.filter(stub =>
          reached.has(stub.getAttribute('data-from') ?? '')
        ),
      ]
      for (const element of hot) {
        element.classList.remove('is-hot')
      }
      svg.getBoundingClientRect()
      for (const element of hot) {
        if (getComputedStyle(element).display !== 'none') {
          element.classList.add('is-hot')
          element.addEventListener('animationend', cool, { once: true })
        }
      }
    })

    /* A theme flip re-aliases the semantic layer. The ribbon that takes over
       swings its root from the old primitive to the new one and lands on the
       server's exact path. Safari ignores a CSS transition on d, so a frame
       loop rewrites the path. The two ribbons of one reader share their tip,
       their root and their bands, so the numbers that differ between their
       paths are the ones that place the root: each number slides from the
       ribbon that leaves to the one that lands. */
    const serverPath = new Map(
      edges.map(edge => [edge, edge.getAttribute('d') ?? ''])
    )
    const NUMBER = /-?[\d.]+/gu
    const numbersOf = (d: string) => (d.match(NUMBER) ?? []).map(Number)
    // An ease-out-back: the root leaves fast, swings 5% past, and settles.
    const swingEase = (t: number) => {
      const back = t - 1
      return 1 + back * back * (2.2 * back + 1.2)
    }
    let swingFrame = 0
    let lastTheme = theme()
    const reroute = (from: 'light' | 'dark', to: 'light' | 'dark') => {
      cancelAnimationFrame(swingFrame)
      // The root leaves from where it is, so a flip mid-swing turns back
      // instead of restarting from rest.
      const leaving = new Map<string, readonly number[]>()
      for (const edge of edges) {
        if (edge.hasAttribute('data-only')) {
          if (edge.getAttribute('data-only') === from) {
            leaving.set(
              edge.getAttribute('data-from') ?? '',
              numbersOf(edge.getAttribute('d') ?? '')
            )
          }
          edge.setAttribute('d', serverPath.get(edge) ?? '')
        }
      }
      const moving = edges.flatMap(edge => {
        const landing = serverPath.get(edge) ?? ''
        const lands = numbersOf(landing)
        const leaves = leaving.get(edge.getAttribute('data-from') ?? '')
        return edge.getAttribute('data-only') === to &&
          leaves !== undefined &&
          leaves.length === lands.length
          ? [{ edge, landing, leaves, lands }]
          : []
      })
      const duration = durationOf('--semantic-motion-duration-handoff')
      if (
        moving.length === 0 ||
        duration === 0 ||
        root.dataset.motion === 'reduced'
      ) {
        return
      }
      const place = (eased: number) => {
        for (const { edge, landing, leaves, lands } of moving) {
          let index = 0
          edge.setAttribute(
            'd',
            landing.replace(NUMBER, () => {
              const at = leaves[index] + (lands[index] - leaves[index]) * eased
              index += 1
              return at.toFixed(1)
            })
          )
        }
      }
      place(0)
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        if (t < 1) {
          place(swingEase(t))
          swingFrame = requestAnimationFrame(step)
          return
        }
        for (const { edge } of moving) {
          edge.setAttribute('d', serverPath.get(edge) ?? '')
        }
      }
      swingFrame = requestAnimationFrame(step)
    }

    /* A rule switch or a theme flip retargets aliases, so an idle graph restates
       its rest and a lit token restates its chain, ahead of the cost line the
       readouts may write. The store has written its state by the time this
       runs. */
    const rootObserver = new MutationObserver(records => {
      buildReaders()
      // A hidden ribbon cancels its pulse, so no animationend comes to cool it.
      for (const element of svg.querySelectorAll('.is-hot')) {
        if (getComputedStyle(element).display === 'none') {
          element.classList.remove('is-hot')
        }
      }
      if (hovered === null && lit === null) {
        restStage()
      }
      const flipped = records.some(
        record => record.attributeName === 'data-theme'
      )
      if (lastLit !== null) {
        light(lastLit.paths, lastLit.origin, flipped)
      }
      if (!flipped) {
        return
      }
      refreshReadouts()
      const next = theme()
      if (next === lastTheme) {
        return
      }
      reroute(lastTheme, next)
      lastTheme = next
    })
    rootObserver.observe(root, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-breaks'],
    })

    const heroResize = new ResizeObserver(() => {
      if (lastLit !== null) {
        light(lastLit.paths, lastLit.origin, false)
      }
    })
    if (hero !== null) {
      heroResize.observe(hero)
    }

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => {
      if (motionQuery.matches) {
        root.dataset.motion = 'reduced'
      } else {
        delete root.dataset.motion
      }
    }
    motionQuery.addEventListener('change', onMotion)

    return () => {
      svg.removeEventListener('pointermove', onGraphMove)
      svg.removeEventListener('pointerdown', onGraphMove)
      svg.removeEventListener('pointerleave', onGraphLeave)
      svg.removeEventListener('pointercancel', onGraphCancel)
      svg.removeEventListener('keydown', onKey)
      focusRoot.removeEventListener('focusin', onFocusIn)
      focusRoot.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('pointerdown', onPageDown)
      document.removeEventListener('pointerover', onPageOver)
      motionQuery.removeEventListener('change', onMotion)
      cancelAnimationFrame(swingFrame)
      rootObserver.disconnect()
      heroResize.disconnect()
      stopWave()
      clear()
      nodes.get(current)?.setAttribute('tabindex', '-1')
      for (const [edge, d] of serverPath) {
        edge.setAttribute('d', d)
      }
      unstage()
      unstageRibbons()
      threads.remove()
    }
  }, [tokens, wide, narrow, isNarrow])

  return isNarrow ? (
    <NarrowGraph
      tokens={tokens}
      positions={narrow}
    />
  ) : null
}
