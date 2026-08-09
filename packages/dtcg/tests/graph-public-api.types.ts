import type { GraphFragment, Result } from '@primitree/core'
import {
  buildDTCGOutputs,
  createDTCGGraphFragment,
  type DTCGOutputSet,
  type DTCGColorComponent,
  type DTCGColorSpace,
  type DTCGColorValue,
  type DTCGFontFamilyValue,
  type DTCGFontWeightValue,
  type DTCGGraphFragmentOptions,
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
void family
void weight

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

declare const api: typeof import('../src/index')

// @ts-expect-error The prerelease function name is not public.
void api.toGraphFragment

// @ts-expect-error The prerelease options name is not public.
type RemovedOptions = import('../src/index').DTCGGraphOptions
declare const removedOptions: RemovedOptions
void removedOptions
