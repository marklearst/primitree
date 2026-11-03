/* Solves this site's color primitives from one hue. This is the site's own
   theme code, not a Primitree feature: Primitree checks the tokens it writes
   and builds them, and it never picks a color.

   A step number is CIE L*, so a step names a luminance. WCAG contrast depends
   on luminance alone, so two steps hold the same ratio at every hue. */

type Linear = [number, number, number]

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function oklchToLinear(L: number, C: number, h: number): Linear {
  const radians = (h * Math.PI) / 180
  const a = C * Math.cos(radians)
  const b = C * Math.sin(radians)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const inGamut = (rgb: Linear) =>
  rgb.every(channel => channel >= -1e-4 && channel <= 1 + 1e-4)

/** The most chroma this lightness and hue can hold inside sRGB, up to `cap`. */
function fitChroma(L: number, cap: number, h: number): number {
  if (inGamut(oklchToLinear(L, cap, h))) {
    return cap
  }
  let low = 0
  let high = cap
  for (let iteration = 0; iteration < 22; iteration += 1) {
    const middle = (low + high) / 2
    if (inGamut(oklchToLinear(L, middle, h))) {
      low = middle
    } else {
      high = middle
    }
  }
  return low
}

const encode = (channel: number) =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055

/** The sRGB hex of an OKLCH color, clipped to the gamut. */
export const hexOf = (L: number, C: number, h: number) =>
  `#${oklchToLinear(L, C, h)
    .map(channel =>
      Math.round(clamp01(encode(clamp01(channel))) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`

const luminanceOf = ([r, g, b]: Linear) => 0.2126 * r + 0.7152 * g + 0.0722 * b

const luminanceOfStep = (step: number) =>
  step > 8 ? ((step + 16) / 116) ** 3 : step / (24389 / 27)

export interface SolvedColor {
  /** OKLCH lightness from 0 to 1. */
  readonly L: number
  readonly C: number
  readonly h: number
  readonly hex: string
}

/** The color at hue `h` whose luminance is the one the step names, with the
 * most chroma the cap and sRGB allow. */
export function solveStep(h: number, step: number, cap: number): SolvedColor {
  if (step === 100 && cap === 0) {
    return { L: 1, C: 0, h, hex: '#ffffff' }
  }
  const target = luminanceOfStep(step)
  let low = 0
  let high = 1
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const middle = (low + high) / 2
    const channels = oklchToLinear(middle, fitChroma(middle, cap, h), h).map(
      clamp01
    ) as Linear
    if (luminanceOf(channels) < target) {
      low = middle
    } else {
      high = middle
    }
  }
  const L = Number(((low + high) / 2).toFixed(4))
  const C = Math.floor(fitChroma(L, cap, h) * 10000) / 10000
  return { L, C, h, hex: hexOf(L, C, h) }
}

