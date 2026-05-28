import { createContext } from 'react'
import type { FigmaTokenContextType } from 'types/contexts'

export const FigmaTokenContext = createContext<
  FigmaTokenContextType | undefined
>(undefined)
