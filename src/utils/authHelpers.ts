// utils/authHelpers.ts

/**
 * Retrieves the Figma API token from environment variables or any other secure storage mechanism you've implemented.
 */
export const getFigmaToken = (): string | null => {
  return import.meta.env.VITE_FIGMA_TOKEN || null
}
