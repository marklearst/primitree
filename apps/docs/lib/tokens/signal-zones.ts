import themeConfig from '../../tokens/theme.config.json' with { type: 'json' }
import {
  defaultTuning,
  type SignalName,
  type SolverTuning,
  signalCollisions,
  solvePrimitives,
} from './solver.ts'

/* The dial's warn and fail arcs come from the same measure the Island speaks,
   so the drawing and the message agree at every hue in both themes. */

export type Theme = 'light' | 'dark'

export interface SignalZone {
  readonly theme: Theme
  readonly name: SignalName
  /** The first hue in the arc. */
  readonly from: number
  /** One past the last hue, so an arc one hue wide still has width. An arc that
   * crosses hue 0 runs past 360. */
  readonly to: number
}

/** The taste knobs the site ships, the ones the page store solves with. */
export const siteTuning: SolverTuning = {
  brandChroma: themeConfig.brandChroma ?? defaultTuning.brandChroma,
  neutralTint: themeConfig.neutralTint ?? defaultTuning.neutralTint,
}

const SIGNALS: readonly SignalName[] = ['fail', 'warn']

/** Every hue's collisions in one theme, measured once at build time. */
export function collisionsByHue(
  theme: Theme,
  tuning: SolverTuning = siteTuning
): readonly (readonly SignalName[])[] {
  return Array.from({ length: 360 }, (_, hue) =>
    signalCollisions(solvePrimitives(hue, tuning), theme)
  )
}

/** The arcs of hue where the brand reads too close to a signal, in one theme. */
export function signalZones(
  theme: Theme,
  tuning: SolverTuning = siteTuning
): readonly SignalZone[] {
  const hits = collisionsByHue(theme, tuning)
  const zones: SignalZone[] = []
  for (const name of SIGNALS) {
    const flagged = (hue: number) => hits[hue % 360]?.includes(name) ?? false
    // Walk from a clear hue, so an arc that crosses hue 0 comes out whole.
    let start = 0
    while (start < 360 && flagged(start)) {
      start += 1
    }
    if (start === 360) {
      zones.push({ theme, name, from: 0, to: 360 })
      continue
    }
    let hue = start
    while (hue < start + 360) {
      if (!flagged(hue)) {
        hue += 1
        continue
      }
      const from = hue
      while (hue < start + 360 && flagged(hue)) {
        hue += 1
      }
      zones.push({
        theme,
        name,
        from: from % 360,
        to: (from % 360) + hue - from,
      })
    }
  }
  return zones
}

/** Whether a zone covers a hue, counting an arc that runs past 360. */
export const zoneCovers = (zone: SignalZone, hue: number) =>
  (hue >= zone.from && hue < zone.to) ||
  (hue + 360 >= zone.from && hue + 360 < zone.to)
