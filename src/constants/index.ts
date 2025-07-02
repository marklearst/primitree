// constants/index.ts

// Base URL for Figma API
export const FIGMA_API_BASE_URL = 'https://api.figma.com'

// Specific API endpoints
export const FIGMA_FILES_ENDPOINT = `${FIGMA_API_BASE_URL}/v1/files`
export const FIGMA_VARIABLES_ENDPOINT = (fileKey: string) =>
  `${FIGMA_FILES_ENDPOINT}/${fileKey}/variables`
