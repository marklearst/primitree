/**
 * @packageDocumentation
 * Constants and error messages used across the @figma-vars/hooks library.
 *
 * @remarks
 * Includes base URLs for the Figma API, endpoint builders, HTTP content types, header keys, and consistent error message strings for various failure scenarios.
 *
 * Use these constants to ensure consistent API interaction and error handling throughout the library.
 *
 * @public
 */

export const FIGMA_API_BASE_URL = 'https://api.figma.com'

export const FIGMA_FILES_ENDPOINT = `${FIGMA_API_BASE_URL}/v1/files`

export const FIGMA_PUBLISHED_VARIABLES_PATH = (fileKey: string) =>
  `/v1/files/${fileKey}/variables/published`

export const FIGMA_FILE_VARIABLES_PATH = (fileKey: string) =>
  `/v1/files/${fileKey}/variables`

/**
 * Builds the URL to fetch local variables for a given Figma file.
 *
 * @param fileKey - The unique key of the Figma file.
 * @returns The URL string to access local variables.
 *
 * @example
 * ```ts
 * const url = FIGMA_LOCAL_VARIABLES_ENDPOINT('your-file-key')
 * ```
 */
export const FIGMA_LOCAL_VARIABLES_ENDPOINT = (fileKey: string) =>
  `${FIGMA_FILES_ENDPOINT}/${fileKey}/variables/local`

/**
 * The HTTP Content-Type header value for JSON requests.
 */
export const CONTENT_TYPE_JSON = 'application/json'

/**
 * The HTTP header key used to pass the Figma Personal Access Token.
 */
export const FIGMA_TOKEN_HEADER = 'X-FIGMA-TOKEN'

/**
 * Error message when no Figma API token is provided.
 */
export const ERROR_MSG_TOKEN_REQUIRED = 'A Figma API token is required.'

/**
 * Error message when both the Figma API token and file key are missing.
 */
export const ERROR_MSG_TOKEN_FILE_KEY_REQUIRED = `${ERROR_MSG_TOKEN_REQUIRED} and file key are required.`

/**
 * Error message when a bulk update operation fails.
 */
export const ERROR_MSG_BULK_UPDATE_FAILED = 'Failed to perform bulk update.'

/**
 * Error message when creating a Figma variable fails.
 */
export const ERROR_MSG_CREATE_VARIABLE_FAILED =
  'Failed to create Figma variable.'

/**
 * Error message when deleting a Figma variable fails.
 */
export const ERROR_MSG_DELETE_VARIABLE_FAILED =
  'Failed to delete Figma variable.'

/**
 * Error message when updating a Figma variable fails.
 */
export const ERROR_MSG_UPDATE_VARIABLE_FAILED =
  'Failed to update Figma variable.'

/**
 * Error message when fetching data from the Figma API fails.
 */
export const ERROR_MSG_FETCH_FIGMA_DATA_FAILED =
  'An error occurred while fetching data from the Figma API.'