function luminanceOfHex(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map(start => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** A contrast ratio to two places, rounded down so a readout never overstates it. */
export const ratioText = (ratio: number) =>
  (Math.floor(ratio * 100) / 100).toFixed(2)

/** A ratio and its AA verdict, worded to follow a label. */
export const ratioClause = (ratio: number) =>
  `${ratioText(ratio)}:1${ratio >= 4.5 ? ' AA' : ', fails AA'}`

/** The WCAG 2 contrast ratio of two hex colors. */
export function contrast(first: string, second: string): number {
  const a = luminanceOfHex(first)
  const b = luminanceOfHex(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Warn and fail keep their hues wherever the brand goes, so a failure always
 * looks like a failure. */
export const signalHues = { warn: 80, fail: 27 } as const
export type SignalName = keyof typeof signalHues

/** The signals a brand hue reads too close to, measured on color: four times
 * the smallest difference CSS Color calls noticeable, on the solid or the link
 * text. */
const COLLISION_DISTANCE = 0.08

export function signalCollisions(
  primitives: SolvedPrimitives,
  theme: 'light' | 'dark'
): SignalName[] {
  const step = theme === 'dark' ? '72' : '45'
  const brand = primitives.brand[step]
  const signals = { warn: primitives.amber[step], fail: primitives.red[step] }
  return (Object.keys(signals) as SignalName[]).filter(name => {
    const signal = signals[name]
    return (
      brand !== undefined &&
      signal !== undefined &&
      deltaE(brand, signal) < COLLISION_DISTANCE
    )
  })
}

/** Chroma cap per step. The brand runs full at its solid step and calmer at
 * the ends; neutrals carry a trace of the hue. */
export const neutralCaps = {
  100: 0,
  97: 0.004,
  94: 0.005,
  90: 0.007,
  80: 0.009,
  72: 0.012,
  60: 0.012,
  45: 0.012,
  35: 0.012,
  20: 0.012,
  8: 0.014,
  4: 0.008,
  1: 0.008,
} as const
export const brandCaps = {
  95: 0.035,
  85: 0.17,
  72: 0.19,
  45: 0.22,
  35: 0.14,
  15: 0.06,
} as const
const signalCaps = { 97: 0.018, 72: 0.17, 45: 0.2, 15: 0.06 } as const
const syntaxHues = { blue: 260 } as const

export type ColorFamily = 'neutral' | 'brand' | 'red' | 'amber' | 'blue'

export type SolvedPrimitives = Readonly<
  Record<ColorFamily, Readonly<Record<string, SolvedColor>>>
>

const solveFamily = (
  h: number,
  caps: Readonly<Record<number, number>>,
  gain = 1
): Readonly<Record<string, SolvedColor>> =>
  Object.fromEntries(
    Object.entries(caps).map(([step, cap]) => [
      step,
      solveStep(h, Number(step), cap * gain),
    ])
  )

/** The taste decisions in tokens/theme.config.json, besides the hue. */
export interface SolverTuning {
  /** Scales the brand's chroma caps. */
  readonly brandChroma: number
  /** Scales how much of the hue the neutrals carry. */
  readonly neutralTint: number
}

export const defaultTuning: SolverTuning = { brandChroma: 1, neutralTint: 1 }

/** Every color primitive this site uses. Changing the hue changes these values
 * and never these names. */
export function solvePrimitives(
  hue: number,
  tuning: SolverTuning = defaultTuning
): SolvedPrimitives {
  const h = ((hue % 360) + 360) % 360
  return {
    neutral: solveFamily(h, neutralCaps, tuning.neutralTint),
    brand: solveFamily(h, brandCaps, tuning.brandChroma),
    red: solveFamily(signalHues.fail, signalCaps),
    amber: solveFamily(signalHues.warn, { 72: 0.17, 45: 0.2 }),
    blue: solveFamily(syntaxHues.blue, { 72: 0.15 }),
  }
}

/** Yellow and lime hold their chroma as a light tone alone, so these hues take a
 * light solid under a dark label. Everywhere else the solid is the deep step.
 * Fixed constants give a hue one route in both themes, and a drag widens the arc
 * by the slack so the flip never chatters at an edge. */
export const INK_ARC = [84, 130] as const
const ARC_SLACK = 4

export function underInk(hue: number, wasUnderInk = false): boolean {
  const slack = wasUnderInk ? ARC_SLACK : 0
  return hue >= INK_ARC[0] - slack && hue <= INK_ARC[1] + slack
}

const oklab = ({ L, C, h }: SolvedColor) => {
  const radians = (h * Math.PI) / 180
  return [L, C * Math.cos(radians), C * Math.sin(radians)] as const
}

/** The distance between two colors in Oklab. */
export function deltaE(first: SolvedColor, second: SolvedColor): number {
  const [l1, a1, b1] = oklab(first)
  const [l2, a2, b2] = oklab(second)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** A color primitive as CSS, the way emitCss writes an OKLCH color. */
export const cssColor = ({ L, C, h }: SolvedColor) => `oklch(${L} ${C} ${h})`
