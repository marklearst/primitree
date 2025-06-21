// utils/fetchHelpers.ts

import {
  FIGMA_TOKEN_HEADER,
  CONTENT_TYPE_JSON,
  ERROR_MSG_TOKEN_REQUIRED,
  ERROR_MSG_FETCH_FIGMA_DATA_FAILED,
} from '../constants'

/**
 * @internal
 * A generic fetcher function designed to work with SWR.
 * It takes a URL and a Figma token, and returns the JSON response.
 *
 * This function is used by the data-fetching hooks to make authenticated requests to the Figma API.
 *
 * @param {string} url - The API endpoint to fetch.
 * @param {string} token - The Figma Personal Access Token.
 * @returns {Promise<any>} A promise that resolves with the JSON data from the API.
 * @throws {Error} Will throw an error if the fetch call fails or if the API returns an error response.
 */
export const fetcher = async (url: string, token: string) => {
  if (!token) {
    throw new Error(ERROR_MSG_TOKEN_REQUIRED)
  }

  const response = await fetch(url, {
    headers: {
      [FIGMA_TOKEN_HEADER]: token,
      'Content-Type': CONTENT_TYPE_JSON,
    },
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || ERROR_MSG_FETCH_FIGMA_DATA_FAILED)
  }

  return response.json()
}
