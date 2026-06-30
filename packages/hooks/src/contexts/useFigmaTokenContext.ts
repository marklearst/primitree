import { useContext } from 'react'
import { FigmaTokenContext } from './FigmaTokenContext'
import type { FigmaTokenContextType } from '../types/contexts'

/**
 * Read the value from the nearest {@link FigmaVariablesProvider}.
 *
 * @throws Error outside a FigmaVariablesProvider.
 *
 * @public
 */
export const useFigmaTokenContext = (): FigmaTokenContextType => {
  const context = useContext(FigmaTokenContext)
  if (context === undefined) {
    throw new Error(
      '[primitree] Call useFigmaTokenContext inside a FigmaVariablesProvider.'
    )
  }
  return context
}
