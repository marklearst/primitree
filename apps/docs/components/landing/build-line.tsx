'use client'

import { usePageState } from '@/lib/tokens/page-store'
import { ratioClause } from '@/lib/tokens/solver'

/** States the result of the last check, so a broken rule changes this line too. */
export function BuildLine({ total }: { total: number }) {
  const count = usePageState(state => state.findings.length)
  const stray = usePageState(state =>
    state.findings.some(finding => finding.path === 'brand.accent')
  )
  return (
    <>
      {stray ? total + 1 : total} tokens, 3 layers, {count}{' '}
      {count === 1 ? 'finding' : 'findings'}, exit {count === 0 ? 0 : 1}.
    </>
  )
}

/** Prints the tokens that color this section, so the last screen is a specimen too. */
export function CloseChain() {
  const mounted = usePageState(state => state.mounted)
  const readouts = usePageState(state => state.readouts)
  const hex = usePageState(state => state.solidHex)
  if (!mounted) {
    return null
  }
  return (
    <code className='close-chain'>
      component.close.background = {hex}, label {ratioClause(readouts.label)}
    </code>
  )
}
