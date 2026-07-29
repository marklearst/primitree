import type { GraphFragment, Result } from '@primitree/core'
import {
  buildDTCGOutputs,
  createDTCGGraphFragment,
  type DTCGOutputSet,
  type DTCGColorComponent,
  type DTCGColorSpace,
  type DTCGColorValue,
  type DTCGCubicBezierValue,
  type DTCGFontFamilyValue,
  type DTCGFontWeightValue,
  type DTCGGraphFragmentOptions,
  type DTCGTokenType,
  type DTCGTokenValue,
} from '../src/index'

const options: DTCGGraphFragmentOptions = {
  source: 'brand',
  uri: 'tokens.json',
}
const result: Result<GraphFragment> = createDTCGGraphFragment(
  { scale: { base: { $type: 'number', $value: 4 } } },
  options
)
void result

const colorSpaces: readonly DTCGColorSpace[] = [
  'srgb',
  'srgb-linear',
  'hsl',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'display-p3',
  'a98-rgb',
  'prophoto-rgb',
  'rec2020',
  'xyz-d65',
  'xyz-d50',
]
const missingColorComponent: DTCGColorComponent = 'none'
const wideGamutColor: DTCGColorValue = {
  colorSpace: 'display-p3',
  components: [0.2, missingColorComponent, 1],
  alpha: 0.75,
}
void colorSpaces
void wideGamutColor

const family: DTCGFontFamilyValue = ['Helvetica', 'Arial', 'sans-serif']
const weight: DTCGFontWeightValue = 'bold'
const curve: DTCGCubicBezierValue = [0.25, -1, 0.75, 2]
const curveType: DTCGTokenType = 'cubicBezier'
const curveValue: DTCGTokenValue = curve
void family
void weight
void curve
void curveType
void curveValue

declare const outputSet: DTCGOutputSet
const output = buildDTCGOutputs(outputSet, {
  css: true,
  tailwind: true,
  typescript: true,
})
void output

// @ts-expect-error DTCG font weight names use exact lowercase spellings.
const invalidWeight: DTCGFontWeightValue = 'Bold'
void invalidWeight

// @ts-expect-error DTCG 2025.10 does not list this color space.
const invalidColorSpace: DTCGColorSpace = 'device-cmyk'
void invalidColorSpace

const invalidColorComponents: DTCGColorValue = {
  colorSpace: 'srgb',
  // @ts-expect-error A DTCG color has exactly three components.
  components: [0, 0],
}
void invalidColorComponents

// @ts-expect-error A DTCG color component is a number or `none`.
const invalidColorComponent: DTCGColorComponent = 'missing'
void invalidColorComponent

// @ts-expect-error A DTCG cubic Bezier value has exactly four entries.
const shortCurve: DTCGCubicBezierValue = [0, 0, 1]
void shortCurve

const textCurve: DTCGCubicBezierValue = [
  0,
  0,
  1,
  // @ts-expect-error A DTCG cubic Bezier entry is a number.
  '1',
]
void textCurve

type FigmaInferredType = ReturnType<
  typeof import('../src/index').inferTokenType
>
// @ts-expect-error Figma variables cannot contain DTCG cubic Bezier tuples.
const inferredCurve: FigmaInferredType = 'cubicBezier'
void inferredCurve

declare const api: typeof import('../src/index')

// @ts-expect-error The prerelease function name is not public.
void api.toGraphFragment

// @ts-expect-error The prerelease options name is not public.
type RemovedOptions = import('../src/index').DTCGGraphOptions
declare const removedOptions: RemovedOptions
void removedOptions
