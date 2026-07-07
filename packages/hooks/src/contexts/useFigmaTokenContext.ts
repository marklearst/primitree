import { useContext } from 'react'
import { FigmaTokenContext } from './FigmaTokenContext'
import type { FigmaTokenContextType } from 'types/contexts'

export const useFigmaTokenContext = (): FigmaTokenContextType => {
  const context = useContext(FigmaTokenContext)
  if (context === undefined) {
    throw new Error(
      'useFigmaTokenContext must be used within a FigmaVarsProvider'
    )
  }
  return context
}
