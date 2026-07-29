import type { GraphFragment, Result } from '@primitree/core'
import {
  buildDTCGOutputs,
  createDTCGGraphFragment,
  type DTCGOutputSet,
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

declare const api: typeof import('../src/index')

// @ts-expect-error The prerelease function name is not public.
void api.toGraphFragment

// @ts-expect-error The prerelease options name is not public.
type RemovedOptions = import('../src/index').DTCGGraphOptions
declare const removedOptions: RemovedOptions
void removedOptions
