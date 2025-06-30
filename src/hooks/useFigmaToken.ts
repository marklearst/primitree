import { useFigmaTokenContext } from '../contexts/FigmaTokenContext'

/**
 * Retrieves the Figma API token from the FigmaVarsProvider.
 * This hook must be used within a component wrapped by FigmaVarsProvider.
 */
const useFigmaToken = (): string | null => {
  const { token } = useFigmaTokenContext()
  return token
}

export default useFigmaToken
