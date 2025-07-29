// constants/index.ts

// Base URL for Figma API
export const FIGMA_API_BASE_URL = 'https://api.figma.com'

// Specific API endpoints
export const FIGMA_FILES_ENDPOINT = `${FIGMA_API_BASE_URL}/v1/files`
export const FIGMA_VARIABLES_ENDPOINT = (fileKey: string) =>
  `${FIGMA_FILES_ENDPOINT}/${fileKey}/variables`
export const FIGMA_POST_VARIABLES_ENDPOINT = `${FIGMA_API_BASE_URL}/v1/variables`
export const FIGMA_VARIABLE_BY_ID_ENDPOINT = (variableId: string) =>
  `${FIGMA_API_BASE_URL}/v1/variables/${variableId}`
export const FIGMA_LOCAL_VARIABLES_ENDPOINT = (fileKey: string) =>
  `${FIGMA_FILES_ENDPOINT}/${fileKey}/variables/local`

// Headers
export const CONTENT_TYPE_JSON = 'application/json'
export const FIGMA_TOKEN_HEADER = 'X-FIGMA-TOKEN'

// Error Messages
export const ERROR_MSG_TOKEN_REQUIRED = 'A Figma API token is required.'
export const ERROR_MSG_TOKEN_FILE_KEY_REQUIRED =
  'A Figma API token and file key are required.'
export const ERROR_MSG_BULK_UPDATE_FAILED = 'Failed to perform bulk update.'
export const ERROR_MSG_CREATE_VARIABLE_FAILED =
  'Failed to create Figma variable.'
export const ERROR_MSG_DELETE_VARIABLE_FAILED =
  'Failed to delete Figma variable.'
export const ERROR_MSG_UPDATE_VARIABLE_FAILED =
  'Failed to update Figma variable.'
export const ERROR_MSG_FETCH_FIGMA_DATA_FAILED =
  'An error occurred while fetching data from the Figma API.'
