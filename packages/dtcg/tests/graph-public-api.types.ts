import type { GraphFragment, Result } from '@primitree/core'
import {
  createDTCGGraphFragment,
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

declare const api: typeof import('../src/index')

// @ts-expect-error The prerelease function name is not public.
void api.toGraphFragment

// @ts-expect-error The prerelease options name is not public.
type RemovedOptions = import('../src/index').DTCGGraphOptions
declare const removedOptions: RemovedOptions
void removedOptions
