import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

interface FigmaTokenContextType {
  token: string | null
}

const FigmaTokenContext = createContext<FigmaTokenContextType | undefined>(
  undefined
)

interface FigmaVarsProviderProps {
  children: ReactNode
  token: string | null
}

export const FigmaVarsProvider = ({
  children,
  token,
}: FigmaVarsProviderProps) => {
  return (
    <FigmaTokenContext.Provider value={{ token }}>
      {children}
    </FigmaTokenContext.Provider>
  )
}

export const useFigmaTokenContext = (): FigmaTokenContextType => {
  const context = useContext(FigmaTokenContext)
  if (context === undefined) {
    throw new Error(
      'useFigmaTokenContext must be used within a FigmaVarsProvider'
    )
  }
  return context
}
