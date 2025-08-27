import useSWR from "swr";
import { fetcher } from "api/fetcher";
import type { LocalVariablesResponse } from "types/figma";
import { useFigmaTokenContext } from "contexts/useFigmaTokenContext";

/**
 * Hook to fetch and manage Figma Variables, including collections and modes.
 *
 * @remarks
 * This hook uses SWR for caching and revalidation. It fetches the variables for the
 * file key provided via the FigmaVarsProvider context.
 *
 * @returns SWR response object with `data`, `error`, `isLoading`, and `isValidating`.
 *
 * @public
 */
export const useVariables = () => {
  const { token, fileKey } = useFigmaTokenContext();

  const url = token && fileKey ? `https://api.figma.com/v1/files/${fileKey}/variables/local` : null;
  const swrResponse = useSWR<LocalVariablesResponse>(
    url && token ? ([url, token] as const) : null,
    url && token ? ([u, t]: readonly [string, string]) => fetcher<LocalVariablesResponse>(u, t) : () => Promise.resolve(undefined as unknown as LocalVariablesResponse),
  );

  return swrResponse;
};
