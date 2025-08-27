import { useFigmaTokenContext } from "contexts/useFigmaTokenContext";
import { useMutation } from "hooks/useMutation";
import type { CreateVariablePayload } from "types/mutations";
import {
  FIGMA_POST_VARIABLES_ENDPOINT,
  ERROR_MSG_TOKEN_REQUIRED,
} from "constants/index";
import { mutator } from "api/mutator";

/**
 * React hook that creates a new Figma variable in the current file using the Figma Variables API.
 *
 * @remarks
 * The hook returns a `mutate` function to trigger the creation along with state flags and data.
 *
 * @example
 * ```tsx
 * import { useCreateVariable } from '@figma-vars/hooks';
 *
 * function CreateVariableButton() {
 *   const { mutate, isLoading, error } = useCreateVariable();
 *
 *   const handleCreate = () => {
 *     mutate({ name: 'new-variable', variableCollectionId: 'VariableCollectionId:1:1', resolvedType: 'COLOR' });
 *   };
 *
 *   if (isLoading) return <div>Creating...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   return <button onClick={handleCreate}>Create Variable</button>;
 * }
 * ```
 *
 * @public
 */
export const useCreateVariable = () => {
  const { token } = useFigmaTokenContext();
  const mutation = useMutation(async (payload: CreateVariablePayload) => {
    if (!token) {
      throw new Error(ERROR_MSG_TOKEN_REQUIRED);
    }
    return await mutator(
      FIGMA_POST_VARIABLES_ENDPOINT,
      token,
      "CREATE",
      payload as unknown as Record<string, unknown>,
    );
  });
  return mutation;
};
