import { FIGMA_API_BASE_URL, FIGMA_TOKEN_HEADER, ERROR_MSG_TOKEN_REQUIRED } from "constants/index";
import type { VariableAction } from "types/mutations";

/**
 * Low-level utility to send authenticated POST, PUT, or DELETE requests to the Figma Variables REST API.
 *
 * @remarks
 * This function performs authenticated HTTP mutations (POST, PUT, DELETE) against the specified Figma API endpoint.
 * It handles JSON serialization of the request body, parses JSON responses, and propagates detailed errors.
 * Intended primarily for internal use by mutation hooks, but also suitable for direct custom API mutations.
 *
 * @typeParam T - The expected response type returned from the Figma API.
 * @param url - The full Figma REST API endpoint URL (e.g., 'https://api.figma.com/v1/files/{file_key}/variables').
 * @param token - Figma Personal Access Token (PAT) used for authentication.
 * @param action - The action for the mutation: 'CREATE', 'UPDATE', or 'DELETE'.
 * @param body - Optional request payload sent as a JSON string.
 *
 * @returns A Promise resolving to the parsed JSON response from the Figma API.
 *
 * @throws Throws an Error if the token is not provided.
 * @throws Throws an Error if the HTTP response is unsuccessful, including the error message from the API or a default message.
 *
 * @example
 * ```ts
 * import { mutator } from '@figma-vars/hooks/api';
 *
 * async function updateVariable(fileKey: string, token: string, variableId: string) {
 *   const url = `https://api.figma.com/v1/files/${fileKey}/variables/${variableId}`;
 *   const payload = { name: 'Updated Name' };
 *   const result = await mutator(url, token, 'PUT', payload);
 *   return result;
 * }
 * ```
 */
export async function mutator<TResponse = unknown, TBody extends Record<string, unknown> = Record<string, unknown>>(
  url: string,
  token: string,
  action: VariableAction,
  body?: TBody,
): Promise<TResponse> {
  if (!token) {
    throw new Error(ERROR_MSG_TOKEN_REQUIRED);
  }

  const methodMap: Record<VariableAction, "POST" | "PUT" | "DELETE"> = {
    CREATE: "POST",
    UPDATE: "PUT",
    DELETE: "DELETE",
  };
  const method = methodMap[action];

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      [FIGMA_TOKEN_HEADER]: token,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${FIGMA_API_BASE_URL}${url}`, init);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.err || errorData.message || "An API error occurred");
  }

  // Handle successful '204 No Content' responses, which have no body
  if (response.status === 204 || !response.body) {
    // Cast empty object to the generic response type, allowing callers to specify void or an object
    return {} as TResponse;
  }

  // For all other successful responses, parse the JSON body
  return response.json() as Promise<TResponse>;
}
