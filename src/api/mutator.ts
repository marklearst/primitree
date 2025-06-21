import {
  FIGMA_TOKEN_HEADER,
  CONTENT_TYPE_JSON,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_FETCH_FIGMA_DATA_FAILED,
} from '../constants'

type HttpMethod = 'POST' | 'PUT' | 'DELETE'

/**
 * @internal
 * A generic mutator function for handling POST, PUT, DELETE requests.
 *
 * This function is used by the mutation functions to make authenticated requests to the Figma API.
 *
 * @template T - The expected return type from the API response
 * @param {string} url - The API endpoint to send the request to.
 * @param {string} token - The Figma Personal Access Token.
 * @param {HttpMethod} method - The HTTP method ('POST', 'PUT', or 'DELETE').
 * @param {Record<string, unknown>} [body] - The payload to send with the request (for 'POST' and 'PUT').
 * @returns {Promise<T>} A promise that resolves with the JSON data from the API.
 * @throws {Error} Will throw an error if the fetch call fails or if the API returns an error response.
 */
export const mutator = async <T>(
  url: string,
  token: string,
  method: HttpMethod,
  body?: Record<string, unknown>
): Promise<T> => {
  if (!token) {
    throw new Error(ERROR_MSG_TOKEN_REQUIRED)
  }

  const response = await fetch(url, {
    method,
    headers: {
      [FIGMA_TOKEN_HEADER]: token,
      'Content-Type': CONTENT_TYPE_JSON,
    },
    ...(body && { body: JSON.stringify(body) }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || ERROR_MSG_FETCH_FIGMA_DATA_FAILED)
  }

  // For DELETE requests, Figma API returns 204 No Content, so the body will be empty.
  if (response.status === 204) {
    return Promise.resolve(undefined as T)
  }

  return response.json()
}
