import { useState, useEffect } from 'react'

/**
 * Retrieves the Figma API token from environment or context (future-proofed for provider override)
 */
const useFigmaToken = (): string => {
  const [token, setToken] = useState<string>('')

  useEffect(() => {
    // TODO: Add support for context/provider override
    const figmaToken: string = import.meta.env.VITE_FIGMA_TOKEN || ''
    setToken(figmaToken)
  }, [])

  return token
}

export default useFigmaToken
