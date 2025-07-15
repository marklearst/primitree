// utils/fetchHelpers.ts

/**
 * @internal
 * A generic fetcher function designed to work with SWR.
 * It takes a URL and a Figma token, and returns the JSON response.
 *
 * This function is used by the data-fetching hooks to make authenticated requests to the Figma API.
 *
 * @param url - The API endpoint to fetch.
 * @param token - The Figma Personal Access Token.
 * @returns A promise that resolves with the JSON data from the API.
 * @throws Will throw an error if the fetch call fails or if the API returns an error response.
 */
export const fetcher = async (url: string, token: string) => {
  if (!token) {
    throw new Error('A Figma API token is required to make this request.')
  }

  const response = await fetch(url, {
    headers: {
      'X-FIGMA-TOKEN': token,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(
      errorData.message ||
        'An error occurred while fetching data from the Figma API.'
    )
  }

  return response.json()
}
