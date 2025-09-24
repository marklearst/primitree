/**
 * @fileoverview Constants for Figma Variables API endpoints, headers, and error messages.
 * Contains all the API URLs, HTTP headers, and standardized error messages used throughout the library.
 * @see {@link https://www.figma.com/developers/api#variables|Figma Variables API Documentation}
 * @since 1.0.0
 */

/**
 * Base URL for the Figma REST API.
 * All API endpoints are built from this base URL.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api|Figma API Documentation}
 */
export const FIGMA_API_BASE_URL = 'https://api.figma.com'

/**
 * Base endpoint for Figma files API.
 * Used to construct file-specific endpoints.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 * @see {@link https://www.figma.com/developers/api#files-endpoint|Figma Files API}
 */
export const FIGMA_FILES_ENDPOINT = `${FIGMA_API_BASE_URL}/v1/files`

/**
 * Base endpoint for Figma variables API v1.
 * Used for variable CRUD operations.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 * @internal
 */
const FIGMA_V1_VARIABLES_ENDPOINT_BASE = `${FIGMA_API_BASE_URL}/v1/variables`

/**
 * Endpoint for retrieving variables for a specific file.
 * 
 * @constant {function}
 * @memberof Constants
 * @param {string} fileKey - The key of the file to retrieve variables for.
 * @returns {string} The endpoint URL for retrieving variables for the specified file.
 * @since 1.0.0
 */
export const FIGMA_VARIABLES_ENDPOINT = (fileKey: string) =>
  `${FIGMA_FILES_ENDPOINT}/${fileKey}/variables`

/**
 * Endpoint for creating new variables.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 */
export const FIGMA_POST_VARIABLES_ENDPOINT = FIGMA_V1_VARIABLES_ENDPOINT_BASE

/**
 * Endpoint for retrieving a variable by ID.
 * 
 * @constant {function}
 * @memberof Constants
 * @param {string} variableId - The ID of the variable to retrieve.
 * @returns {string} The endpoint URL for retrieving the variable with the specified ID.
 * @since 1.0.0
 */
export const FIGMA_VARIABLE_BY_ID_ENDPOINT = (variableId: string) =>
  `${FIGMA_V1_VARIABLES_ENDPOINT_BASE}/${variableId}`

/**
 * Endpoint for retrieving local variables for a specific file.
 * 
 * @constant {function}
 * @memberof Constants
 * @param {string} fileKey - The key of the file to retrieve local variables for.
 * @returns {string} The endpoint URL for retrieving local variables for the specified file.
 * @since 1.0.0
 */
export const FIGMA_LOCAL_VARIABLES_ENDPOINT = (fileKey: string) =>
  `${FIGMA_FILES_ENDPOINT}/${fileKey}/variables/local`

/**
 * HTTP header for specifying JSON content type.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 */
export const CONTENT_TYPE_JSON = 'application/json'

/**
 * HTTP header for specifying the Figma API token.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 */
export const FIGMA_TOKEN_HEADER = 'X-FIGMA-TOKEN'

/**
 * Error message for when a Figma API token is required but not provided.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 */
export const ERROR_MSG_TOKEN_REQUIRED = 'A Figma API token is required.'

/**
 * Error message for when a Figma API token and file key are required but not provided.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 */
export const ERROR_MSG_TOKEN_FILE_KEY_REQUIRED = `${ERROR_MSG_TOKEN_REQUIRED} and file key are required.`

/**
 * Error message for when a bulk update operation fails.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 */
export const ERROR_MSG_BULK_UPDATE_FAILED = 'Failed to perform bulk update.'

/**
 * Error message for when creating a new variable fails.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 */
export const ERROR_MSG_CREATE_VARIABLE_FAILED =
  'Failed to create Figma variable.'

/**
 * Error message for when deleting a variable fails.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 */
export const ERROR_MSG_DELETE_VARIABLE_FAILED =
  'Failed to delete Figma variable.'

/**
 * Error message for when updating a variable fails.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 */
export const ERROR_MSG_UPDATE_VARIABLE_FAILED =
  'Failed to update Figma variable.'

/**
 * Error message for when fetching data from the Figma API fails.
 * 
 * @constant {string}
 * @memberof Constants
 * @since 1.0.0
 */
export const ERROR_MSG_FETCH_FIGMA_DATA_FAILED =
  'An error occurred while fetching data from the Figma API.'
